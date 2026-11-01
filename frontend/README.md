# Mneme — AI Active Recall Platform

Mneme is an AI-powered active recall and knowledge consolidation studio that distills study materials into flashcards, quizzes, and Feynman-technique drills.

## Features

- **Document Ingestion & Chunking**: Automatic text extraction and semantic chunking for PDF, DOCX, and Markdown.
- **Active Recall Flashcards**: Interactive 3D flip-and-swipe cards with spaced-repetition feedback.
- **Diagnostic Quizzes**: AI-generated multiple-choice questions with full explanations.
- **Blurt Mode**: Active recall audit comparing student memory blurts against source material.
- **Feynman AI Tutor**: Context-aware drawer for questioning assumptions and explaining concepts simply.

## Tech Stack

- **Frontend**: React 19, TypeScript, TanStack Start & Router, Tailwind CSS, Framer Motion.
- **Backend**: Flask with asynchronous support, Motor / PyMongo (MongoDB), Qdrant vector database, Celery & Redis task queue.
- **AI Core**: GroqCloud with Qwen 27B / LangChain & LangGraph.

## Development

```bash
# Install frontend dependencies
npm install

# Run frontend dev server
npm run dev

# Build production distribution
npm run build
```
