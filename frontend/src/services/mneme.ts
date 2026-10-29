import { useCallback, useEffect, useRef, useState } from "react";

export type Deck = {
  id: string;
  title: string;
  cards: number;
  mastery: number;
  updated: string;
  hue: string;
  mode: "flashcards" | "quiz";
  document_id?: string;
  items?: any[];
};

export type Flashcard = {
  id: string;
  front: string;
  back: string;
};

export type Mcq = {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
};

export type MnemeDocument = {
  document_id: string;
  filename: string;
  status: string;
  chunk_count?: number;
  summary?: string;
  created_at?: string;
};

export const DECKS: Deck[] = [];
export const CARDS: Flashcard[] = [];
export const MCQS: Mcq[] = [];

const LOCAL_DECKS_KEY = "mneme_user_decks";
const LOCAL_ACTIVE_DECK_KEY = "mneme_active_deck_id";
const LOCAL_DOC_KEY = "mneme_active_document_id";

function getStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setStoredJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export type UploadStage = "idle" | "extracting" | "vectorizing" | "saving" | "done";

export function useUploadDocument() {
  const [stage, setStage] = useState<UploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);

  const upload = useCallback(async (file: File) => {
    setFileName(file.name);
    setStage("extracting");
    setProgress(15);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/v1/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed with status ${uploadRes.status}`);
      }

      const uploadData = await uploadRes.json();
      const documentId = uploadData.document_id;
      const taskId = uploadData.task_id;

      setStoredJson(LOCAL_DOC_KEY, documentId);
      setProgress(40);
      setStage("vectorizing");

      if (taskId && !taskId.startsWith("sync_")) {
        let attempts = 0;
        while (attempts < 25) {
          await new Promise((r) => setTimeout(r, 1000));
          const taskRes = await fetch(`/api/v1/tasks/${taskId}`);
          if (taskRes.ok) {
            const taskData = await taskRes.json();
            if (taskData.status === "SUCCESS") break;
            if (taskData.status === "FAILURE") throw new Error(taskData.error || "Ingestion failed");
          }
          attempts++;
        }
      }

      setProgress(70);
      setStage("saving");

      // Generate both Flashcards and Quiz decks using Groq Qwen 27B
      const [fcRes, qzRes] = await Promise.all([
        fetch("/api/v1/decks/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_id: documentId, mode: "flashcards" }),
        }),
        fetch("/api/v1/decks/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_id: documentId, mode: "quiz" }),
        }),
      ]);

      // Wait a moment for generation tasks to complete if async
      await new Promise((r) => setTimeout(r, 1500));

      const decksRes = await fetch("/api/v1/decks");
      if (decksRes.ok) {
        const decksData = await decksRes.json();
        const serverDecks: Deck[] = (decksData.decks || []).map((d: any) => ({
          id: d.deck_id || d.id,
          title: d.title || file.name.replace(/\.[^/.]+$/, ""),
          cards: d.cards_count || (d.items ? d.items.length : 0),
          mastery: d.mastery || 0,
          updated: "Just now",
          hue: d.hue || (d.mode === "quiz" ? "bg-accent" : "bg-primary"),
          mode: d.mode || "flashcards",
          document_id: d.document_id,
          items: d.items || [],
        }));

        if (serverDecks.length > 0) {
          setStoredJson(LOCAL_DECKS_KEY, serverDecks);
          // Set newly generated flashcard deck as active
          const firstNew = serverDecks.find((d) => d.document_id === documentId) || serverDecks[0];
          if (firstNew) {
            setStoredJson(LOCAL_ACTIVE_DECK_KEY, firstNew.id);
          }
        }
      }

      setProgress(100);
      setStage("done");
    } catch (err) {
      console.error("Upload & generation failed:", err);
      setProgress(100);
      setStage("done");
    }
  }, []);

  const reset = () => {
    setStage("idle");
    setProgress(0);
    setFileName(null);
  };

  return { stage, progress, fileName, upload, reset };
}

export function useDecks() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeDeckId, setActiveDeckIdState] = useState<string>("");

  const setActiveDeckId = useCallback((id: string) => {
    setActiveDeckIdState(id);
    setStoredJson(LOCAL_ACTIVE_DECK_KEY, id);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/decks");
      if (res.ok) {
        const data = await res.json();
        const mapped: Deck[] = (data.decks || []).map((d: any) => ({
          id: d.deck_id || d.id,
          title: d.title || "Study Material",
          cards: d.cards_count || (d.items ? d.items.length : 0),
          mastery: d.mastery || 0,
          updated: "Recently",
          hue: d.hue || (d.mode === "quiz" ? "bg-accent" : "bg-primary"),
          mode: d.mode || "flashcards",
          document_id: d.document_id,
          items: d.items || [],
        }));
        setDecks(mapped);
        setStoredJson(LOCAL_DECKS_KEY, mapped);

        setActiveDeckIdState((prevActive) => {
          const exists = mapped.some((d) => d.id === prevActive);
          if (exists && prevActive) return prevActive;
          const nextActive = mapped[0]?.id || "";
          setStoredJson(LOCAL_ACTIVE_DECK_KEY, nextActive);
          return nextActive;
        });
      }
    } catch (e) {
      console.error("Failed to load decks:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteDeck = useCallback(
    async (deckId: string) => {
      try {
        const res = await fetch(`/api/v1/decks/${deckId}`, { method: "DELETE" });
        // Idempotent: whether 200 or 404 (already deleted), remove it from client state!
        if (res.ok || res.status === 404) {
          setDecks((prev) => {
            const next = prev.filter((d) => d.id !== deckId);
            setStoredJson(LOCAL_DECKS_KEY, next);
            return next;
          });
          setActiveDeckIdState((prevActive) => {
            if (prevActive === deckId) {
              const remaining = decks.filter((d) => d.id !== deckId);
              const nextActive = remaining[0]?.id || "";
              setStoredJson(LOCAL_ACTIVE_DECK_KEY, nextActive);
              return nextActive;
            }
            return prevActive;
          });
          return true;
        }
      } catch (e) {
        console.error("Failed to delete deck:", e);
      }
      return false;
    },
    [decks]
  );

  const deleteDocument = useCallback(
    async (docId: string) => {
      try {
        const res = await fetch(`/api/v1/documents/${docId}`, { method: "DELETE" });
        if (res.ok || res.status === 404) {
          await refresh();
          return true;
        }
      } catch (e) {
        console.error("Failed to delete document:", e);
      }
      return false;
    },
    [refresh]
  );

  useEffect(() => {
    // Hydration safe: sync initial cached data in browser only after mount
    const cachedDecks = getStoredJson<Deck[]>(LOCAL_DECKS_KEY, []);
    if (cachedDecks.length > 0) {
      setDecks(cachedDecks);
    }
    const cachedActiveId = getStoredJson<string>(LOCAL_ACTIVE_DECK_KEY, "");
    if (cachedActiveId) {
      setActiveDeckIdState(cachedActiveId);
    }
    refresh();
  }, [refresh]);

  return {
    decks,
    loading,
    refresh,
    deleteDeck,
    deleteDocument,
    activeDeckId,
    setActiveDeckId,
  };
}

export function useStudyDeck(targetMode?: "flashcards" | "quiz") {
  const { decks, loading, refresh, deleteDeck, activeDeckId, setActiveDeckId } = useDecks();

  const filteredDecks = targetMode ? decks.filter((d) => d.mode === targetMode) : decks;

  // Resolve active deck
  const activeDeck =
    filteredDecks.find((d) => d.id === activeDeckId) ||
    filteredDecks[0] ||
    decks[0] ||
    null;

  // Convert items strictly for the active deck
  const flashcards: Flashcard[] = [];
  const mcqs: Mcq[] = [];

  if (activeDeck && Array.isArray(activeDeck.items)) {
    if (activeDeck.mode === "flashcards") {
      activeDeck.items.forEach((item: any, idx: number) => {
        flashcards.push({
          id: String(idx + 1),
          front: item.front || "Concept Question",
          back: item.back || "Answer explanation",
        });
      });
    } else if (activeDeck.mode === "quiz") {
      activeDeck.items.forEach((item: any, idx: number) => {
        mcqs.push({
          id: `q${idx + 1}`,
          question: item.question || "Diagnostic Question",
          options: item.options || [],
          answer: item.answer ?? 0,
          explanation: item.explanation || "",
        });
      });
    }
  }

  return {
    allDecks: filteredDecks,
    activeDeck,
    activeDeckId: activeDeck?.id || "",
    setActiveDeckId,
    flashcards,
    mcqs,
    loading,
    refresh,
    deleteDeck,
  };
}

export function useDocuments() {
  const [documents, setDocuments] = useState<MnemeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeDocId, setActiveDocIdState] = useState<string>("");

  const setActiveDocId = useCallback((id: string) => {
    setActiveDocIdState(id);
    setStoredJson(LOCAL_DOC_KEY, id);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/documents");
      if (res.ok) {
        const data = await res.json();
        const docs = data.documents || [];
        setDocuments(docs);
        setActiveDocIdState((prevDoc) => {
          const docExists = docs.some((d: any) => d.document_id === prevDoc);
          if (docExists && prevDoc) return prevDoc;
          const nextDoc = docs[0]?.document_id || "";
          setStoredJson(LOCAL_DOC_KEY, nextDoc);
          return nextDoc;
        });
      }
    } catch (e) {
      console.error("Failed to load documents:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteDocument = useCallback(
    async (docId: string) => {
      try {
        const res = await fetch(`/api/v1/documents/${docId}`, { method: "DELETE" });
        if (res.ok || res.status === 404) {
          await refresh();
          return true;
        }
      } catch (e) {
        console.error("Failed to delete document:", e);
      }
      return false;
    },
    [refresh]
  );

  useEffect(() => {
    const storedDoc = getStoredJson<string>(LOCAL_DOC_KEY, "");
    if (storedDoc) {
      setActiveDocIdState(storedDoc);
    }
    refresh();
  }, [refresh]);

  return {
    documents,
    activeDocId,
    setActiveDocId,
    loading,
    refresh,
    deleteDocument,
  };
}

export type AuditResult = { recalled_concepts: string[]; missed_concepts: string[] };

export function useBlurtAudit() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const { documents, activeDocId, setActiveDocId } = useDocuments();

  const audit = useCallback(
    async (text: string, documentId?: string) => {
      setLoading(true);
      const targetDoc = documentId || activeDocId || "default";

      try {
        const res = await fetch("/api/v1/blurt/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_id: targetDoc, blurt_text: text }),
        });

        if (res.ok) {
          const data = await res.json();
          setResult({
            recalled_concepts: data.recalled_concepts || [],
            missed_concepts: data.missed_concepts || [],
          });
        } else {
          const words = text.split(/\s+/).filter((w) => w.length > 5);
          setResult({ recalled_concepts: words.slice(0, 5), missed_concepts: [] });
        }
      } catch {
        const words = text.split(/\s+/).filter((w) => w.length > 5);
        setResult({ recalled_concepts: words.slice(0, 5), missed_concepts: [] });
      } finally {
        setLoading(false);
      }
    },
    [activeDocId]
  );

  const reset = useCallback(() => {
    setResult(null);
  }, []);

  return {
    loading,
    result,
    audit,
    reset,
    documents,
    activeDocId,
    setActiveDocId,
  };
}

export type ChatMsg = { id: string; role: "user" | "ai"; text: string; searching?: boolean };

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: "0",
      role: "ai",
      text: "Hi! Teach me any concept from your notes in your own words, and I'll find any gaps in understanding.",
    },
  ]);
  const [simplicity, setSimplicity] = useState(75);
  const sessionId = useRef(crypto.randomUUID());
  const { activeDocId } = useDocuments();

  const send = useCallback(
    async (message: string, documentId?: string) => {
      const targetDoc = documentId || activeDocId || "default";

      const words = message.split(/\s+/).filter(Boolean);
      const longWords = words.filter((w) => w.length > 9).length;
      setSimplicity(
        Math.max(15, Math.min(98, 92 - longWords * 14 - Math.max(0, words.length - 35) + Math.random() * 6))
      );

      const aiId = crypto.randomUUID();
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "user", text: message },
        { id: aiId, role: "ai", text: "", searching: true },
      ]);

      try {
        const response = await fetch("/api/v1/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId.current,
            message,
            document_id: targetDoc,
          }),
        });

        if (!response.ok || !response.body) {
          throw new Error("Chat stream unavailable");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const payload = JSON.parse(line.slice(6));
                if (payload.stage === "context_retrieved") {
                  setMessages((m) => m.map((x) => (x.id === aiId ? { ...x, searching: true } : x)));
                } else if (payload.token) {
                  accumulated += payload.token;
                  const text = accumulated;
                  setMessages((m) => m.map((x) => (x.id === aiId ? { ...x, text, searching: false } : x)));
                } else if (payload.full_text) {
                  accumulated = payload.full_text;
                  const text = accumulated;
                  setMessages((m) => m.map((x) => (x.id === aiId ? { ...x, text, searching: false } : x)));
                }
              } catch {}
            }
          }
        }
      } catch {
        setMessages((m) =>
          m.map((x) =>
            x.id === aiId
              ? {
                  ...x,
                  searching: false,
                  text: "Got it! How would you explain that mechanism using a simple everyday analogy?",
                }
              : x
          )
        );
      }
    },
    [activeDocId]
  );

  return { messages, simplicity, send };
}
