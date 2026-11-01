"""State Definitions and Pydantic Validation Schemas for LangGraph Workflows.

Defines typed states for Flashcard/Quiz Generation, Blurt Mode Evaluation,
and the Unified Socratic & Feynman Chat Graph.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, TypedDict
from pydantic import BaseModel, Field, field_validator


# ============================================================================
# Pydantic Schemas for Validation
# ============================================================================

class FlashcardItem(BaseModel):
    """Single active recall flashcard item."""
    front: str = Field(..., description="Prompt, question, or stimulus on the front of the card")
    back: str = Field(..., description="Target recall concept, explanation, or definition")


class FlashcardDeckModel(BaseModel):
    """Collection of flashcards generated from document notes."""
    cards: List[FlashcardItem] = Field(..., min_length=1, description="List of generated flashcards")


class QuizOptionItem(BaseModel):
    """Single multiple-choice question item."""
    question: str = Field(..., description="The query or conceptual test question")
    options: List[str] = Field(..., min_length=2, max_length=5, description="Choices for the question")
    answer: int = Field(..., ge=0, description="0-indexed position of the correct option")
    explanation: str = Field(..., description="Pedagogical explanation of why this answer is correct")

    @field_validator("answer")
    def validate_answer_index(cls, v: int, info: Any) -> int:
        options = info.data.get("options")
        if options and v >= len(options):
            raise ValueError(f"Answer index {v} exceeds number of options ({len(options)})")
        return v


class QuizDeckModel(BaseModel):
    """Collection of multiple-choice quiz questions."""
    questions: List[QuizOptionItem] = Field(..., min_length=1, description="List of quiz questions")


class BlurtEvaluationModel(BaseModel):
    """Semantic diff result from Blurt mode comparing recall against ground truth."""
    recalled_concepts: List[str] = Field(default_factory=list, description="Key concepts successfully recalled")
    missed_concepts: List[str] = Field(default_factory=list, description="Key ground-truth concepts absent in blurt")
    score: int = Field(default=0, ge=0, le=100, description="Quantitative retention score from 0 to 100")
    feedback: str = Field(default="", description="Diagnostic assessment of conceptual strengths and critical gaps")


class IntentClassificationModel(BaseModel):
    """Classification of user input intent."""
    intent_type: Literal["ask", "teach"] = Field(
        ...,
        description="'ask' if the user is asking a question; 'teach' if explaining a concept"
    )


# ============================================================================
# LangGraph TypedDict States
# ============================================================================

class GeneratorState(TypedDict):
    """State for the Flashcard & Quiz LangGraph generator."""
    raw_text: str
    document_id: str
    mode: Literal["flashcards", "quiz"]
    prompt: str
    llm_output: str
    parsed_output: Optional[Dict[str, Any]]
    error_message: Optional[str]
    retry_count: int
    is_valid: bool


class BlurtState(TypedDict):
    """State for Blurt Mode semantic difference graph."""
    user_id: str
    document_id: str
    blurt_text: str
    blurt_embedding: Optional[List[float]]
    retrieved_chunks: List[Dict[str, Any]]
    recalled_concepts: List[str]
    missed_concepts: List[str]
    score: int
    feedback: str
    raw_llm_output: Optional[str]


class ChatState(TypedDict):
    """State for the Unified Socratic & Feynman Chat Graph."""
    user_message: str
    chat_history: List[Dict[str, str]]
    retrieved_context: str
    intent_type: Literal["ask", "teach", ""]
    ai_response: str
    user_id: str
    document_id: Optional[str]
    session_id: Optional[str]

