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
    """Retrieve top-k ground truth chunks from Qdrant with mandatory user_id filtering."""
    user_id = state.get("user_id")
    document_id = state.get("document_id")
    emb = state.get("blurt_embedding") or []

    if not user_id:
        raise ValueError("Tenant violation: user_id is missing from BlurtState.")

    logger.info("Querying Qdrant for user '%s' and document '%s'...", user_id, document_id)
    chunks = qdrant_service.search_chunks(
        user_id=user_id,
        query_vector=emb,
        top_k=5,
        document_id=document_id,
    )
    logger.info("Retrieved %d relevant ground-truth chunks.", len(chunks))
    return {"retrieved_chunks": chunks}


def compare_llm_node(state: BlurtState) -> Dict[str, Any]:
    """Invoke Gemma 2B to compare user blurt with retrieved chunks and produce semantic diff."""
    blurt_text = state.get("blurt_text", "")
    retrieved_chunks = state.get("retrieved_chunks", [])

    # Assemble ground truth context
    context_texts = [f"Chunk {i+1}:\n{c.get('text', '')}" for i, c in enumerate(retrieved_chunks)]
    ground_truth = "\n\n".join(context_texts) if context_texts else "General domain knowledge."

    system_instruction = (
        "You are an elite cognitive neuroscience active-recall auditor. "
        "Your task is to perform a semantic difference evaluation between the Ground Truth study notes "
        "and the Student's Recall Blurt. "
        "Extract: "
        "1. 'recalled_concepts': Important facts, principles, or keywords the student successfully retrieved. "
        "2. 'missed_concepts': High-yield facts, mechanisms, or keywords present in the Ground Truth that the student omitted or misstated. "
        "Output ONLY a valid JSON object with exact keys 'recalled_concepts' and 'missed_concepts':\n"
        '{"recalled_concepts": ["concept 1", "concept 2"], "missed_concepts": ["concept 3", "concept 4"]}'
    )

    user_prompt = (
        f"GROUND TRUTH SOURCE NOTES:\n\"\"\"\n{ground_truth[:3000]}\n\"\"\"\n\n"
        f"STUDENT RECALL BLURT:\n\"\"\"\n{blurt_text}\n\"\"\"\n\n"
        "Evaluate the recall blurt and output the semantic diff JSON."
    )

    llm = get_llm_service()
    raw_completion = llm.generate(
        prompt=user_prompt,
        system_prompt=system_instruction,
        max_new_tokens=512,
        temperature=0.1,
    )

    # Parse and validate with Pydantic
    try:
        json_str = _extract_json_block(raw_completion)
        data = json.loads(json_str)
        validated = BlurtEvaluationModel(**data)
        recalled = validated.recalled_concepts
        missed = validated.missed_concepts
    except (json.JSONDecodeError, ValidationError, Exception) as exc:
        logger.warning("Failed to parse Blurt JSON response (%s). Applying heuristic extraction.", exc)
        # Heuristic fallback parsing
        lower_blurt = blurt_text.lower()
        candidate_words = set(re.findall(r"\b[a-zA-Z]{5,}\b", ground_truth.lower()))
        recalled = [w for w in candidate_words if w in lower_blurt][:6]
        missed = [w for w in candidate_words if w not in lower_blurt][:6]

    return {
        "recalled_concepts": recalled,
        "missed_concepts": missed,
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

