"""Unified Socratic & Feynman Chat LangGraph Workflow.

Orchestrates pedagogical interaction:
RetrieveContext -> IntentRouter (Classifies 'ask' vs 'teach')
 -> SocraticAnswer (if 'ask': answers strictly from context with reflective questions)
 -> FeynmanCritique (if 'teach': scans for jargon/gaps, challenges with analogies, validates mastery)
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Literal

from langgraph.graph import END, StateGraph
from pydantic import ValidationError

from services.database import mongo_manager
from services.embedding_service import embedding_service
from services.llm_service import get_llm_service
from services.qdrant_service import qdrant_service
from workflows.state import ChatState, IntentClassificationModel

logger = logging.getLogger("mneme.workflows.chat")


def _extract_json_block(text: str) -> str:
    """Extract JSON object from string."""
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        return text[first_brace : last_brace + 1].strip()
    return text


def retrieve_context_node(state: ChatState) -> Dict[str, Any]:
    """Retrieve relevant ground-truth document chunks and deck knowledge from Qdrant with tenant isolation."""
    user_message = state.get("user_message", "").strip()
    user_id = state.get("user_id")
    deck_id = state.get("deck_id")
    document_id = state.get("document_id")

    if not user_id:
        raise ValueError("Tenant violation: user_id is missing from ChatState.")

    logger.info("Retrieving context for user '%s' in chat session (deck_id=%s, doc_id=%s)...", user_id, deck_id, document_id)
    query_vector = embedding_service.embed_text(user_message)

    auxiliary_deck_chunks: List[Dict[str, Any]] = []
    doc_ids: List[str] = []
    deck_title = None

    if deck_id and deck_id not in ("all", "default", ""):
        deck = mongo_manager.get_deck(deck_id, user_id)
        if deck:
            deck_title = deck.get("title")
            doc_ids = list(deck.get("document_ids") or [])
            if deck.get("document_id") and deck.get("document_id") not in doc_ids:
                doc_ids.append(deck.get("document_id"))

            # Include deck flashcards
            cards = deck.get("flashcards") or []
            if cards:
                cards_text = f"Deck '{deck_title}' Flashcards Summary:\n" + "\n".join(
                    f"- {c.get('front')} => {c.get('back')}" for c in cards[:12]
                )
                auxiliary_deck_chunks.append({"text": cards_text})

            # Include deck quizzes
            quizzes = deck.get("quizzes") or []
            if quizzes:
                quizzes_text = f"Deck '{deck_title}' Quiz Summary:\n" + "\n".join(
                    f"- {q.get('question')} (Key: {q.get('options', [''])[q.get('answer', 0)] if q.get('options') else ''})"
                    for q in quizzes[:6]
                )
                auxiliary_deck_chunks.append({"text": quizzes_text})
    elif document_id and document_id not in ("default", "all", ""):
        doc_ids = [document_id]

    chunks = qdrant_service.search_chunks(
        user_id=user_id,
        query_vector=query_vector,
        top_k=4,
        document_id=document_id if not doc_ids else None,
        document_ids=doc_ids if doc_ids else None,
    )

    all_chunks = chunks + auxiliary_deck_chunks

    if all_chunks:
        header = f"Active Study Deck: \"{deck_title}\"\n\n" if deck_title else ""
        formatted_context = header + "\n\n".join(
            f"[Source Note {i+1}]: {c.get('text', '')}" for i, c in enumerate(all_chunks)
        )
    else:
        formatted_context = f"No specific study notes or cards found for this query in deck '{deck_title or 'All'}'. Auditing using core scientific principles."

    return {"retrieved_context": formatted_context}


def intent_router_node(state: ChatState) -> Dict[str, Any]:
    """Lightweight LLM call determining if user is asking ('ask') or explaining/teaching ('teach')."""
    user_message = state.get("user_message", "").strip()

    system_instruction = (
        "You are an intent classifier for an AI educational tutor. "
        "Determine if the user is asking a question ('ask') or trying to explain/teach a concept ('teach'). "
        "Rules:\n"
        "- If the user asks for information, definitions, or queries ('What is...', 'How does...', 'Why...', '?'), classify as 'ask'.\n"
        "- If the user explains, summarizes, or presents a concept in their own words ('A binary search tree works by...', 'Virtual memory is allocated when...'), classify as 'teach'.\n"
        "Output ONLY a JSON object: {\"intent_type\": \"ask\"} or {\"intent_type\": \"teach\"}."
    )

    user_prompt = f"USER MESSAGE: \"{user_message}\"\n\nClassify intent:"

    llm = get_llm_service()
    raw_completion = llm.generate(
        prompt=user_prompt,
        system_prompt=system_instruction,
        max_new_tokens=60,
        temperature=0.0,
    )

    intent: Literal["ask", "teach"] = "teach"
    try:
        json_str = _extract_json_block(raw_completion)
        data = json.loads(json_str)
        validated = IntentClassificationModel(**data)
        intent = validated.intent_type
    except Exception as exc:
        logger.warning("Intent classification parse failed (%s). Using heuristic.", exc)
        if any(marker in user_message.lower() for marker in ["what", "how", "why", "when", "where", "can you", "?"]):
            intent = "ask"
        else:
            intent = "teach"

    logger.info("Classified user intent as: '%s'", intent)
    return {"intent_type": intent}


def socratic_answer_node(state: ChatState) -> Dict[str, Any]:
    """Answer student question using ONLY retrieved context, adding a Socratic reflection prompt."""
    user_message = state.get("user_message", "")
    context = state.get("retrieved_context", "")
    history = state.get("chat_history", [])

    system_instruction = (
        "You are Mneme's Socratic Recall Tutor. "
        "Your mission is to answer the user's question using ONLY the provided retrieved context. "
        "Never invent outside facts. "
        "Formulate your response in two parts: "
        "1. A clear, accurate direct answer derived strictly from the notes. "
        "2. A gentle, reflective follow-up question that prompts the user to think about the cause, effect, or analogy behind the answer."
    )

    history_str = "\n".join([f"{h.get('role', 'user')}: {h.get('text', '')}" for h in history[-4:]])
    user_prompt = (
        f"RETRIEVED STUDY NOTES CONTEXT:\n\"\"\"\n{context}\n\"\"\"\n\n"
        f"RECENT CONVERSATION:\n{history_str}\n\n"
        f"USER QUESTION: {user_message}\n\n"
        "Answer Socratically using ONLY the notes:"
    )

    llm = get_llm_service()
    response = llm.generate(
        prompt=user_prompt,
        system_prompt=system_instruction,
        max_new_tokens=512,
        temperature=0.2,
    )

    return {"ai_response": response}


def feynman_critique_node(state: ChatState) -> Dict[str, Any]:
    """Scan student's explanation against context: flag jargon, uncover missing steps, or validate mastery."""
    user_message = state.get("user_message", "")
    context = state.get("retrieved_context", "")
    history = state.get("chat_history", [])

    system_instruction = (
        "You are Richard Feynman mentoring a student using the Feynman Technique. "
        "The student is trying to teach a concept to you in plain English as if to a curious 10-year-old. "
        "Evaluate their explanation against the Ground Truth context:\n"
        "1. If they use complex technical jargon or buzzwords without explaining them, playfully challenge them to rephrase using everyday words.\n"
        "2. If an important mechanistic step or cause-and-effect relationship is missing, ask a sharp, targeted question to lead them to discover it.\n"
        "3. If their explanation is clear, accurate, and jargon-free, celebrate their mastery and challenge them to supply a memorable real-life analogy."
    )

    history_str = "\n".join([f"{h.get('role', 'user')}: {h.get('text', '')}" for h in history[-4:]])
    user_prompt = (
        f"GROUND TRUTH STUDY NOTES:\n\"\"\"\n{context}\n\"\"\"\n\n"
        f"RECENT CONVERSATION:\n{history_str}\n\n"
        f"STUDENT EXPLANATION: \"{user_message}\"\n\n"
        "Provide your Feynman critique or validation:"
    )

    llm = get_llm_service()
    response = llm.generate(
        prompt=user_prompt,
        system_prompt=system_instruction,
        max_new_tokens=512,
        temperature=0.3,
    )

    return {"ai_response": response}


