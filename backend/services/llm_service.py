"""Singleton LLM Service for Mneme using LangChain GroqCloud (Qwen 2.5 / 3.8 27B).

Provides blazing-fast, low-latency, and high-fidelity generation for:
1. Active recall flashcard extraction
2. Diagnostic quiz generation with structured rationale
3. Blurt mode semantic diff comparison
4. Unified Socratic and Feynman cognitive tutoring via SSE streaming
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from typing import Any, Dict, Generator, List, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from config import settings

logger = logging.getLogger("mneme.llm")


class LLMService:
    """Thread-safe Singleton Manager for GroqCloud LLM (Qwen 27B)."""

    _instance: Optional[LLMService] = None
    _lock: threading.Lock = threading.Lock()

    def __init__(self) -> None:
        """Private initializer. Use get_instance() instead."""
        if LLMService._instance is not None:
            raise RuntimeError("LLMService is a singleton. Call LLMService.get_instance().")

        self.api_key = settings.GROQ_API_KEY
        self.model_name = settings.GROQ_MODEL or "qwen/qwen3.8-27b"
        self.temperature = settings.LLM_TEMPERATURE
        # Enforce max 700 tokens for Qwen 27B to stay comfortably under Groq's 1000 OTPM rate limit
        configured_tokens = settings.LLM_MAX_NEW_TOKENS
        if "qwen" in self.model_name.lower():
            self.max_tokens = min(configured_tokens, 700)
        else:
            self.max_tokens = configured_tokens
        self.is_loaded = False
        self.fallback_mode = False
        self._client: Optional[ChatGroq] = None
        self._init_client()

    @classmethod
    def get_instance(cls) -> LLMService:
        """Thread-safe accessor for the LLMService singleton."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _get_safe_tokens(self, requested: Optional[int] = None) -> int:
        """Ensure token limit satisfies Groq model quotas."""
        limit = requested if requested is not None else self.max_tokens
        if "qwen" in self.model_name.lower():
            return min(limit, 700)
        return limit

    def _init_client(self) -> None:
        """Initialize LangChain ChatGroq client."""
        if not self.api_key:
            logger.warning("GROQ_API_KEY is not set. LLMService will use fallback generator.")
            self.fallback_mode = True
            self.is_loaded = True
            return

        try:
            safe_tokens = self._get_safe_tokens(self.max_tokens)
            self._client = ChatGroq(
                groq_api_key=self.api_key,
                model_name=self.model_name,
                temperature=self.temperature,
                max_tokens=safe_tokens,
            )
            self.is_loaded = True
            self.fallback_mode = False
            logger.info("ChatGroq successfully initialized with model '%s' (max_tokens=%d).", self.model_name, safe_tokens)
        except Exception as exc:
            logger.error("Failed to initialize ChatGroq (%s). Activating fallback mode.", exc)
            self.fallback_mode = True
            self.is_loaded = True

    def _build_messages(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
    ) -> List[BaseMessage]:
        """Construct LangChain messages list."""
        messages: List[BaseMessage] = []
        if system_prompt and system_prompt.strip():
            messages.append(SystemMessage(content=system_prompt.strip()))
        messages.append(HumanMessage(content=prompt.strip()))
        return messages

    def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_new_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> str:
        """Synchronously generate text completion from GroqCloud LLM with retry support."""
        if self.fallback_mode or self._client is None:
            return self._fallback_generate(prompt, system_prompt)

        messages = self._build_messages(prompt, system_prompt)
        safe_tokens = self._get_safe_tokens(max_new_tokens)
        temp = temperature if temperature is not None else self.temperature

        for attempt in range(2):
            try:
                client = ChatGroq(
                    groq_api_key=self.api_key,
                    model_name=self.model_name,
                    temperature=temp,
                    max_tokens=safe_tokens,
                )
                response = client.invoke(messages)
                return response.content if isinstance(response.content, str) else str(response.content)

            except Exception as exc:
                err_str = str(exc)
                if "429" in err_str or "rate_limit_exceeded" in err_str:
                    logger.warning("Groq rate limit on attempt %d: %s. Backing off...", attempt + 1, exc)
                    import time
                    time.sleep(2.0)
                    safe_tokens = min(safe_tokens, 500)
                    continue

                logger.error("Groq generation failed (%s). Falling back.", exc)
                return self._fallback_generate(prompt, system_prompt)

        return self._fallback_generate(prompt, system_prompt)

    def generate_stream(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_new_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> Generator[str, None, None]:
        """Stream generated tokens in real time from GroqCloud."""
        if self.fallback_mode or self._client is None:
            full_text = self._fallback_generate(prompt, system_prompt)
            words = full_text.split(" ")
            for i, word in enumerate(words):
                yield word + (" " if i < len(words) - 1 else "")
            return

        messages = self._build_messages(prompt, system_prompt)
        safe_tokens = self._get_safe_tokens(max_new_tokens)
        temp = temperature if temperature is not None else self.temperature

        try:
            client = ChatGroq(
                groq_api_key=self.api_key,
                model_name=self.model_name,
                temperature=temp,
                max_tokens=safe_tokens,
            )

            for chunk in client.stream(messages):
                if chunk.content:
                    yield chunk.content

        except Exception as exc:
            logger.error("Groq streaming failed (%s). Yielding fallback tokens.", exc)
            fallback = self._fallback_generate(prompt, system_prompt)
            for part in fallback.split(" "):
                yield part + " "

    def _fallback_generate(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        """Resilient fallback generator for offline testing."""
        lower_prompt = prompt.lower()
        system_lower = (system_prompt or "").lower()

        # Extract study notes if wrapped in triple quotes
        notes_match = re.search(r'"""([\s\S]*?)"""', prompt)
        source_text = notes_match.group(1).strip() if notes_match else prompt

        raw_candidates = [
            s.strip()
            for s in re.split(r"[.\n;]", source_text)
            if len(s.strip()) >= 35 and len(s.strip().split()) >= 6
        ]
        # Filter out metadata, affiliations, page headers
        bad_starters = ("http", "www", "department", "university", "faculty", "page", "author", "isbn", "arxiv", "fig", "table", "vol", "no.", "dr.", "prof.")
        sentences = [
            s for s in raw_candidates
            if not s.lower().startswith(bad_starters)
            and not re.match(r"^[\d\W_]+$", s)
        ]

        # 1. Quiz JSON generation fallback
        if "quiz" in lower_prompt or "quiz" in system_lower or "multiple-choice" in system_lower:
            questions = []
            if sentences:
                for idx, sent in enumerate(sentences[:4]):
                    words = sent.split()
                    subject = " ".join(words[:4]) if len(words) >= 4 else "This key topic"
                    questions.append({
                        "question": f"Which statement accurately explains {subject}?",
                        "options": [
                            sent,
                            f"It contradicts {subject} under standard theoretical assumptions.",
                            f"It has zero mathematical or practical connection to {subject}.",
                            f"None of the provided options accurately describe {subject}.",
                        ],
                        "answer": 0,
                        "explanation": f"According to your source material: '{sent}'.",
                    })
            else:
                questions.append({
                    "question": "What is the primary conclusion of the notes?",
                    "options": [
                        "The primary conclusion provided in the source material",
                        "An unsupported secondary hypothesis",
                        "An unrelated historical principle",
                        "None of the above",
                    ],
                    "answer": 0,
                    "explanation": "Extracted directly from study notes.",
                })
            return json.dumps(questions, indent=2)

        # 2. Flashcard JSON generation fallback
        if "flashcard" in lower_prompt or "flashcard" in system_lower or "front" in system_lower:
            cards = []
            if sentences:
                for idx, sent in enumerate(sentences[:6]):
                    words = sent.split()
                    concept = " ".join(words[:4]) if len(words) >= 4 else sent
                    cards.append({
                        "front": f"Explain the principle: {concept}",
                        "back": sent,
                    })
            else:
                cards.append({
                    "front": "Key concept definition",
                    "back": "Detailed summary extracted from provided notes.",
                })
            return json.dumps(cards, indent=2)

        # 3. Intent classification fallback
        if "classify the user's intent" in lower_prompt or "intent_type" in lower_prompt:
            if any(q in lower_prompt for q in ["what", "how", "why", "when", "can you", "where", "?"]):
                return '{"intent_type": "ask"}'
            return '{"intent_type": "teach"}'

        # 4. Blurt semantic evaluation fallback
        if "compare" in lower_prompt or "blurt" in lower_prompt or "missed_concepts" in lower_prompt:
            return json.dumps({
                "recalled_concepts": ["core theory", "derivation", "algorithmic efficiency"],
                "missed_concepts": ["boundary constraints", "convergence guarantees"],
            })

        # 5. Default conversational tutor response
        return (
            "Based on your study notes, here is the key concept: "
            + (sentences[0] if sentences else "Focus on core principles and practice active retrieval.")
        )



def get_llm_service() -> LLMService:
    """Return the global LLMService singleton instance."""
    return LLMService.get_instance()
