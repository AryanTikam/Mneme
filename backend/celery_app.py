"""Celery Application Configuration for Mneme.

Handles asynchronous task dispatching for background PDF ingestion,
chunking, embedding into Qdrant, and batch LLM generation.
"""

from __future__ import annotations

from celery import Celery
from config import settings


def make_celery(app_name: str = "mneme") -> Celery:
    """Create and configure a production-ready Celery instance."""
    celery_instance = Celery(
        app_name,
        broker=settings.CELERY_BROKER_URL,
        backend=settings.CELERY_RESULT_BACKEND,
        include=["tasks.celery_tasks"],
    )

    celery_instance.conf.update(
        broker_url=settings.CELERY_BROKER_URL,
        result_backend=settings.CELERY_RESULT_BACKEND,
        broker_connection_timeout=1.0,
        broker_connection_max_retries=1,
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        task_track_started=True,
        task_time_limit=3600,  # 1 hour max for large documents
        task_soft_time_limit=3300,
        result_expires=86400,  # 24 hours
        worker_prefetch_multiplier=1,
        task_acks_late=True,
        broker_connection_retry_on_startup=False,
    )

    return celery_instance


celery_app = make_celery()