def route_intent(state: ChatState) -> Literal["SocraticAnswer", "FeynmanCritique"]:
    """Route flow dynamically based on intent classification."""
    intent = state.get("intent_type", "teach")
    if intent == "ask":
        return "SocraticAnswer"
    return "FeynmanCritique"


def build_chat_graph() -> StateGraph:
    """Build and compile the Unified Socratic & Feynman Chat LangGraph."""
    workflow = StateGraph(ChatState)

    workflow.add_node("RetrieveContext", retrieve_context_node)
    workflow.add_node("IntentRouter", intent_router_node)
    workflow.add_node("SocraticAnswer", socratic_answer_node)
    workflow.add_node("FeynmanCritique", feynman_critique_node)

    # Entry: RetrieveContext -> IntentRouter
    workflow.set_entry_point("RetrieveContext")
    workflow.add_edge("RetrieveContext", "IntentRouter")

    # Dynamic branching
    workflow.add_conditional_edges(
        "IntentRouter",
        route_intent,
        {
            "SocraticAnswer": "SocraticAnswer",
            "FeynmanCritique": "FeynmanCritique",
        },
    )

    workflow.add_edge("SocraticAnswer", END)
    workflow.add_edge("FeynmanCritique", END)

    return workflow.compile()


# Pre-compiled chat graph singleton
chat_graph = build_chat_graph()

