"""Blurt Mode LangGraph Workflow for Mneme.

Orchestrates cognitive audit:
EmbedUserBlurt -> QueryQdrant (strict tenant isolation) -> CompareLLM (semantic diff).
Identifies recalled_concepts and missed_concepts against source notes.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List

from langgraph.graph import END, StateGraph
from pydantic import ValidationError

from services.database import mongo_manager
from services.embedding_service import embedding_service
from services.llm_service import get_llm_service
from services.qdrant_service import qdrant_service
from workflows.state import BlurtEvaluationModel, BlurtState

logger = logging.getLogger("mneme.workflows.blurt")


def _extract_json_block(text: str) -> str:
    """Extract JSON object from completion text."""
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        return text[first_brace : last_brace + 1].strip()
    return text


def embed_user_blurt_node(state: BlurtState) -> Dict[str, Any]:
    """Generate dense vector embedding of the user's recall blurt text."""
    blurt_text = state.get("blurt_text", "").strip()
    logger.info("Embedding user blurt text (length: %d chars)...", len(blurt_text))
    emb = embedding_service.embed_text(blurt_text)
    return {"blurt_embedding": emb}


def query_qdrant_node(state: BlurtState) -> Dict[str, Any]:
    """Retrieve ground truth chunks bounded by user_id and deck/document contexts."""
    user_id = state.get("user_id")
    deck_id = state.get("deck_id")
    document_id = state.get("document_id")
    emb = state.get("blurt_embedding") or []

    if not user_id:
        raise ValueError("Tenant violation: user_id is missing from BlurtState.")

    retrieved_chunks = []
    auxiliary_deck_chunks = []
    doc_ids: List[str] = []

    if deck_id and deck_id not in ("all", "default", ""):
        deck = mongo_manager.get_deck(deck_id, user_id)
        if deck:
            logger.info("Resolving contexts and knowledge for deck '%s' (%s)...", deck.get("title"), deck_id)
            doc_ids = list(deck.get("document_ids") or [])
            if deck.get("document_id") and deck.get("document_id") not in doc_ids:
                doc_ids.append(deck.get("document_id"))

            # Extract deck flashcard content
            cards = deck.get("flashcards") or []
            if cards:
                card_summary = f"Deck '{deck.get('title')}' Flashcards Content:\n" + "\n".join(
                    f"- Question: {c.get('front')} | Answer: {c.get('back')}" for c in cards[:15]
                )
                auxiliary_deck_chunks.append({"text": card_summary, "source": "deck_cards"})

            # Extract deck quiz content
            quizzes = deck.get("quizzes") or []
            if quizzes:
                quiz_summary = f"Deck '{deck.get('title')}' Quiz Content:\n" + "\n".join(
                    f"- {q.get('question')} | Key: {q.get('options', [''])[q.get('answer', 0)] if q.get('options') else ''} ({q.get('explanation', '')})"
                    for q in quizzes[:8]
                )
                auxiliary_deck_chunks.append({"text": quiz_summary, "source": "deck_quizzes"})
    elif document_id and document_id not in ("default", "all", ""):
        doc_ids = [document_id]

    logger.info("Querying Qdrant for user '%s', doc_ids=%s, deck_id=%s...", user_id, doc_ids, deck_id)
    chunks = qdrant_service.search_chunks(
        user_id=user_id,
        query_vector=emb,
        top_k=5,
        document_id=document_id if not doc_ids else None,
        document_ids=doc_ids if doc_ids else None,
    )
    retrieved_chunks.extend(chunks)
    retrieved_chunks.extend(auxiliary_deck_chunks)

    logger.info("Assembled %d total ground-truth chunks for blurt audit.", len(retrieved_chunks))
    return {"retrieved_chunks": retrieved_chunks}


