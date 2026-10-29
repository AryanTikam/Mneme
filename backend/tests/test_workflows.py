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
        "Relational database management systems organize data into structured tables linked by primary and foreign keys. "
        "Database normalization reduces data redundancy and improves data integrity through normal forms. "
        "ACID transactions guarantee atomicity, consistency, isolation, and durability across concurrent operations."
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
        "Operating system kernels coordinate process concurrency, manage virtual memory pagination, and control device drivers. "
        "Context switching allows the CPU to transition execution between distinct processes by saving and restoring thread registers."
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
        "blurt_text": "Binary search trees maintain sorted order with logarithmic search time complexity on balanced structures.",
        "blurt_embedding": None,
        "retrieved_chunks": [
            {"text": "A self-balancing binary search tree such as an AVL or Red-Black tree guarantees O(log n) search, insertion, and deletion operations."},
            {"text": "Tree traversals include in-order, pre-order, and post-order depth-first search strategies."}
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
        "user_message": "What is a hash collision in data structures?",
        "chat_history": [],
        "retrieved_context": "Hash tables map keys to buckets, and collisions occur when two keys produce the same hash index.",
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
        "user_message": "Hash tables map arbitrary keys to integer buckets using a hash function, resolving collisions via separate chaining.",
        "chat_history": [],
        "retrieved_context": "Hash tables resolve collisions using separate chaining or open addressing with probing sequences.",
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

