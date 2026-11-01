"""Flashcard and Quiz Generator LangGraph Workflow.

Implements iterative self-correction loop:
Generate (Groq Qwen 27B) -> ValidateJSON (Pydantic) -> loop back if invalid (max 3 retries).
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Literal, Optional

from langgraph.graph import END, StateGraph
from pydantic import ValidationError

from services.llm_service import get_llm_service
from workflows.state import (
    FlashcardDeckModel,
    FlashcardItem,
    GeneratorState,
    QuizDeckModel,
    QuizOptionItem,
)

logger = logging.getLogger("mneme.workflows.generator")


def _extract_json_block(text: str) -> str:
    """Robustly extract a JSON array or object from LLM response text."""
    text = text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    first_bracket = min(
        [idx for idx in [text.find("["), text.find("{")] if idx != -1],
        default=-1,
    )
    last_bracket = max(text.rfind("]"), text.rfind("}"))
    if first_bracket != -1 and last_bracket > first_bracket:
        return text[first_bracket : last_bracket + 1].strip()
    return text


def _robust_parse_json(text: str) -> Any:
    """Parse JSON with automatic structural recovery for unclosed arrays."""
    extracted = _extract_json_block(text)
    try:
        return json.loads(extracted)
    except json.JSONDecodeError:
        # If output was truncated before closing ']', repair at last valid object '}'
        if "[" in extracted:
            start_bracket = extracted.find("[")
            last_brace = extracted.rfind("}")
            if last_brace > start_bracket:
                repaired = extracted[start_bracket : last_brace + 1] + "]"
                try:
                    return json.loads(repaired)
                except Exception:
                    pass
        raise


def generate_node(state: GeneratorState) -> Dict[str, Any]:
    """Invoke Groq Qwen 27B to generate structured JSON for flashcards or quiz items."""
    mode = state.get("mode", "flashcards")
    raw_text = state.get("raw_text", "")
    retry_count = state.get("retry_count", 0)
    error_message = state.get("error_message")
    previous_output = state.get("llm_output", "")

    # Base prompt instructions with explicit target item counts to respect token quotas
    if mode == "flashcards":
        system_instruction = (
            "You are an expert cognitive learning assistant. Create exactly 5 high-yield active recall flashcards "
            "based strictly on the provided study notes. Focus exclusively on core technical concepts, principles, "
            "formulas, algorithms, derivations, definitions, and mechanisms.\n"
            "CRITICAL QUALITY RULES:\n"
            "- Front and Back MUST be complete, grammatically sound, self-contained sentences or questions.\n"
            "- NEVER output incomplete sentence fragments (e.g., 'Explain the principle: This reveals an important').\n"
            "- Do NOT create cards about author names, college affiliations, department titles (e.g., 'Department of Computer'), emails, or publication dates.\n"
            "Each flashcard must have a concise 'front' question and a concise 'back' answer.\n"
            "Output ONLY a valid JSON array of 5 objects:\n"
            '[{"front": "Question...", "back": "Answer..."}]'
        )
    else:
        system_instruction = (
            "You are an expert university examiner. Generate exactly 4 multiple-choice diagnostic quiz questions based strictly on the provided study notes.\n"
            "Focus exclusively on core concepts, theoretical principles, equations, mechanisms, and key results.\n"
            "CRITICAL QUALITY RULES:\n"
            "- Questions and options MUST be complete, grammatically sound statements.\n"
            "- NEVER create questions about author names, college or department names (e.g., 'Department of Computer'), email addresses, or document headers.\n"
            "- Distractors must be plausible conceptual alternatives.\n"
            "Each item must contain 'question', 'options' (array of 4 distinct choices with 1 correct answer and 3 plausible distractors), "
            "'answer' (0-indexed integer of the correct option: 0, 1, 2, or 3), "
            "and 'explanation' (detailed explanation of why the correct option is right).\n"
            "Output ONLY a valid JSON array of 4 objects:\n"
            '[{"question": "...", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "..."}]'
        )

    # Base user prompt
    user_prompt = f"STUDY NOTES:\n\"\"\"\n{raw_text[:3500]}\n\"\"\"\n\nGenerate high-yield {mode} in JSON."

    # If retrying, prepend error correction guidance
    if retry_count > 0 and error_message:
        correction_guidance = (
            f"\n\nCRITICAL FIX REQUIRED (Attempt {retry_count + 1}/3):\n"
            f"Your previous JSON output failed validation with the following error:\n{error_message}\n"
            f"Previous raw output was:\n{previous_output[:500]}\n"
            "Respond ONLY with the corrected, valid JSON array. Do not include introductory or explanatory conversational text."
        )
        user_prompt += correction_guidance

    logger.info("Running generate_node for mode '%s' (Attempt %d)...", mode, retry_count + 1)
    llm = get_llm_service()
    raw_completion = llm.generate(
        prompt=user_prompt,
        system_prompt=system_instruction,
        max_new_tokens=650,
        temperature=0.1,  # Lower temperature for strict JSON adherence
    )

    return {"llm_output": raw_completion}


def validate_json_node(state: GeneratorState) -> Dict[str, Any]:
    """Validate the raw LLM output against Pydantic schemas with auto-repair."""
    raw_output = state.get("llm_output", "")
    mode = state.get("mode", "flashcards")
    current_retries = state.get("retry_count", 0)

    try:
        parsed_data = _robust_parse_json(raw_output)

        # Allow single list or wrapped object
        if isinstance(parsed_data, dict):
            if mode == "flashcards" and "cards" in parsed_data:
                parsed_list = parsed_data["cards"]
            elif mode == "quiz" and "questions" in parsed_data:
                parsed_list = parsed_data["questions"]
            else:
                # First list found in values
                lists = [v for v in parsed_data.values() if isinstance(v, list)]
                parsed_list = lists[0] if lists else [parsed_data]
        elif isinstance(parsed_data, list):
            parsed_list = parsed_data
        else:
            raise ValueError("Expected a JSON array of items.")

        if not parsed_list:
            raise ValueError("Parsed item list is empty.")

        # Validate with Pydantic
        if mode == "flashcards":
            validated_cards = [FlashcardItem(**item).model_dump() for item in parsed_list]
            logger.info("Successfully validated %d flashcards.", len(validated_cards))
            return {
                "is_valid": True,
                "parsed_output": {"cards": validated_cards},
                "error_message": None,
            }
        else:
            validated_quiz = [QuizOptionItem(**item).model_dump() for item in parsed_list]
            logger.info("Successfully validated %d quiz items.", len(validated_quiz))
            return {
                "is_valid": True,
                "parsed_output": {"questions": validated_quiz},
                "error_message": None,
            }

    except (json.JSONDecodeError, ValidationError, ValueError, Exception) as exc:
        logger.warning("Validation failed on attempt %d: %s", current_retries + 1, exc)
        return {
            "is_valid": False,
            "error_message": str(exc),
            "retry_count": current_retries + 1,
        }


def validation_router(state: GeneratorState) -> Literal["retry", "end"]:
    """Conditional router: loop back to generate_node on failure (up to 3 retries)."""
    if state.get("is_valid"):
        return "end"

    if state.get("retry_count", 0) < 3:
        logger.info("Looping back to generate_node with error feedback (retry %d/3).", state.get("retry_count"))
        return "retry"

    logger.error("Max retries (3) reached. Terminating generator graph with fallback structure.")
    return "end"


def build_generator_graph() -> StateGraph:
    """Build and compile the Flashcard/Quiz LangGraph workflow."""
    workflow = StateGraph(GeneratorState)

    # Register nodes
    workflow.add_node("Generate", generate_node)
    workflow.add_node("ValidateJSON", validate_json_node)

    # Flow: Start -> Generate -> ValidateJSON
    workflow.set_entry_point("Generate")
    workflow.add_edge("Generate", "ValidateJSON")

    # Conditional edge: ValidateJSON -> (Generate if invalid & retry < 3, else END)
    workflow.add_conditional_edges(
        "ValidateJSON",
        validation_router,
        {
            "retry": "Generate",
            "end": END,
        },
    )

    return workflow.compile()


# Pre-compiled generator graph singleton
generator_graph = build_generator_graph()

