"""MongoDB Database Service for Mneme.

Manages PyMongo synchronous client and Motor asynchronous client instances,
collection handles, index creation, folders, user management, and spaced-repetition records.
Includes automatic fallback for offline development or testing.
"""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone, timedelta
import pymongo
from pymongo import MongoClient
from pymongo.database import Database
from pymongo.collection import Collection
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from werkzeug.security import generate_password_hash, check_password_hash

from config import settings

logger = logging.getLogger("mneme.database")


def _normalize_deck(deck: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure deck conforms to unified schema with flashcards and quizzes."""
    deck = dict(deck)
    if "deck_id" in deck and "id" not in deck:
        deck["id"] = deck["deck_id"]
    elif "id" in deck and "deck_id" not in deck:
        deck["deck_id"] = deck["id"]

    flashcards = deck.get("flashcards") or []
    deck["flashcards"] = flashcards

    quizzes = deck.get("quizzes") or []
    deck["quizzes"] = quizzes

    deck["cards_count"] = len(flashcards)
    deck["quizzes_count"] = len(quizzes)
    deck.setdefault("folder_id", None)
    deck.setdefault("color", "indigo")
    deck.setdefault("order", 0)

    # Document contexts (segregated multi-document support)
    raw_doc_ids = deck.get("document_ids") or []
    if isinstance(raw_doc_ids, str):
        raw_doc_ids = [raw_doc_ids]
    if deck.get("document_id") and deck["document_id"] not in raw_doc_ids:
        raw_doc_ids.insert(0, deck["document_id"])

    clean_doc_ids: List[str] = []
    for did in raw_doc_ids:
        if did and did not in clean_doc_ids:
            clean_doc_ids.append(did)
    deck["document_ids"] = clean_doc_ids
    deck["document_id"] = clean_doc_ids[0] if clean_doc_ids else None
    return deck


class MongoManager:
    """Singleton MongoDB Manager providing managed access to collections."""

    _instance: Optional[MongoManager] = None
    _client: Optional[MongoClient] = None
    _db: Optional[Database] = None
    _is_connected: bool = False
    _mock_storage: Dict[str, Dict[str, Any]] = {}

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
                "folders": {},
                "reviews": {},
                "users": {},
            }

    def _setup_indexes(self) -> None:
        """Create required indexes for performant multi-tenant queries."""
        if not self._is_connected or self._db is None:
            return
        try:
            # Users
            self._db.users.create_index([("user_id", pymongo.ASCENDING)], unique=True)
            self._db.users.create_index([("username", pymongo.ASCENDING)], unique=True)

            # Folders
            self._db.folders.create_index([("user_id", pymongo.ASCENDING), ("order", pymongo.ASCENDING)])
            self._db.folders.create_index([("folder_id", pymongo.ASCENDING)], unique=True)

            # Documents
            self._db.documents.create_index([("user_id", pymongo.ASCENDING), ("created_at", pymongo.DESCENDING)])
            self._db.documents.create_index([("document_id", pymongo.ASCENDING)], unique=True)

            # Decks
            self._db.decks.create_index([("user_id", pymongo.ASCENDING), ("folder_id", pymongo.ASCENDING)])
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

    # =========================================================================
    # =========================================================================
    # User Management & Authentication Operations
    # =========================================================================

    def register_user(self, username: str, password: str, name: Optional[str] = None) -> Dict[str, Any]:
        """Register a new user account with hashed password."""
        clean_user = username.strip().lower()
        if not clean_user or len(clean_user) < 3:
            raise ValueError("Username must be at least 3 characters")
        if not password or len(password) < 4:
            raise ValueError("Password must be at least 4 characters")

        display_name = name.strip() if name and name.strip() else clean_user.capitalize()
        now = datetime.now(timezone.utc).isoformat()
        pw_hash = generate_password_hash(password)

        if self._is_connected and self._db is not None:
            existing = self._db.users.find_one({"username": clean_user})
            if existing:
                raise ValueError("Username is already taken")

            user_id = f"user_{uuid.uuid4().hex[:10]}"
            new_user = {
                "user_id": user_id,
                "username": clean_user,
                "name": display_name,
                "password_hash": pw_hash,
                "created_at": now,
                "last_active": now,
            }
            self._db.users.insert_one(new_user)
            return {
                "user_id": user_id,
                "username": clean_user,
                "name": display_name,
                "created_at": now,
                "last_active": now,
            }
        else:
            for u in self._mock_storage.get("users", {}).values():
                if u.get("username") == clean_user:
                    raise ValueError("Username is already taken")
            user_id = f"user_{uuid.uuid4().hex[:10]}"
            new_user = {
                "user_id": user_id,
                "username": clean_user,
                "name": display_name,
                "password_hash": pw_hash,
                "created_at": now,
                "last_active": now,
            }
            self._mock_storage.setdefault("users", {})[user_id] = new_user
            return {
                "user_id": user_id,
                "username": clean_user,
                "name": display_name,
                "created_at": now,
                "last_active": now,
            }

    def authenticate_user(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        """Authenticate user by username and password."""
        clean_user = username.strip().lower()
        if not clean_user or not password:
            return None

        now = datetime.now(timezone.utc).isoformat()
        if self._is_connected and self._db is not None:
            user = self._db.users.find_one({"username": clean_user})
            if not user:
                return None
            stored_hash = user.get("password_hash")
            if not stored_hash or not check_password_hash(stored_hash, password):
                return None
            self._db.users.update_one({"username": clean_user}, {"$set": {"last_active": now}})
            return {
                "user_id": user["user_id"],
                "username": user["username"],
                "name": user.get("name", user["username"]),
                "created_at": user.get("created_at", now),
                "last_active": now,
            }
        else:
            for u in self._mock_storage.get("users", {}).values():
                if u.get("username") == clean_user:
                    stored_hash = u.get("password_hash")
                    if not stored_hash or not check_password_hash(stored_hash, password):
                        return None
                    u["last_active"] = now
                    return {
                        "user_id": u["user_id"],
                        "username": u["username"],
                        "name": u.get("name", u["username"]),
                        "created_at": u.get("created_at", now),
                        "last_active": now,
                    }
            return None

    def delete_user_account(self, user_id: str) -> bool:
        """Permanently delete user profile, along with all their decks, folders, and documents."""
        if self._is_connected and self._db is not None:
            self._db.users.delete_one({"user_id": user_id})
            self._db.decks.delete_many({"user_id": user_id})
            self._db.folders.delete_many({"user_id": user_id})
            self._db.documents.delete_many({"user_id": user_id})
            self._db.reviews.delete_many({"user_id": user_id})
            logger.info("Permanently deleted account and all data for user %s", user_id)
            return True
        else:
            self._mock_storage.get("users", {}).pop(user_id, None)
            for col in ("decks", "folders", "documents", "reviews"):
                items = self._mock_storage.get(col, {})
                to_del = [k for k, v in items.items() if v.get("user_id") == user_id]
                for k in to_del:
                    items.pop(k, None)
            return True

    def list_users(self) -> List[Dict[str, Any]]:
        """List all active user profiles (password hash excluded)."""
        if self._is_connected and self._db is not None:
            return list(self._db.users.find({}, {"_id": 0, "password_hash": 0}).sort("last_active", -1))
        return [{k: v for k, v in u.items() if k != "password_hash"} for u in self._mock_storage.get("users", {}).values()]

    def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a user profile by user_id."""
        if self._is_connected and self._db is not None:
            return self._db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
        u = self._mock_storage.get("users", {}).get(user_id)
        return {k: v for k, v in u.items() if k != "password_hash"} if u else None

    def record_user_activity(self, user_id: str, action: str = "review", metadata: Optional[Dict[str, Any]] = None) -> None:
        """Record a user activity event and append today's date to their active days set."""
        now = datetime.now(timezone.utc)
        today_str = now.strftime("%Y-%m-%d")
        now_iso = now.isoformat()

        if self._is_connected and self._db is not None:
            self._db.users.update_one(
                {"user_id": user_id},
                {
                    "$set": {"last_active": now_iso},
                    "$addToSet": {"activity_dates": today_str},
                    "$inc": {"review_count": 1 if "review" in action else 0},
                }
            )
        else:
            u = self._mock_storage.get("users", {}).get(user_id)
            if u:
                u["last_active"] = now_iso
                dates = set(u.setdefault("activity_dates", []))
                dates.add(today_str)
                u["activity_dates"] = sorted(list(dates))
                u["review_count"] = u.get("review_count", 0) + (1 if "review" in action else 0)

    def get_user_stats(self, user_id: str) -> Dict[str, Any]:
        """Compute live per-user statistics: study streak, active recall mastery %, and resource counts."""
        user = self.get_user(user_id) or {}
        now = datetime.now(timezone.utc)
        today = now.date()

        # Calculate consecutive daily streak
        activity_dates = set(user.get("activity_dates", []))
        if user.get("last_active"):
            try:
                la_date = datetime.fromisoformat(user["last_active"]).date()
                activity_dates.add(la_date.strftime("%Y-%m-%d"))
            except Exception:
                pass

        streak = 0
        curr = today
        if curr.strftime("%Y-%m-%d") in activity_dates:
            streak += 1
            curr = curr - timedelta(days=1)
        elif (curr - timedelta(days=1)).strftime("%Y-%m-%d") in activity_dates:
            streak += 1
            curr = curr - timedelta(days=2)
        else:
            if user.get("created_at"):
                try:
                    c_date = datetime.fromisoformat(user["created_at"]).date()
                    if c_date == today:
                        streak = 1
                except Exception:
                    pass

        while streak > 0:
            if curr.strftime("%Y-%m-%d") in activity_dates:
                streak += 1
                curr = curr - timedelta(days=1)
            else:
                break

        # Compute flashcard & deck metrics
        decks = self.list_decks(user_id)
        total_decks = len(decks)
        total_cards = sum(len(d.get("flashcards", [])) for d in decks)
        total_quizzes = sum(len(d.get("quizzes", [])) for d in decks)
        mastered_cards = sum(
            sum(1 for c in d.get("flashcards", []) if c.get("mastery", 0) >= 1)
            for d in decks
        )
        mastery_pct = round((mastered_cards / total_cards) * 100) if total_cards > 0 else 0
        total_docs = len(self.list_documents(user_id))

        if mastery_pct >= 80:
            label = "Active recall mastery reached"
        elif mastery_pct >= 40:
            label = "Active recall mastery progressing"
        elif total_cards > 0:
            label = "Building foundational memory"
        else:
            label = "Active recall mastery active"

        return {
            "user_id": user_id,
            "streak_days": max(1, streak) if (user.get("user_id") or activity_dates) else 0,
            "mastery_percentage": mastery_pct,
            "total_decks": total_decks,
            "total_cards": total_cards,
            "total_quizzes": total_quizzes,
            "mastered_cards": mastered_cards,
            "total_documents": total_docs,
            "active_recall_label": label,
        }

    # =========================================================================
    # Folder Management Operations
    # =========================================================================

    def create_folder(self, folder_data: Dict[str, Any]) -> str:
        """Create a new folder for organizing decks."""
        folder_id = folder_data.get("folder_id") or f"folder_{uuid.uuid4().hex[:10]}"
        folder_data["folder_id"] = folder_id
        now = datetime.now(timezone.utc).isoformat()
        folder_data.setdefault("created_at", now)
        folder_data.setdefault("updated_at", now)
        folder_data.setdefault("color", "indigo")
        folder_data.setdefault("order", 0)

        if self._is_connected and self._db is not None:
            self._db.folders.replace_one({"folder_id": folder_id}, folder_data, upsert=True)
        else:
            self._mock_storage.setdefault("folders", {})[folder_id] = folder_data
        return folder_id

    def list_folders(self, user_id: str) -> List[Dict[str, Any]]:
        """List all folders for a specific user ordered by position."""
        if self._is_connected and self._db is not None:
            folders = list(self._db.folders.find({"user_id": user_id}, {"_id": 0}).sort("order", 1))
            # Also attach count of decks in each folder
            for f in folders:
                f["decks_count"] = self._db.decks.count_documents({"user_id": user_id, "folder_id": f["folder_id"]})
            return folders

        folders = [
            f for f in self._mock_storage.get("folders", {}).values()
            if f.get("user_id") == user_id
        ]
        folders.sort(key=lambda x: x.get("order", 0))
        for f in folders:
            f["decks_count"] = sum(
                1 for d in self._mock_storage.get("decks", {}).values()
                if d.get("user_id") == user_id and d.get("folder_id") == f["folder_id"]
            )
        return folders

    def get_folder(self, folder_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a folder by ID with user isolation."""
        if self._is_connected and self._db is not None:
            return self._db.folders.find_one({"folder_id": folder_id, "user_id": user_id}, {"_id": 0})
        f = self._mock_storage.get("folders", {}).get(folder_id)
        if f and f.get("user_id") == user_id:
            return dict(f)
        return None

    def update_folder(self, folder_id: str, user_id: str, updates: Dict[str, Any]) -> bool:
        """Update folder details (name, color, order)."""
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        if self._is_connected and self._db is not None:
            res = self._db.folders.update_one({"folder_id": folder_id, "user_id": user_id}, {"$set": updates})
            return res.matched_count > 0
        if folder_id in self._mock_storage.get("folders", {}):
            f = self._mock_storage["folders"][folder_id]
            if f.get("user_id") == user_id:
                f.update(updates)
                return True
        return False

    def delete_folder(self, folder_id: str, user_id: str) -> bool:
        """Delete a folder and decouple associated decks."""
        if self._is_connected and self._db is not None:
            self._db.decks.update_many({"folder_id": folder_id, "user_id": user_id}, {"$set": {"folder_id": None}})
            res = self._db.folders.delete_one({"folder_id": folder_id, "user_id": user_id})
            return res.deleted_count > 0
        if folder_id in self._mock_storage.get("folders", {}):
            if self._mock_storage["folders"][folder_id].get("user_id") == user_id:
                del self._mock_storage["folders"][folder_id]
                for d in self._mock_storage.get("decks", {}).values():
                    if d.get("folder_id") == folder_id and d.get("user_id") == user_id:
                        d["folder_id"] = None
                return True
        return False

    # =========================================================================
    # Document Operations
    # =========================================================================

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

    def delete_document(self, document_id: str, user_id: str) -> bool:
        """Delete a document and decouple it from associated decks without destroying decks."""
        if self._is_connected and self._db is not None:
            # Unlink document from any decks
            self._db.decks.update_many(
                {"user_id": user_id},
                {"$pull": {"document_ids": document_id}}
            )
            self._db.decks.update_many(
                {"user_id": user_id, "document_id": document_id},
                {"$set": {"document_id": None}}
            )
            res = self._db.documents.delete_one({"document_id": document_id, "user_id": user_id})
            return res.deleted_count > 0
        deleted = False
        if document_id in self._mock_storage.get("documents", {}):
            if self._mock_storage["documents"][document_id].get("user_id") == user_id:
                del self._mock_storage["documents"][document_id]
                deleted = True
        for d in self._mock_storage.get("decks", {}).values():
            if d.get("user_id") == user_id:
                if document_id in d.get("document_ids", []):
                    d["document_ids"].remove(document_id)
                if d.get("document_id") == document_id:
                    d["document_id"] = d["document_ids"][0] if d.get("document_ids") else None
        return deleted

    def attach_document_to_deck(self, deck_id: str, user_id: str, document_id: str) -> bool:
        """Attach an existing uploaded document context to a deck."""
        deck = self.get_deck(deck_id, user_id)
        if not deck:
            return False
        doc_ids = list(deck.get("document_ids", []))
        if document_id not in doc_ids:
            doc_ids.append(document_id)
            return self.update_deck(deck_id, user_id, {
                "document_ids": doc_ids,
                "document_id": doc_ids[0] if doc_ids else None
            })
        return True

    def detach_document_from_deck(self, deck_id: str, user_id: str, document_id: str) -> bool:
        """Detach a document context from a deck."""
        deck = self.get_deck(deck_id, user_id)
        if not deck:
            return False
        doc_ids = [did for did in deck.get("document_ids", []) if did != document_id]
        return self.update_deck(deck_id, user_id, {
            "document_ids": doc_ids,
            "document_id": doc_ids[0] if doc_ids else None
        })

    def get_deck_documents(self, deck_id: str, user_id: str) -> List[Dict[str, Any]]:
        """Retrieve full document records attached to a specific deck."""
        deck = self.get_deck(deck_id, user_id)
        if not deck:
            return []
        doc_ids = deck.get("document_ids", [])
        if not doc_ids and deck.get("document_id"):
            doc_ids = [deck["document_id"]]

        docs: List[Dict[str, Any]] = []
        for did in doc_ids:
            d = self.get_document(did, user_id)
            if d:
                docs.append(d)
        return docs

    # =========================================================================
    # Unified Deck Operations
    # =========================================================================

    def save_deck(self, deck_data: Dict[str, Any]) -> str:
        """Save or update a unified deck containing flashcards and quizzes."""
        normalized = _normalize_deck(deck_data)
        deck_id = normalized["deck_id"]
        now = datetime.now(timezone.utc).isoformat()
        normalized.setdefault("created_at", now)
        normalized["updated_at"] = now

        if self._is_connected and self._db is not None:
            self._db.decks.replace_one({"deck_id": deck_id}, normalized, upsert=True)
        else:
            self._mock_storage.setdefault("decks", {})[deck_id] = normalized
        return deck_id

    def get_deck(self, deck_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a specific deck with user isolation, normalized."""
        if self._is_connected and self._db is not None:
            deck = self._db.decks.find_one({"deck_id": deck_id, "user_id": user_id}, {"_id": 0})
            return _normalize_deck(deck) if deck else None
        deck = self._mock_storage.get("decks", {}).get(deck_id)
        if deck and (deck.get("user_id") == user_id or user_id in ("user_default", "")):
            return _normalize_deck(deck)
        return None

    def list_decks(
        self,
        user_id: str,
        folder_id: Optional[str] = None,
        search: Optional[str] = None,
        sort_by: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List and search user's unified decks with filtering and sorting."""
        decks: List[Dict[str, Any]] = []

        if self._is_connected and self._db is not None:
            query: Dict[str, Any] = {"user_id": user_id}
            if folder_id == "unorganized":
                query["folder_id"] = {"$in": [None, ""]}
            elif folder_id and folder_id != "all":
                query["folder_id"] = folder_id

            if search and search.strip():
                clean_term = re.escape(search.strip())
                query["title"] = {"$regex": clean_term, "$options": "i"}

            raw_decks = list(self._db.decks.find(query, {"_id": 0}))
            decks = [_normalize_deck(d) for d in raw_decks]
        else:
            all_mock = [
                _normalize_deck(d) for d in self._mock_storage.get("decks", {}).values()
                if d.get("user_id") == user_id
            ]
            for d in all_mock:
                if folder_id == "unorganized" and d.get("folder_id"):
                    continue
                if folder_id and folder_id not in ("all", "unorganized") and d.get("folder_id") != folder_id:
                    continue
                if search and search.strip():
                    if search.strip().lower() not in d.get("title", "").lower():
                        continue
                decks.append(d)

        # In-memory sorting
        if sort_by == "title" or sort_by == "title_asc":
            decks.sort(key=lambda x: x.get("title", "").lower())
        elif sort_by == "title_desc":
            decks.sort(key=lambda x: x.get("title", "").lower(), reverse=True)
        elif sort_by == "cards":
            decks.sort(key=lambda x: x.get("cards_count", 0), reverse=True)
        elif sort_by == "quizzes":
            decks.sort(key=lambda x: x.get("quizzes_count", 0), reverse=True)
        elif sort_by == "order":
            decks.sort(key=lambda x: x.get("order", 0))
        else:
            # Default: updated_at descending
            decks.sort(key=lambda x: x.get("updated_at", x.get("created_at", "")), reverse=True)

        return decks

    def update_deck(self, deck_id: str, user_id: str, updates: Dict[str, Any]) -> bool:
        """Update deck metadata (title, folder_id, color, order)."""
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        if self._is_connected and self._db is not None:
            res = self._db.decks.update_one({"deck_id": deck_id, "user_id": user_id}, {"$set": updates})
            return res.matched_count > 0
        if deck_id in self._mock_storage.get("decks", {}):
            d = self._mock_storage["decks"][deck_id]
            if d.get("user_id") == user_id:
                d.update(updates)
                return True
        return False

    def move_deck(self, deck_id: str, user_id: str, folder_id: Optional[str], order: Optional[int] = None) -> bool:
        """Move a deck into a specific folder and update its arrangement order."""
        updates: Dict[str, Any] = {
            "folder_id": folder_id if folder_id and folder_id != "unorganized" else None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if order is not None:
            updates["order"] = order

        if self._is_connected and self._db is not None:
            res = self._db.decks.update_one({"deck_id": deck_id, "user_id": user_id}, {"$set": updates})
            return res.matched_count > 0
        if deck_id in self._mock_storage.get("decks", {}):
            d = self._mock_storage["decks"][deck_id]
            if d.get("user_id") == user_id:
                d.update(updates)
                return True
        return False

    def delete_deck(self, deck_id: str, user_id: str) -> bool:
        """Delete a deck with tenant isolation."""
        if self._is_connected and self._db is not None:
            res = self._db.decks.delete_one({"deck_id": deck_id, "user_id": user_id})
            return res.deleted_count > 0
        if deck_id in self._mock_storage.get("decks", {}):
            if self._mock_storage["decks"][deck_id].get("user_id") == user_id or user_id in ("user_default", ""):
                del self._mock_storage["decks"][deck_id]
                return True
        return False

    # =========================================================================
    # Granular Card and Quiz Operations within Deck
    # =========================================================================

    def add_card(self, deck_id: str, user_id: str, card_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Add a new flashcard to a deck."""
        deck = self.get_deck(deck_id, user_id)
        if not deck:
            return None
        card_id = card_data.get("id") or f"fc_{uuid.uuid4().hex[:8]}"
        card_item = {
            "id": card_id,
            "front": card_data.get("front", "").strip(),
            "back": card_data.get("back", "").strip(),
            "mastery": card_data.get("mastery", 0),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        deck["flashcards"].append(card_item)
        deck["cards_count"] = len(deck["flashcards"])
        self.save_deck(deck)
        return card_item

    def update_card(self, deck_id: str, user_id: str, card_id: str, card_updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update an existing flashcard in a deck."""
        deck = self.get_deck(deck_id, user_id)
        if not deck:
            return None
        found_card = None
        for c in deck.get("flashcards", []):
            if c.get("id") == card_id:
                c.update({k: v for k, v in card_updates.items() if k != "id"})
                found_card = c
                break
        if found_card:
            self.save_deck(deck)
        return found_card

    def delete_card(self, deck_id: str, user_id: str, card_id: str) -> bool:
        """Remove a flashcard from a deck."""
        deck = self.get_deck(deck_id, user_id)
        if not deck:
            return False
        orig_len = len(deck.get("flashcards", []))
        deck["flashcards"] = [c for c in deck.get("flashcards", []) if c.get("id") != card_id]
        if len(deck["flashcards"]) < orig_len:
            deck["cards_count"] = len(deck["flashcards"])
            self.save_deck(deck)
            return True
        return False

    def add_quiz(self, deck_id: str, user_id: str, quiz_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Add a new quiz question to a deck."""
        deck = self.get_deck(deck_id, user_id)
        if not deck:
            return None
        quiz_id = quiz_data.get("id") or f"qz_{uuid.uuid4().hex[:8]}"
        quiz_item = {
            "id": quiz_id,
            "question": quiz_data.get("question", "").strip(),
            "options": quiz_data.get("options", []),
            "answer": int(quiz_data.get("answer", 0)),
            "explanation": quiz_data.get("explanation", "").strip(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        deck["quizzes"].append(quiz_item)
        deck["quizzes_count"] = len(deck["quizzes"])
        self.save_deck(deck)
        return quiz_item

    def update_quiz(self, deck_id: str, user_id: str, quiz_id: str, quiz_updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update an existing quiz question in a deck."""
        deck = self.get_deck(deck_id, user_id)
        if not deck:
            return None
        found_quiz = None
        for q in deck.get("quizzes", []):
            if q.get("id") == quiz_id:
                q.update({k: v for k, v in quiz_updates.items() if k != "id"})
                if "answer" in q:
                    q["answer"] = int(q["answer"])
                found_quiz = q
                break
        if found_quiz:
            self.save_deck(deck)
        return found_quiz

    def delete_quiz(self, deck_id: str, user_id: str, quiz_id: str) -> bool:
        """Remove a quiz question from a deck."""
        deck = self.get_deck(deck_id, user_id)
        if not deck:
            return False
        orig_len = len(deck.get("quizzes", []))
        deck["quizzes"] = [q for q in deck.get("quizzes", []) if q.get("id") != quiz_id]
        if len(deck["quizzes"]) < orig_len:
            deck["quizzes_count"] = len(deck["quizzes"])
            self.save_deck(deck)
            return True
        return False

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


