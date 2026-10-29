"""Application Configuration Module for Mneme.

Provides centralized, strongly typed environment configuration with
sensible defaults for development, testing, and production environments.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass(frozen=True)
class Settings:
    """Application runtime settings for Mneme Backend."""

    # Base paths
    BASE_DIR: Path = field(
        default_factory=lambda: Path(__file__).resolve().parent
    )
    WORKSPACE_DIR: Path = field(
        default_factory=lambda: Path(__file__).resolve().parent.parent
    )

    # Static file serving
    FRONTEND_DIST_DIR: Path = field(
        default_factory=lambda: (
            Path(__file__).resolve().parent.parent / "frontend" / "dist"
        )
    )

    # Flask Core
    FLASK_ENV: str = field(
        default_factory=lambda: os.getenv("FLASK_ENV", "development")
    )
    DEBUG: bool = field(
        default_factory=lambda: os.getenv("FLASK_DEBUG", "false").lower() in ("1", "true", "yes")
    )
    SECRET_KEY: str = field(
        default_factory=lambda: os.getenv("SECRET_KEY", "mneme-secure-secret-key-change-in-prod")
    )
    HOST: str = field(
        default_factory=lambda: os.getenv("HOST", "0.0.0.0")
    )
    PORT: int = field(
        default_factory=lambda: int(os.getenv("PORT", "5000"))
    )

    # Upload constraints
    UPLOAD_FOLDER: Path = field(
        default_factory=lambda: Path(__file__).resolve().parent / "uploads"
    )
    MAX_CONTENT_LENGTH: int = field(
        default_factory=lambda: int(os.getenv("MAX_CONTENT_LENGTH", str(50 * 1024 * 1024)))  # 50 MB
    )
    ALLOWED_EXTENSIONS: tuple[str, ...] = ("pdf", "docx", "txt", "md")

    # MongoDB Settings
    MONGO_URI: str = field(
        default_factory=lambda: os.getenv("MONGO_URI", "mongodb://localhost:27017")
    )
    MONGO_DB_NAME: str = field(
        default_factory=lambda: os.getenv("MONGO_DB_NAME", "mneme")
    )

    # Qdrant Vector DB Settings
    QDRANT_HOST: str = field(
        default_factory=lambda: os.getenv("QDRANT_HOST", "localhost")
    )
    QDRANT_PORT: int = field(
        default_factory=lambda: int(os.getenv("QDRANT_PORT", "6333"))
    )
    QDRANT_URL: Optional[str] = field(
        default_factory=lambda: os.getenv("QDRANT_URL", None)
    )
    QDRANT_API_KEY: Optional[str] = field(
        default_factory=lambda: os.getenv("QDRANT_API_KEY", None)
    )
    QDRANT_COLLECTION: str = field(
        default_factory=lambda: os.getenv("QDRANT_COLLECTION", "mneme_documents")
    )
    VECTOR_DIMENSION: int = field(
        default_factory=lambda: int(os.getenv("VECTOR_DIMENSION", "384"))
    )

    # Celery & Redis Settings
    REDIS_URL: str = field(
        default_factory=lambda: os.getenv("REDIS_URL", "redis://localhost:6379/0")
    )
    CELERY_BROKER_URL: str = field(
        default_factory=lambda: os.getenv(
            "CELERY_BROKER_URL",
            os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        )
    )
    CELERY_RESULT_BACKEND: str = field(
        default_factory=lambda: os.getenv(
            "CELERY_RESULT_BACKEND",
            os.getenv("REDIS_URL", "redis://localhost:6379/0"),
        )
    )

    # AI / LLM Core Settings
    MODEL_NAME: str = field(
        default_factory=lambda: os.getenv("MODEL_NAME", "google/gemma-2b-it")
    )
    USE_4BIT_QUANT: bool = field(
        default_factory=lambda: os.getenv("USE_4BIT_QUANT", "true").lower() in ("1", "true", "yes")
    )
    EMBEDDING_MODEL_NAME: str = field(
        default_factory=lambda: os.getenv(
            "EMBEDDING_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2"
        )
    )
    LLM_TEMPERATURE: float = field(
        default_factory=lambda: float(os.getenv("LLM_TEMPERATURE", "0.2"))
    )
    LLM_MAX_NEW_TOKENS: int = field(
        default_factory=lambda: int(os.getenv("LLM_MAX_NEW_TOKENS", "1024"))
    )
    DEFAULT_USER_ID: str = field(
        default_factory=lambda: os.getenv("DEFAULT_USER_ID", "user_default")
    )


# Global settings singleton
settings = Settings()

# Ensure uploads directory exists
settings.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

