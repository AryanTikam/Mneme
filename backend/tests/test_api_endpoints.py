"""Integration tests for Flask application routes, static serving, and REST API."""

import io
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import create_app


def test_static_root_and_catch_all():
    """Verify static serving on / and catch-all fallback for React Router."""
    app = create_app()
    app.config["TESTING"] = True
    client = app.test_client()

    # Root route /
    res_root = client.get("/")
    assert res_root.status_code == 200
    assert b"Mneme" in res_root.data

    # Catch-all client-side route /flashcards
    res_flashcards = client.get("/flashcards")
    assert res_flashcards.status_code == 200
    assert b"Mneme" in res_flashcards.data

    # Catch-all client-side route /blurt
    res_blurt = client.get("/blurt")
    assert res_blurt.status_code == 200
    assert b"Mneme" in res_blurt.data

    # Non-existent API path returns 404 JSON, NOT index.html
    res_api_404 = client.get("/api/v1/non_existent_route")
    assert res_api_404.status_code == 404
    data = res_api_404.get_json()
    assert "error" in data


def test_health_check_endpoint():
    """Verify /api/v1/health returns system statuses."""
    app = create_app()
    client = app.test_client()

    res = client.get("/api/v1/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "healthy"
    assert "mongodb_connected" in data
    assert "qdrant_connected" in data
    assert "llm_loaded" in data


def test_upload_document_endpoint():
    """Verify POST /api/v1/upload accepts PDF file and returns task_id."""
    app = create_app()
    client = app.test_client()

    # Valid PDF file simulation
    fake_pdf = io.BytesIO(b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF")
    data = {
        "file": (fake_pdf, "lecture_notes.pdf")
    }

    res = client.post(
        "/api/v1/upload",
        data=data,
        content_type="multipart/form-data",
        headers={"X-User-Id": "test_user_77"},
    )

    assert res.status_code == 202
    resp_data = res.get_json()
    assert "task_id" in resp_data
    assert "document_id" in resp_data
    assert resp_data["status"] == "queued"


def test_deck_generation_endpoint():
    """Verify POST /api/v1/decks/generate queues LangGraph generation task."""
    app = create_app()
    client = app.test_client()

    payload = {
        "document_id": "doc_test_course",
        "mode": "flashcards",
    }

    res = client.post(
        "/api/v1/decks/generate",
        data=json.dumps(payload),
        content_type="application/json",
        headers={"X-User-Id": "test_user_77"},
    )

    assert res.status_code == 202
    data = res.get_json()
    assert "task_id" in data
    assert data["document_id"] == "doc_test_course"
    assert data["mode"] == "flashcards"


def test_task_status_polling_endpoint():
    """Verify GET /api/v1/tasks/<task_id> returns polling status."""
    app = create_app()
    client = app.test_client()

    res = client.get("/api/v1/tasks/sync_doc_123")
    assert res.status_code == 200
    data = res.get_json()
    assert data["task_id"] == "sync_doc_123"
    assert data["status"] == "SUCCESS"


def test_blurt_evaluate_endpoint():
    """Verify POST /api/v1/blurt/evaluate runs synchronous evaluation."""
    app = create_app()
    client = app.test_client()

    payload = {
        "document_id": "doc_test_course",
        "blurt_text": "Operating systems manage hardware resources, process scheduling, and virtual memory isolation.",
    }

    res = client.post(
        "/api/v1/blurt/evaluate",
        data=json.dumps(payload),
        content_type="application/json",
        headers={"X-User-Id": "test_user_77"},
    )

    assert res.status_code == 200
    data = res.get_json()
    assert "recalled_concepts" in data
    assert "missed_concepts" in data
    assert isinstance(data["recalled_concepts"], list)


def test_chat_stream_endpoint():
    """Verify POST /api/v1/chat/stream returns SSE stream."""
    app = create_app()
    client = app.test_client()

    payload = {
        "session_id": "sess_stream_1",
        "message": "Can you explain how virtual memory page tables work?",
        "document_id": "doc_test_course",
    }

    res = client.post(
        "/api/v1/chat/stream",
        data=json.dumps(payload),
        content_type="application/json",
        headers={"X-User-Id": "test_user_77"},
    )

    assert res.status_code == 200
    assert "text/event-stream" in res.content_type

    # Verify event stream structure
    lines = [line.decode("utf-8") for line in res.response if line]
    data_events = [line for line in lines if line.startswith("data: ")]
    assert len(data_events) > 0

    first_event = json.loads(data_events[0].replace("data: ", ""))
    assert "done" in first_event

    last_event = json.loads(data_events[-1].replace("data: ", ""))
    assert last_event["done"] is True
    assert "full_text" in last_event


def test_delete_deck_and_document():
    """Verify DELETE /api/v1/decks/<deck_id> and DELETE /api/v1/documents/<doc_id>."""
    app = create_app()
    client = app.test_client()

    # Insert test deck
    from services.database import mongo_manager
    mongo_manager.save_deck({
        "deck_id": "deck_to_delete_99",
        "title": "Temp Delete Deck",
        "document_id": "doc_to_delete_99",
        "user_id": "test_user_77",
        "mode": "flashcards",
        "cards_count": 2,
        "items": [],
    })

    # Test delete deck
    res = client.delete("/api/v1/decks/deck_to_delete_99", headers={"X-User-Id": "test_user_77"})
    assert res.status_code == 200
    assert res.get_json()["status"] == "deleted"

    # Insert test document
    mongo_manager.insert_document({
        "document_id": "doc_to_delete_99",
        "user_id": "test_user_77",
        "filename": "delete_me.pdf",
        "status": "ready",
    })

    # Test delete document
    res_doc = client.delete("/api/v1/documents/doc_to_delete_99", headers={"X-User-Id": "test_user_77"})
    assert res_doc.status_code == 200
    assert res_doc.get_json()["status"] == "deleted"

