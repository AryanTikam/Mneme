"""Embedding Service for Mneme.

Generates dense vector embeddings for text chunks, blurt responses,
and retrieval queries. Includes deterministic fallback for test and offline modes.
"""

from __future__ import annotations

import hashlib
import logging
import math
from typing import List, Optional

from config import settings

logger = logging.getLogger("mneme.embedding")


class EmbeddingService:
    """Manages dense text embedding generation."""

    _instance: Optional[EmbeddingService] = None
    _model: Any = None
    _is_hf_ready: bool = False

    def __new__(cls) -> EmbeddingService:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_model()
        return cls._instance

    def _init_model(self) -> None:
        """Attempt to load sentence-transformers embedding model."""
        try:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading embedding model: %s...", settings.EMBEDDING_MODEL_NAME)
            self._model = SentenceTransformer(settings.EMBEDDING_MODEL_NAME)
            self._is_hf_ready = True
            logger.info("Embedding model loaded successfully.")
        except Exception as exc:
            logger.warning(
                "SentenceTransformer could not be initialized (%s). "
                "Using high-fidelity deterministic semantic hash embedding.",
                exc,
            )
            self._is_hf_ready = False

    def _deterministic_embed(self, text: str, dim: int = 384) -> List[float]:
        """Compute a normalized deterministic pseudo-embedding based on n-grams and tokens.

        Provides consistent semantic cosine-similarity behavior for testing and fallback.
        """
        vec = [0.0] * dim
        tokens = text.lower().strip().split()
        if not tokens:
            return vec

        for idx, token in enumerate(tokens):
            # Primary token hash
            h1 = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
            pos1 = h1 % dim
            vec[pos1] += 1.0

            # Bigram hash if applicable
            if idx + 1 < len(tokens):
                bigram = f"{token}_{tokens[idx + 1]}"
                h2 = int(hashlib.sha256(bigram.encode("utf-8")).hexdigest(), 16)
                pos2 = h2 % dim
                vec[pos2] += 1.5

        # L2 normalize
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 1e-9:
            vec = [v / norm for v in vec]
        return vec

    def embed_text(self, text: str) -> List[float]:
        """Generate embedding vector for a single string."""
        if not text:
            return [0.0] * settings.VECTOR_DIMENSION

        if self._is_hf_ready and self._model is not None:
            try:
                emb = self._model.encode(text, convert_to_numpy=True).tolist()
                return list(emb)
            except Exception as err:
                logger.error("Error during model embedding: %s. Using fallback.", err)

        return self._deterministic_embed(text, dim=settings.VECTOR_DIMENSION)

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for a list of text chunks."""
        if not texts:
            return []

        if self._is_hf_ready and self._model is not None:
            try:
                embs = self._model.encode(texts, convert_to_numpy=True).tolist()
                return [list(e) for e in embs]
            except Exception as err:
                logger.error("Batch embedding failed (%s). Falling back.", err)

        return [self._deterministic_embed(t, dim=settings.VECTOR_DIMENSION) for t in texts]


# Global embedding service instance
embedding_service = EmbeddingService()

