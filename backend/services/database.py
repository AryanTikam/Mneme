"""MongoDB Database Service for Mneme.

Manages PyMongo synchronous client and Motor asynchronous client instances,
collection handles, index creation, and spaced-repetition records.
Includes automatic fallback for offline development or testing.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import pymongo
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.collection import Collection
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

from config import settings

logger = logging.getLogger("mneme.database")


class MongoManager:
    """Singleton MongoDB Manager providing managed access to collections."""

    _instance: Optional[MongoManager] = None
    _client: Optional[MongoClient] = None
    _db: Optional[Database] = None
    _is_connected: bool = False
    _mock_storage: Dict[str, Dict[str, Dict[str, Any]]] = {}

    def __new__(cls) -> MongoManager:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init_client()
        return cls._instance

    def _init_client(self) -> None:
        """Initialize MongoDB client and collections."""
        try:
            redacted_uri = settings.MONGO_URI.split("@")[-1] if "@" in settings.MONGO_URI else settings.MONGO_URI
            logger.info("Connecting to MongoDB at %s...", redacted_uri)
            self._client = MongoClient(
                settings.MONGO_URI,
                serverSelectionTimeoutMS=8000,
                connectTimeoutMS=8000,
            )
            # Ping database to verify connection
            self._client.admin.command("ping")
            self._db = self._client[settings.MONGO_DB_NAME]
            self._is_connected = True
            logger.info("Successfully connected to MongoDB: %s", settings.MONGO_DB_NAME)
            self._setup_indexes()
        except (ConnectionFailure, ServerSelectionTimeoutError, Exception) as exc:
            logger.warning(
                "MongoDB not reachable (%s). Falling back to resilient in-memory storage.",
                exc,
            )
            self._is_connected = False
            self._mock_storage = {
                "documents": {},
                "decks": {},
                "reviews": {},
                "users": {},
            }

    def _setup_indexes(self) -> None:
        """Create required indexes for performant multi-tenant queries."""
        if not self._is_connected or self._db is None:
            return
        try:
            # Multi-tenant document indexing
            self._db.documents.create_index([("user_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)])
            self._db.documents.create_index([("document_id", pymongo.ASCENDING)], unique=True)

            # Deck indexing
            self._db.decks.create_index([("user_id", pymongo.ASCENDING), ("document_id", pymongo.ASCENDING)])
            self._db.decks.create_index([("deck_id", pymongo.ASCENDING)], unique=True)

            # Spaced repetition tracking
            self._db.reviews.create_index([("user_id", pymongo.ASCENDING), ("card_id", pymongo.ASCENDING)])
            logger.info("MongoDB indexes verified.")
        except Exception as err:
            logger.error("Failed to ensure MongoDB indexes: %s", err)

    @property
    def is_connected(self) -> bool:
        """Return True if real MongoDB connection is active."""
        return self._is_connected

    @property
    def db(self) -> Optional[Database]:
        """Return MongoDB Database instance."""
        return self._db

    # --- Collection Accessors / Data Operations with Fallback ---

    def insert_document(self, doc_data: Dict[str, Any]) -> str:
        """Insert a document metadata entry."""
        doc_id = doc_data["document_id"]
        doc_data.setdefault("created_at", datetime.now(timezone.utc).isoformat())
        doc_data.setdefault("updated_at", datetime.now(timezone.utc).isoformat())

        if self._is_connected and self._db is not None:
            self._db.documents.replace_one({"document_id": doc_id}, doc_data, upsert=True)
        else:
            self._mock_storage.setdefault("documents", {})[doc_id] = doc_data
        return doc_id

    def get_document(self, document_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve document metadata with user isolation and fallback."""
        if self._is_connected and self._db is not None:
            doc = self._db.documents.find_one({"document_id": document_id, "user_id": user_id}, {"_id": 0})
            if not doc and user_id in ("user_default", ""):
                doc = self._db.documents.find_one({"document_id": document_id}, {"_id": 0})
            return doc
        doc = self._mock_storage.get("documents", {}).get(document_id)
        if doc and (doc.get("user_id") == user_id or user_id in ("user_default", "")):
            return dict(doc)
        return None

    def list_documents(self, user_id: str) -> List[Dict[str, Any]]:
        """List all documents belonging to a user."""
        if self._is_connected and self._db is not None:
            return list(self._db.documents.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1))
        return [
            d for d in self._mock_storage.get("documents", {}).values()
            if d.get("user_id") == user_id
        ]

    def update_document_status(self, document_id: str, status: str, extra: Optional[Dict[str, Any]] = None) -> None:
        """Update processing status of a document."""
        update_fields: Dict[str, Any] = {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
        if extra:
            update_fields.update(extra)

        if self._is_connected and self._db is not None:
            self._db.documents.update_one({"document_id": document_id}, {"$set": update_fields})
        else:
            if document_id in self._mock_storage.get("documents", {}):
                self._mock_storage["documents"][document_id].update(update_fields)

    def save_deck(self, deck_data: Dict[str, Any]) -> str:
        """Save a generated flashcard or quiz deck."""
        deck_id = deck_data["deck_id"]
        deck_data.setdefault("created_at", datetime.now(timezone.utc).isoformat())
        deck_data.setdefault("updated_at", datetime.now(timezone.utc).isoformat())

        if self._is_connected and self._db is not None:
            self._db.decks.replace_one({"deck_id": deck_id}, deck_data, upsert=True)
        else:
            self._mock_storage.setdefault("decks", {})[deck_id] = deck_data
        return deck_id

    def get_deck(self, deck_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a specific deck with user isolation."""
        if self._is_connected and self._db is not None:
            return self._db.decks.find_one({"deck_id": deck_id, "user_id": user_id}, {"_id": 0})
        deck = self._mock_storage.get("decks", {}).get(deck_id)
        if deck and deck.get("user_id") == user_id:
            return dict(deck)
        return None

    def list_decks(self, user_id: str) -> List[Dict[str, Any]]:
        """List all decks for a user."""
        if self._is_connected and self._db is not None:
            return list(self._db.decks.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1))
        return [
            d for d in self._mock_storage.get("decks", {}).values()
            if d.get("user_id") == user_id
        ]

    def delete_deck(self, deck_id: str, user_id: str) -> bool:
        """Delete a deck with tenant isolation."""
        if self._is_connected and self._db is not None:
            res = self._db.decks.delete_one({"deck_id": deck_id, "user_id": user_id})
            return res.deleted_count > 0
        if deck_id in self._mock_storage.get("decks", {}):
            if self._mock_storage["decks"][deck_id].get("user_id") == user_id:
                del self._mock_storage["decks"][deck_id]
                return True
        return False

    def delete_document(self, document_id: str, user_id: str) -> bool:
        """Delete a document and all decks associated with it."""
        if self._is_connected and self._db is not None:
            self._db.decks.delete_many({"document_id": document_id, "user_id": user_id})
            res = self._db.documents.delete_one({"document_id": document_id, "user_id": user_id})
            return res.deleted_count > 0
        deleted = False
        if document_id in self._mock_storage.get("documents", {}):
            if self._mock_storage["documents"][document_id].get("user_id") == user_id:
                del self._mock_storage["documents"][document_id]
                deleted = True
        to_del = [
            did for did, d in self._mock_storage.get("decks", {}).items()
            if d.get("document_id") == document_id and d.get("user_id") == user_id
        ]
        for did in to_del:
            del self._mock_storage["decks"][did]
        return deleted

    def record_review(self, user_id: str, card_id: str, deck_id: str, rating: int, recall_interval_days: int) -> None:
        """Record spaced repetition review result (e.g. SM-2 item rating)."""
        review_entry = {
            "user_id": user_id,
            "card_id": card_id,
            "deck_id": deck_id,
            "rating": rating,
            "interval_days": recall_interval_days,
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
        }
        if self._is_connected and self._db is not None:
            self._db.reviews.insert_one(review_entry)
        else:
            self._mock_storage.setdefault("reviews", {})[f"{user_id}_{card_id}_{datetime.now(timezone.utc).timestamp()}"] = review_entry


# Global Mongo client manager
mongo_manager = MongoManager()

