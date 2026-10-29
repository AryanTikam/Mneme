"""Unit tests for LangGraph state machine workflows."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from workflows.blurt_graph import blurt_graph
from workflows.chat_graph import chat_graph, intent_router_node
from workflows.generator_graph import generator_graph
from workflows.state import FlashcardDeckModel, QuizDeckModel


def test_generator_graph_flashcards():
    """Verify Flashcard generation LangGraph creates validated flashcards."""
    sample_text = (
        "The hippocampus is a complex brain structure embedded deep into temporal lobe. "
        "It has a major role in learning and memory. It is a plastic and vulnerable structure "
        "that gets damaged by a variety of stimuli. Long-term potentiation (LTP) is a persistent "
        "strengthening of synapses based on recent patterns of activity."
    )

    initial_state = {
        "raw_text": sample_text,
        "document_id": "doc_test_101",
        "mode": "flashcards",
        "prompt": "",
        "llm_output": "",
        "parsed_output": None,
        "error_message": None,
        "retry_count": 0,
        "is_valid": False,
    }

    final_state = generator_graph.invoke(initial_state)

    assert final_state["is_valid"] is True
    assert final_state["parsed_output"] is not None
    assert "cards" in final_state["parsed_output"]
    cards = final_state["parsed_output"]["cards"]
    assert len(cards) > 0
    # Verify Pydantic schema validation passes
    deck = FlashcardDeckModel(cards=cards)
    assert len(deck.cards) > 0
    assert deck.cards[0].front
    assert deck.cards[0].back


def test_generator_graph_quiz():
    """Verify Quiz generation LangGraph creates validated MCQs."""
    sample_text = (
        "Spaced repetition is an evidence-based learning technique that incorporates "
        "increasing intervals of time between subsequent review of previously learned material. "
        "The testing effect demonstrates that active retrieval practice produces superior "
        "long-term retention compared to passive study techniques such as re-reading."
    )

    initial_state = {
        "raw_text": sample_text,
        "document_id": "doc_test_102",
        "mode": "quiz",
        "prompt": "",
        "llm_output": "",
        "parsed_output": None,
        "error_message": None,
        "retry_count": 0,
        "is_valid": False,
    }

    final_state = generator_graph.invoke(initial_state)

    assert final_state["is_valid"] is True
    assert final_state["parsed_output"] is not None
    assert "questions" in final_state["parsed_output"]
    questions = final_state["parsed_output"]["questions"]
    assert len(questions) > 0
    deck = QuizDeckModel(questions=questions)
    assert len(deck.questions[0].options) >= 2


def test_blurt_graph_evaluation():
    """Verify Blurt Mode LangGraph semantic difference evaluation."""
    initial_state = {
        "user_id": "test_user_blurt",
        "document_id": "doc_blurt_test",
        "blurt_text": "The hippocampus is responsible for memory consolidation and working with short term traces.",
        "blurt_embedding": None,
        "retrieved_chunks": [
            {"text": "The hippocampus consolidates short-term memories into long-term storage via long-term potentiation."},
            {"text": "Spaced repetition combats the Ebbinghaus forgetting curve by scheduling expanding review intervals."}
        ],
        "recalled_concepts": [],
        "missed_concepts": [],
        "raw_llm_output": None,
    }

    final_state = blurt_graph.invoke(initial_state)

    assert "recalled_concepts" in final_state
    assert "missed_concepts" in final_state
    assert isinstance(final_state["recalled_concepts"], list)
    assert isinstance(final_state["missed_concepts"], list)


def test_chat_graph_intent_router_and_execution():
    """Verify IntentRouter logic and Unified Chat Graph execution."""
    # Test 'ask' intent
    state_ask = {
        "user_message": "What is the function of the hippocampus?",
        "chat_history": [],
        "retrieved_context": "The hippocampus binds declarative memories.",
        "intent_type": "",
        "ai_response": "",
        "user_id": "test_user_chat",
        "document_id": "doc_test",
        "session_id": "sess_1",
    }

    classified_ask = intent_router_node(state_ask)
    assert classified_ask["intent_type"] == "ask"

    final_state_ask = chat_graph.invoke(state_ask)
    assert final_state_ask["intent_type"] == "ask"
    assert len(final_state_ask["ai_response"]) > 0

    # Test 'teach' intent
    state_teach = {
        "user_message": "Memory consolidation works because the hippocampus temporarily holds information before transferring it to the cortex.",
        "chat_history": [],
        "retrieved_context": "The hippocampus temporarily holds traces and consolidates them to the neocortex.",
        "intent_type": "",
        "ai_response": "",
        "user_id": "test_user_chat",
        "document_id": "doc_test",
        "session_id": "sess_2",
    }

    classified_teach = intent_router_node(state_teach)
    assert classified_teach["intent_type"] == "teach"

    final_state_teach = chat_graph.invoke(state_teach)
    assert final_state_teach["intent_type"] == "teach"
    assert len(final_state_teach["ai_response"]) > 0

