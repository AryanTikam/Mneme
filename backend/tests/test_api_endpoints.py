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
    """Verify POST /api/v1/blurt/evaluate runs synchronous evaluation using deck context."""
    app = create_app()
    client = app.test_client()

    payload = {
        "deck_id": "deck_test_cs101",
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
    assert "score" in data
    assert "feedback" in data
    assert isinstance(data["recalled_concepts"], list)


def test_chat_stream_endpoint():
    """Verify POST /api/v1/chat/stream returns SSE stream with deck context."""
    app = create_app()
    client = app.test_client()

    payload = {
        "session_id": "sess_stream_1",
        "message": "Can you explain how virtual memory page tables work?",
        "deck_id": "deck_test_cs101",
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
        "flashcards": [{"id": "fc_1", "front": "Q1", "back": "A1"}],
        "quizzes": [],
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


def test_deck_segregated_contexts_lifecycle():
    """Verify attaching, detaching, and querying deck-specific segregated contexts."""
    app = create_app()
    client = app.test_client()
    user_id = "test_user_contexts"
    headers = {"X-User-Id": user_id, "Content-Type": "application/json"}

    from services.database import mongo_manager

    # 1. Seed two segregated documents in library for user
    mongo_manager.insert_document({
        "document_id": "doc_ctx_alpha",
        "user_id": user_id,
        "filename": "alpha_lecture.pdf",
        "chunk_count": 12,
        "status": "ready",
    })
    mongo_manager.insert_document({
        "document_id": "doc_ctx_beta",
        "user_id": user_id,
        "filename": "beta_notes.pdf",
        "chunk_count": 8,
        "status": "ready",
    })

    # 2. Create a deck with the first document attached
    create_res = client.post(
        "/api/v1/decks",
        data=json.dumps({
            "title": "Cognitive Psychology Deck",
            "document_ids": ["doc_ctx_alpha"],
            "color": "emerald",
        }),
        headers=headers,
    )
    assert create_res.status_code == 201
    deck_data = create_res.get_json()["deck"]
    deck_id = deck_data["id"]
    assert "doc_ctx_alpha" in deck_data["document_ids"]

    # 3. Query contexts for the deck
    ctx_res = client.get(f"/api/v1/decks/{deck_id}/contexts", headers={"X-User-Id": user_id})
    assert ctx_res.status_code == 200
    ctx_json = ctx_res.get_json()
    assert len(ctx_json["attached_documents"]) == 1
    assert ctx_json["attached_documents"][0]["document_id"] == "doc_ctx_alpha"
    assert len(ctx_json["available_documents"]) == 1
    assert ctx_json["available_documents"][0]["document_id"] == "doc_ctx_beta"

    # 4. Attach the second context document to the deck
    attach_res = client.post(
        f"/api/v1/decks/{deck_id}/contexts/attach",
        data=json.dumps({"document_id": "doc_ctx_beta"}),
        headers=headers,
    )
    assert attach_res.status_code == 200
    attached_deck = attach_res.get_json()["deck"]
    assert "doc_ctx_alpha" in attached_deck["document_ids"]
    assert "doc_ctx_beta" in attached_deck["document_ids"]

    # 5. Detach the first document from the deck
    detach_res = client.post(
        f"/api/v1/decks/{deck_id}/contexts/detach",
        data=json.dumps({"document_id": "doc_ctx_alpha"}),
        headers=headers,
    )
    assert detach_res.status_code == 200
    detached_deck = detach_res.get_json()["deck"]
    assert "doc_ctx_alpha" not in detached_deck["document_ids"]
    assert "doc_ctx_beta" in detached_deck["document_ids"]

    # Verify document itself still exists in library
    docs_res = client.get("/api/v1/documents", headers={"X-User-Id": user_id})
    assert docs_res.status_code == 200
    all_doc_ids = [d["document_id"] for d in docs_res.get_json()["documents"]]
    assert "doc_ctx_alpha" in all_doc_ids
    assert "doc_ctx_beta" in all_doc_ids

    # Clean up test deck and documents
    client.delete(f"/api/v1/decks/{deck_id}", headers={"X-User-Id": user_id})
    client.delete("/api/v1/documents/doc_ctx_alpha", headers={"X-User-Id": user_id})
    client.delete("/api/v1/documents/doc_ctx_beta", headers={"X-User-Id": user_id})


def test_upload_context_directly_to_deck():
    """Verify POST /api/v1/decks/<deck_id>/contexts/upload accepts PDF and links context."""
    from unittest.mock import patch

    app = create_app()
    client = app.test_client()
    user_id = "test_user_deck_upload"
    headers = {"X-User-Id": user_id}

    # 1. Create a deck
    create_res = client.post(
        "/api/v1/decks",
        data=json.dumps({"title": "Direct Context Upload Deck"}),
        content_type="application/json",
        headers=headers,
    )
    assert create_res.status_code == 201
    deck_id = create_res.get_json()["deck"]["id"]

    # 2. Upload PDF directly to deck context
    fake_pdf = io.BytesIO(b"%PDF-1.4\nvalid pdf dummy binary stream\n%%EOF")
    with patch("tasks.celery_tasks._extract_text_from_file", return_value="This is sample lecture notes on neural networks and backpropagation gradient descent."):
        upload_res = client.post(
            f"/api/v1/decks/{deck_id}/contexts/upload",
            data={"file": (fake_pdf, "embedded_lecture.pdf")},
            content_type="multipart/form-data",
            headers=headers,
        )
    assert upload_res.status_code == 200
    upload_data = upload_res.get_json()
    assert upload_data["status"] == "uploaded"
    doc_id = upload_data["document_id"]
    assert doc_id in upload_data["deck"]["document_ids"]

    # Clean up
    client.delete(f"/api/v1/decks/{deck_id}", headers=headers)
    client.delete(f"/api/v1/documents/{doc_id}", headers=headers)



