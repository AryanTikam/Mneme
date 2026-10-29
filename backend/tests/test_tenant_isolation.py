"""Tests for strict multi-tenant payload isolation in Qdrant vector operations."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.embedding_service import embedding_service
from services.qdrant_service import qdrant_service


def test_tenant_isolation_payload_filtering():
    """Verify that User A cannot retrieve documents owned by User B."""
    user_a = "user_alpha_123"
    user_b = "user_beta_456"
    doc_a = "doc_comp_arch"
    doc_b = "doc_economics"

    chunks_a = ["The central processing unit executes instructions fetched from register cache and system memory."]
    chunks_b = ["Supply and demand equilibrium determines market clearing prices in macroeconomics."]

    emb_a = embedding_service.embed_documents(chunks_a)
    emb_b = embedding_service.embed_documents(chunks_b)

    # Upsert User A's chunks
    qdrant_service.upsert_chunks(
        user_id=user_a,
        document_id=doc_a,
        chunks=chunks_a,
        embeddings=emb_a,
    )

    # Upsert User B's chunks
    qdrant_service.upsert_chunks(
        user_id=user_b,
        document_id=doc_b,
        chunks=chunks_b,
        embeddings=emb_b,
    )

    # Search with User A's credentials using User B's concept query
    query_vec = embedding_service.embed_text("macroeconomics equilibrium market prices")
    results_for_a = qdrant_service.search_chunks(
        user_id=user_a,
        query_vector=query_vec,
        top_k=5,
    )

    # User A MUST NOT receive User B's chunks
    for res in results_for_a:
        assert res["payload"]["user_id"] == user_a
        assert "macroeconomics" not in res["text"].lower()

    # Search with User B's credentials
    results_for_b = qdrant_service.search_chunks(
        user_id=user_b,
        query_vector=query_vec,
        top_k=5,
    )

    # User B should see their own chunk
    assert len(results_for_b) > 0
    assert results_for_b[0]["payload"]["user_id"] == user_b
    assert "macroeconomics" in results_for_b[0]["text"].lower()

