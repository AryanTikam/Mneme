"""Qdrant Vector Database Service for Mneme.

Enforces strict multi-tenant isolation via mandatory user_id payload filtering.
Provides collection initialization, chunk upsertion, and semantic retrieval.
"""

from __future__ import annotations

import logging
import math
import uuid
from typing import Any, Dict, List, Optional

from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.http.exceptions import UnexpectedResponse

from config import settings

logger = logging.getLogger("mneme.qdrant")


class QdrantService:
    """Manages Qdrant vector operations with strict tenant isolation."""

    _instance: Optional[QdrantService] = None
    _client: Optional[QdrantClient] = None
    _is_connected: bool = False
    _mock_points: Dict[str, Dict[str, Any]] = {}

    def __new__(cls) -> QdrantService:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_client()
        return cls._instance

    def _init_client(self) -> None:
        """Connect to Qdrant and initialize the multi-tenant collection."""
        try:
            logger.info("Initializing Qdrant client (%s:%s)...", settings.QDRANT_HOST, settings.QDRANT_PORT)
            if settings.QDRANT_URL:
                self._client = QdrantClient(url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY)
            else:
                self._client = QdrantClient(host=settings.QDRANT_HOST, port=settings.QDRANT_PORT, timeout=3.0)

            # Test connection
            self._client.get_collections()
            self._is_connected = True
            logger.info("Connected to Qdrant successfully.")
            self._ensure_collection()
        except Exception as exc:
            logger.warning(
                "Qdrant vector database unreachable (%s). Using in-memory multi-tenant vector fallback.",
                exc,
            )
            self._is_connected = False
            self._mock_points = {}

    def _ensure_collection(self) -> None:
        """Create the vector collection if it does not already exist, and create payload index."""
        if not self._is_connected or self._client is None:
            return
        try:
            collections = [c.name for c in self._client.get_collections().collections]
            if settings.QDRANT_COLLECTION not in collections:
                logger.info("Creating Qdrant collection: %s", settings.QDRANT_COLLECTION)
                self._client.create_collection(
                    collection_name=settings.QDRANT_COLLECTION,
                    vectors_config=models.VectorParams(
                        size=settings.VECTOR_DIMENSION,
                        distance=models.Distance.COSINE,
                    ),
                )
                # Create payload index on user_id for strict high-speed tenant isolation
                self._client.create_payload_index(
                    collection_name=settings.QDRANT_COLLECTION,
                    field_name="user_id",
                    field_schema=models.PayloadSchemaType.KEYWORD,
                )
                self._client.create_payload_index(
                    collection_name=settings.QDRANT_COLLECTION,
                    field_name="document_id",
                    field_schema=models.PayloadSchemaType.KEYWORD,
                )
                logger.info("Payload indexes for user_id and document_id created.")
        except Exception as err:
            logger.error("Error creating Qdrant collection or indexes: %s", err)

    @property
    def is_connected(self) -> bool:
        """Return True if Qdrant connection is active."""
        return self._is_connected

    def upsert_chunks(
        self,
        user_id: str,
        document_id: str,
        chunks: List[str],
        embeddings: List[List[float]],
        metadatas: Optional[List[Dict[str, Any]]] = None,
    ) -> List[str]:
        """Insert embedded chunks into Qdrant with enforced tenant isolation payload."""
        if not user_id:
            raise ValueError("user_id is strictly required for multi-tenant isolation.")
        if not document_id:
            raise ValueError("document_id is required for document indexing.")
        if len(chunks) != len(embeddings):
            raise ValueError("chunks count and embeddings count must match.")

        point_ids: List[str] = []
        points: List[models.PointStruct] = []

        for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
            pt_id = str(uuid.uuid4())
            point_ids.append(pt_id)
            payload: Dict[str, Any] = {
                "user_id": user_id,  # Mandatory tenant boundary
                "document_id": document_id,
                "chunk_index": i,
                "text": chunk,
            }
            if metadatas and i < len(metadatas):
                payload.update(metadatas[i])

            if self._is_connected and self._client is not None:
                points.append(models.PointStruct(id=pt_id, vector=emb, payload=payload))
            else:
                self._mock_points[pt_id] = {
                    "id": pt_id,
                    "vector": emb,
                    "payload": payload,
                }

        if self._is_connected and self._client is not None and points:
            try:
                self._client.upsert(collection_name=settings.QDRANT_COLLECTION, points=points)
                logger.info("Upserted %d points for user %s into Qdrant.", len(points), user_id)
            except Exception as exc:
                logger.error("Failed to upsert points into Qdrant: %s", exc)
                # Fallback to in-memory
                for pt in points:
                    self._mock_points[str(pt.id)] = {
                        "id": str(pt.id),
                        "vector": pt.vector,
                        "payload": pt.payload,
                    }

        return point_ids

    def search_chunks(
        self,
        user_id: str,
        query_vector: List[float],
        top_k: int = 4,
        document_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Perform vector similarity search strictly bounded by user_id.

        If document_id is supplied, it further restricts search to that document.
        """
        if not user_id:
            raise ValueError("Tenant isolation violation: user_id must be provided.")

        # Build strict payload filter
        must_conditions: List[models.Condition] = [
            models.FieldCondition(
                key="user_id",
                match=models.MatchValue(value=user_id),
            )
        ]
        has_specific_doc = bool(document_id and document_id not in ("default", "all", ""))
        if has_specific_doc:
            must_conditions.append(
                models.FieldCondition(
                    key="document_id",
                    match=models.MatchValue(value=document_id),
                )
            )

        payload_filter = models.Filter(must=must_conditions)

        if self._is_connected and self._client is not None:
            try:
                # Use query_points or search
                if hasattr(self._client, "query_points"):
                    res = self._client.query_points(
                        collection_name=settings.QDRANT_COLLECTION,
                        query=query_vector,
                        query_filter=payload_filter,
                        limit=top_k,
                    )
                    scored_points = res.points
                else:
                    scored_points = self._client.search(
                        collection_name=settings.QDRANT_COLLECTION,
                        query_vector=query_vector,
                        query_filter=payload_filter,
                        limit=top_k,
                    )

                results = []
                for sp in scored_points:
                    results.append({
                        "id": sp.id,
                        "score": sp.score,
                        "text": sp.payload.get("text", "") if sp.payload else "",
                        "document_id": sp.payload.get("document_id") if sp.payload else None,
                        "payload": sp.payload,
                    })
                return results
            except Exception as exc:
                logger.error("Qdrant search query failed: %s. Falling back to in-memory.", exc)

        # Fallback in-memory search with strict user_id filtering
        filtered_points = [
            pt for pt in self._mock_points.values()
            if pt["payload"].get("user_id") == user_id
            and (not has_specific_doc or pt["payload"].get("document_id") == document_id)
        ]

        def cosine_similarity(v1: List[float], v2: List[float]) -> float:
            dot = sum(a * b for a, b in zip(v1, v2))
            norm1 = math.sqrt(sum(a * a for a in v1))
            norm2 = math.sqrt(sum(b * b for b in v2))
            if norm1 * norm2 < 1e-9:
                return 0.0
            return dot / (norm1 * norm2)

        scored = []
        for pt in filtered_points:
            score = cosine_similarity(query_vector, pt["vector"])
            scored.append({
                "id": pt["id"],
                "score": score,
                "text": pt["payload"].get("text", ""),
                "document_id": pt["payload"].get("document_id"),
                "payload": pt["payload"],
            })

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]

    def delete_document_chunks(self, user_id: str, document_id: str) -> None:
        """Delete all chunks for a specific document under a user."""
        if not user_id or not document_id:
            return

        payload_filter = models.Filter(
            must=[
                models.FieldCondition(key="user_id", match=models.MatchValue(value=user_id)),
                models.FieldCondition(key="document_id", match=models.MatchValue(value=document_id)),
            ]
        )

        if self._is_connected and self._client is not None:
            try:
                self._client.delete(
                    collection_name=settings.QDRANT_COLLECTION,
                    points_selector=payload_filter,
                )
            except Exception as err:
                logger.error("Failed to delete points from Qdrant: %s", err)

        # Delete from mock storage
        to_del = [
            k for k, v in self._mock_points.items()
            if v["payload"].get("user_id") == user_id and v["payload"].get("document_id") == document_id
        ]
        for k in to_del:
            self._mock_points.pop(k, None)


# Global Qdrant service singleton
qdrant_service = QdrantService()

