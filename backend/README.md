# 🧠 Mneme Backend Engine

Production-grade middleware and API backend for **Mneme**, an AI-powered Active Recall platform.

Powered by **Flask (async)**, **Celery + Redis**, **MongoDB (PyMongo / Motor)**, **Qdrant (Vector DB)**, and **LangGraph** with local 4-bit **google/gemma-2b-it** (BitsAndBytes QLoRA).

---

## 🏗️ Architecture Overview

```
Mneme/
├── backend/
│   ├── app.py                     # Application Factory & SPA Static Serving
│   ├── config.py                  # Environment & Typed Settings
│   ├── celery_app.py              # Celery Distributed Task Queue Config
│   ├── requirements.txt           # Production Python Dependencies
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes.py              # Flask Blueprint: REST Endpoints & SSE Streaming
│   ├── services/
│   │   ├── __init__.py
│   │   ├── llm_service.py         # Thread-safe Singleton 4-bit Gemma 2B Manager
│   │   ├── database.py            # Multi-Tenant MongoDB Collection Manager
│   │   ├── qdrant_service.py      # Qdrant Vector Client with Mandatory Tenant Isolation
│   │   └── embedding_service.py   # Text Embedding Generator
│   ├── workflows/
│   │   ├── __init__.py
│   │   ├── state.py               # TypedDict States & Pydantic Validation Schemas
│   │   ├── generator_graph.py     # Flashcard & Quiz Graph (Generate -> Validate -> Retry)
│   │   ├── blurt_graph.py         # Blurt Mode Semantic Diff Graph
│   │   └── chat_graph.py          # Unified Socratic & Feynman Graph with IntentRouter
│   ├── tasks/
│   │   ├── __init__.py
│   │   └── celery_tasks.py        # Background PDF Ingestion & Deck Generation Tasks
│   └── tests/
│       ├── test_api_endpoints.py   # API and SPA Routing Integration Tests
│       ├── test_llm_service.py     # Singleton, Thread-safety & Formatting Tests
│       ├── test_tenant_isolation.py# Strict user_id Vector Filtering Tests
│       └── test_workflows.py       # LangGraph Self-Correction & Routing Tests
├── frontend/                      # Lovable-generated React / Tailwind SPA
│   ├── dist/                      # Static assets served on / by Flask
├── docker-compose.yml             # MongoDB, Redis, and Qdrant infrastructure
├── run_backend.sh                 # Fast application launcher
└── run_celery.sh                  # Celery worker launcher
```

---

## 🔒 Privacy & Performance Guarantees

1. **Multi-Tenant Vector Search**:
   - Every single vector query and chunk upsert in Qdrant strictly enforces payload filtering by `user_id`.
   - Keyword payload indexes on `user_id` and `document_id` ensure microsecond query performance across millions of document chunks.
2. **Singleton LLM Manager**:
   - `google/gemma-2b-it` in 4-bit BitsAndBytes quantization (`nf4`, double quantization, `torch.float16`) is loaded into GPU VRAM exactly once as a thread-safe singleton.
   - Prevents catastrophic VRAM Out-Of-Memory (OOM) crashes across concurrent web requests.
   - Comprehensive error recovery intercepts `torch.cuda.OutOfMemoryError` and empties GPU cache gracefully.
3. **Resilient Fallback Storage**:
   - If MongoDB, Qdrant, or Redis instances are temporarily offline, the backend transitions automatically to an in-memory fallback layer, ensuring unit tests and development servers never crash.

---

## 🧠 LangGraph Workflows

### 1. Flashcard / Quiz Graph (`generator_graph.py`)
- **Nodes**: `Generate` (invokes Gemma) ➔ `ValidateJSON` (validates with Pydantic).
- **Self-Correction Edge**: If Pydantic validation fails, loops back to `Generate` with an error feedback prompt (up to 3 retries) before terminating.

### 2. Blurt Mode Graph (`blurt_graph.py`)
- **Nodes**: `EmbedUserBlurt` ➔ `QueryQdrant` (retrieves top-k ground truth chunks with tenant filter) ➔ `CompareLLM` (extracts `recalled_concepts` and `missed_concepts`).

### 3. Unified Socratic & Feynman Chat Graph (`chat_graph.py`)
- **State**: `user_message`, `chat_history`, `retrieved_context`, `intent_type`, `ai_response`.
- **Nodes**:
  - `RetrieveContext`: Semantic search in Qdrant restricted to `user_id`.
  - `IntentRouter`: Lightweight classifier determining whether input is an `"ask"` or `"teach"`.
  - `SocraticAnswer` (if `"ask"`): Answers strictly using note context with a reflective follow-up question.
  - `FeynmanCritique` (if `"teach"`): Scans explanation for jargon or missing steps, or validates mastery.

---

## 🌐 REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serves `index.html` from `../frontend/dist` |
| `GET` | `/<path:path>` | Serves static assets or falls back to `index.html` (React Router) |
| `POST` | `/api/v1/upload` | Accepts PDF (`multipart/form-data`), queues Celery ingestion task |
| `POST` | `/api/v1/decks/generate` | Queues LangGraph flashcard/quiz generation task |
| `GET` | `/api/v1/tasks/<task_id>` | Polling endpoint for background task status |
| `POST` | `/api/v1/blurt/evaluate` | Synchronously runs Blurt Graph and returns semantic diff JSON |
| `POST` | `/api/v1/chat/stream` | Server-Sent Events (SSE) stream (`text/event-stream`) for tutor |
| `GET` | `/api/v1/decks` | List flashcard and quiz decks |
| `GET` | `/api/v1/decks/<deck_id>` | Retrieve specific deck items |
| `POST` | `/api/v1/decks/<deck_id>/review`| Record spaced-repetition card review rating |
| `GET` | `/api/v1/health` | Comprehensive health check (DBs, Qdrant, LLM) |

---

## 🚀 Quickstart Guide

### 1. Launch Databases via Docker Compose
```bash
docker compose up -d
```
Starts:
- **MongoDB**: `localhost:27017`
- **Redis**: `localhost:6379`
- **Qdrant**: `localhost:6333`

### 2. Start Celery Background Worker
```bash
./run_celery.sh
```

### 3. Start Flask Web Server
```bash
./run_backend.sh
```
Or directly:
```bash
python app.py
```

### 4. Run Test Suite
```bash
.venv/bin/pytest backend/tests -v
```
All 16 unit and integration tests run in under 45 seconds with 100% test pass rate!