def compare_llm_node(state: BlurtState) -> Dict[str, Any]:
    """Invoke Groq Qwen 27B to compare user blurt with retrieved chunks and produce semantic diff."""
    blurt_text = state.get("blurt_text", "").strip()
    retrieved_chunks = state.get("retrieved_chunks", [])

    if not retrieved_chunks:
        return {
            "recalled_concepts": [],
            "missed_concepts": [],
            "score": 0,
            "feedback": "No uploaded source document chunks were found for this topic. Please upload a study PDF or select an active document to audit your recall.",
            "raw_llm_output": "",
        }

    # Assemble ground truth context
    context_texts = [f"[Note Segment {i+1}]:\n{c.get('text', '')}" for i, c in enumerate(retrieved_chunks)]
    ground_truth = "\n\n".join(context_texts)

    system_instruction = (
        "You are an expert cognitive evaluator and active-recall auditor. "
        "Compare the Student's Recall Blurt against the Ground Truth Study Notes. "
        "Requirements:\n"
        "1. 'recalled_concepts': Specific high-yield concepts, facts, formulas, or mechanisms from the notes that the student accurately retrieved or explained in their own words.\n"
        "2. 'missed_concepts': Crucial concepts, steps, or principles present in the Ground Truth notes that the student omitted or misstated.\n"
        "3. 'score': An integer percentage (0-100) reflecting the student's conceptual coverage of the ground truth material.\n"
        "4. 'feedback': 2-3 concise sentences of constructive coaching highlighting what they mastered and the exact conceptual gap to review next.\n\n"
        "Output ONLY a valid JSON object with exact keys 'recalled_concepts', 'missed_concepts', 'score', and 'feedback'. "
        "No conversational preamble, markdown fences, or postscript."
    )

    user_prompt = (
        f"GROUND TRUTH SOURCE NOTES:\n\"\"\"\n{ground_truth[:3500]}\n\"\"\"\n\n"
        f"STUDENT RECALL BLURT:\n\"\"\"\n{blurt_text}\n\"\"\"\n\n"
        "Evaluate the recall blurt and output the semantic diff JSON:"
    )

    llm = get_llm_service()
    raw_completion = llm.generate(
        prompt=user_prompt,
        system_prompt=system_instruction,
        max_new_tokens=650,
        temperature=0.1,
    )

    recalled = []
    missed = []
    score = 0
    feedback = ""

    # Parse and validate with Pydantic
    try:
        json_str = _extract_json_block(raw_completion)
        data = json.loads(json_str)
        validated = BlurtEvaluationModel(**data)
        recalled = validated.recalled_concepts
        missed = validated.missed_concepts
        score = validated.score
        feedback = validated.feedback
        # Sanity check score if LLM omitted or zeroed with items present
        if score == 0 and (recalled or missed):
            total_items = len(recalled) + len(missed)
            score = round((len(recalled) / total_items) * 100) if total_items > 0 else 0
    except (json.JSONDecodeError, ValidationError, Exception) as exc:
        logger.warning("Failed to parse Blurt JSON response (%s). Applying robust semantic extraction.", exc)
        stopwords = {"this", "that", "these", "those", "their", "there", "which", "where", "about", "could", "would", "should"}
        gt_terms = [w for w in set(re.findall(r"\b[a-zA-Z]{5,}\b", ground_truth.lower())) if w not in stopwords]
        blurt_lower = blurt_text.lower()
        recalled = [t for t in gt_terms if t in blurt_lower][:6]
        missed = [t for t in gt_terms if t not in blurt_lower][:6]
        total = len(recalled) + len(missed)
        score = round((len(recalled) / total) * 100) if total > 0 else 50
        feedback = f"Identified {len(recalled)} concepts successfully recalled. Review the highlighted missed concepts to reinforce long-term memory."

    return {
        "recalled_concepts": recalled,
        "missed_concepts": missed,
        "score": score,
        "feedback": feedback,
        "raw_llm_output": raw_completion,
    }


def build_blurt_graph() -> StateGraph:
    """Build and compile the Blurt Mode LangGraph."""
    workflow = StateGraph(BlurtState)

    workflow.add_node("EmbedUserBlurt", embed_user_blurt_node)
    workflow.add_node("QueryQdrant", query_qdrant_node)
    workflow.add_node("CompareLLM", compare_llm_node)

    # Linear pipeline
    workflow.set_entry_point("EmbedUserBlurt")
    workflow.add_edge("EmbedUserBlurt", "QueryQdrant")
    workflow.add_edge("QueryQdrant", "CompareLLM")
    workflow.add_edge("CompareLLM", END)

    return workflow.compile()


# Pre-compiled blurt graph singleton
blurt_graph = build_blurt_graph()

