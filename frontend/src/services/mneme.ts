import { useCallback, useEffect, useRef, useState } from "react";

export type UserProfile = {
  user_id: string;
  username: string;
  name: string;
  created_at?: string;
};

export type Folder = {
  folder_id: string;
  user_id: string;
  name: string;
  color: string;
  order?: number;
  created_at?: string;
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

export type Deck = {
  id: string;
  deck_id?: string;
  title: string;
  user_id?: string;
  document_id?: string | null;
  document_ids?: string[];
  folder_id?: string | null;
  color?: string;
  order?: number;
  flashcards: Flashcard[];
  quizzes: Mcq[];
  cards_count: number;
  quizzes_count: number;
  mastery: number;
  updated: string;
  hue: string;
  mode?: "flashcards" | "quiz" | "both";
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

const LOCAL_USER_KEY = "mneme_active_user";
const LOCAL_DECKS_KEY = "mneme_user_decks";
const LOCAL_ACTIVE_DECK_KEY = "mneme_active_deck_id";
const LOCAL_DOC_KEY = "mneme_active_document_id";
const USER_EVENT_NAME = "mneme_user_changed";
export const FOLDERS_CHANGED_EVENT = "mneme_folders_changed";
export const DECKS_CHANGED_EVENT = "mneme_decks_changed";
export const DOCS_CHANGED_EVENT = "mneme_docs_changed";

export function notifyFoldersChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FOLDERS_CHANGED_EVENT));
  }
}

export function notifyDecksChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DECKS_CHANGED_EVENT));
  }
}

export function notifyDocsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DOCS_CHANGED_EVENT));
  }
}

export const FOLDER_COLORS = [
  { label: "Indigo", value: "indigo", bg: "bg-indigo-500/10 text-indigo-500 border-indigo-500/30", dot: "bg-indigo-500" },
  { label: "Emerald", value: "emerald", bg: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30", dot: "bg-emerald-500" },
  { label: "Violet", value: "violet", bg: "bg-violet-500/10 text-violet-500 border-violet-500/30", dot: "bg-violet-500" },
  { label: "Amber", value: "amber", bg: "bg-amber-500/10 text-amber-500 border-amber-500/30", dot: "bg-amber-500" },
  { label: "Rose", value: "rose", bg: "bg-rose-500/10 text-rose-500 border-rose-500/30", dot: "bg-rose-500" },
  { label: "Sky", value: "sky", bg: "bg-sky-500/10 text-sky-500 border-sky-500/30", dot: "bg-sky-500" },
];

export function getFolderColor(colorKey?: string) {
  return FOLDER_COLORS.find((c) => c.value === colorKey) || FOLDER_COLORS[0];
}

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

export function getCurrentUser(): UserProfile | null {
  return getStoredJson<UserProfile | null>(LOCAL_USER_KEY, null);
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const user = getCurrentUser();
  const headers = new Headers(options.headers || {});
  if (!headers.has("X-User-Id")) {
    headers.set("X-User-Id", user ? user.user_id : "user_default");
  }
  return fetch(path, {
    ...options,
    headers,
  });
}

// -------------------------------------------------------------
// USER / AUTH HOOK
// -------------------------------------------------------------
export function useAuth() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(getCurrentUser);
  const [loading, setLoading] = useState(false);

  const login = useCallback(
    async (username: string, password: string): Promise<{ success: boolean; error?: string; user?: UserProfile }> => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });
        const data = await res.json();
        if (res.ok && data.user) {
          const user = data.user as UserProfile;
          setCurrentUser(user);
          setStoredJson(LOCAL_USER_KEY, user);
          window.dispatchEvent(new CustomEvent(USER_EVENT_NAME, { detail: user }));
          return { success: true, user };
        } else {
          return { success: false, error: data.error || "Invalid username or password" };
        }
      } catch (e: any) {
        console.error("Failed to login:", e);
        return { success: false, error: "Network error. Please check connection." };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const register = useCallback(
    async (
      username: string,
      password: string,
      name?: string
    ): Promise<{ success: boolean; error?: string; user?: UserProfile }> => {
      setLoading(true);
      try {
        const res = await fetch("/api/v1/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password, name }),
        });
        const data = await res.json();
        if (res.ok && data.user) {
          const user = data.user as UserProfile;
          setCurrentUser(user);
          setStoredJson(LOCAL_USER_KEY, user);
          window.dispatchEvent(new CustomEvent(USER_EVENT_NAME, { detail: user }));
          return { success: true, user };
        } else {
          return { success: false, error: data.error || "Registration failed. Username may be taken." };
        }
      } catch (e: any) {
        console.error("Failed to register:", e);
        return { success: false, error: "Network error. Please check connection." };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const logout = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(LOCAL_USER_KEY);
      localStorage.removeItem(LOCAL_DECKS_KEY);
      localStorage.removeItem(LOCAL_ACTIVE_DECK_KEY);
      localStorage.removeItem(LOCAL_DOC_KEY);
    }
    setCurrentUser(null);
    window.dispatchEvent(new CustomEvent(USER_EVENT_NAME, { detail: null }));
  }, []);

  const deleteAccount = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/v1/auth/profile", {
        method: "DELETE",
      });
      if (res.ok) {
        logout();
        return true;
      }
    } catch (e) {
      console.error("Failed to delete account:", e);
    } finally {
      setLoading(false);
    }
    return false;
  }, [logout]);

  useEffect(() => {
    const handleUserChanged = (e: any) => {
      setCurrentUser(e.detail !== undefined ? e.detail : getCurrentUser());
    };
    window.addEventListener(USER_EVENT_NAME, handleUserChanged);
    return () => window.removeEventListener(USER_EVENT_NAME, handleUserChanged);
  }, []);

  return {
    currentUser,
    loading,
    login,
    register,
    logout,
    deleteAccount,
  };
}

// -------------------------------------------------------------
// USER STATS & COGNITIVE METRICS HOOK
// -------------------------------------------------------------
export interface UserStats {
  streak_days: number;
  mastery_percentage: number;
  total_decks: number;
  total_cards: number;
  total_quizzes: number;
  mastered_cards: number;
  total_documents: number;
  active_recall_label: string;
}

export const STATS_CHANGED_EVENT = "mneme:stats_changed";
export function notifyStatsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(STATS_CHANGED_EVENT));
  }
}

export function useUserStats() {
  const [stats, setStats] = useState<UserStats>({
    streak_days: 1,
    mastery_percentage: 0,
    total_decks: 0,
    total_cards: 0,
    total_quizzes: 0,
    mastered_cards: 0,
    total_documents: 0,
    active_recall_label: "Active recall mastery active",
  });
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await apiFetch("/api/v1/users/stats");
      if (res.ok) {
        const data = await res.json();
        setStats({
          streak_days: data.streak_days ?? 1,
          mastery_percentage: data.mastery_percentage ?? 0,
          total_decks: data.total_decks ?? 0,
          total_cards: data.total_cards ?? 0,
          total_quizzes: data.total_quizzes ?? 0,
          mastered_cards: data.mastered_cards ?? 0,
          total_documents: data.total_documents ?? 0,
          active_recall_label: data.active_recall_label || "Active recall mastery active",
        });
      }
    } catch (e) {
      console.error("Failed to fetch user stats:", e);
    }
  }, []);

  const recordActivity = useCallback(async (action: string = "review", metadata?: Record<string, any>) => {
    try {
      await apiFetch("/api/v1/users/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, metadata }),
      });
      notifyStatsChanged();
    } catch (e) {
      console.error("Failed to record activity:", e);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const handleStats = () => fetchStats();
    const handleDecks = () => fetchStats();
    const handleUser = () => fetchStats();
    window.addEventListener(STATS_CHANGED_EVENT, handleStats);
    window.addEventListener(DECKS_CHANGED_EVENT, handleDecks);
    window.addEventListener(USER_EVENT_NAME, handleUser);
    return () => {
      window.removeEventListener(STATS_CHANGED_EVENT, handleStats);
      window.removeEventListener(DECKS_CHANGED_EVENT, handleDecks);
      window.removeEventListener(USER_EVENT_NAME, handleUser);
    };
  }, [fetchStats]);

  return { stats, loading, refreshStats: fetchStats, recordActivity };
}

// -------------------------------------------------------------
// FOLDERS HOOK
// -------------------------------------------------------------
export function useFolders() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshFolders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/v1/folders");
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders || []);
      }
    } catch (e) {
      console.error("Failed to fetch folders:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const createFolder = useCallback(
    async (name: string, color: string = "indigo") => {
      try {
        const res = await apiFetch("/api/v1/folders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, color }),
        });
        if (res.ok) {
          const data = await res.json();
          setFolders((prev) => [...prev, data.folder as Folder]);
          notifyFoldersChanged();
          return data.folder as Folder;
        }
      } catch (e) {
        console.error("Failed to create folder:", e);
      }
      return null;
    },
    []
  );

  const updateFolder = useCallback(
    async (folderId: string, updates: { name?: string; color?: string; order?: number }) => {
      // Optimistic update: zero latency
      setFolders((prev) =>
        prev.map((f) => (f.folder_id === folderId ? { ...f, ...updates } : f))
      );
      notifyFoldersChanged();
      try {
        const res = await apiFetch(`/api/v1/folders/${folderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (res.ok) {
          const data = await res.json();
          notifyFoldersChanged();
          return data.folder as Folder;
        }
      } catch (e) {
        console.error("Failed to update folder:", e);
        refreshFolders();
        notifyFoldersChanged();
      }
      return null;
    },
    [refreshFolders]
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      // Optimistic delete
      setFolders((prev) => prev.filter((f) => f.folder_id !== folderId));
      notifyFoldersChanged();
      try {
        const res = await apiFetch(`/api/v1/folders/${folderId}`, { method: "DELETE" });
        if (res.ok) {
          notifyFoldersChanged();
          return true;
        }
      } catch (e) {
        console.error("Failed to delete folder:", e);
        refreshFolders();
        notifyFoldersChanged();
      }
      return false;
    },
    [refreshFolders]
  );

  useEffect(() => {
    refreshFolders();
    const handleUserChanged = () => refreshFolders();
    const handleFoldersChanged = () => refreshFolders();
    window.addEventListener(USER_EVENT_NAME, handleUserChanged);
    window.addEventListener(FOLDERS_CHANGED_EVENT, handleFoldersChanged);
    return () => {
      window.removeEventListener(USER_EVENT_NAME, handleUserChanged);
      window.removeEventListener(FOLDERS_CHANGED_EVENT, handleFoldersChanged);
    };
  }, [refreshFolders]);

  return {
    folders,
    loading,
    refreshFolders,
    createFolder,
    updateFolder,
    deleteFolder,
  };
}

// -------------------------------------------------------------
// HELPER TO NORMALIZE SERVER DECK TO UNIFIED DECK
// -------------------------------------------------------------
function normalizeDeck(raw: any): Deck {
  const flashcards: Flashcard[] = (raw.flashcards || []).map((c: any, idx: number) => ({
    id: c.id || `c_${idx + 1}`,
    front: c.front || "",
    back: c.back || "",
  }));

  const quizzes: Mcq[] = (raw.quizzes || []).map((q: any, idx: number) => ({
    id: q.id || `q_${idx + 1}`,
    question: q.question || "",
    options: Array.isArray(q.options) ? q.options : [],
    answer: typeof q.answer === "number" ? q.answer : 0,
    explanation: q.explanation || "",
  }));

  const id = raw.deck_id || raw.id;
  const cardsCount = raw.cards_count ?? flashcards.length;
  const quizzesCount = raw.quizzes_count ?? quizzes.length;

  const rawDocIds: string[] = Array.isArray(raw.document_ids)
    ? raw.document_ids
    : raw.document_id
    ? [raw.document_id]
    : [];

  return {
    id,
    deck_id: id,
    title: raw.title || "Study Material",
    user_id: raw.user_id || "user_default",
    document_id: rawDocIds[0] || raw.document_id || null,
    document_ids: rawDocIds,
    folder_id: raw.folder_id || null,
    color: raw.color || "indigo",
    order: raw.order ?? 0,
    flashcards,
    quizzes,
    cards_count: cardsCount,
    quizzes_count: quizzesCount,
    mastery: raw.mastery || 0,
    updated: raw.updated || "Recently",
    hue: raw.hue || "bg-primary",
    mode: raw.mode || "both",
  };
}

// -------------------------------------------------------------
// DECKS HOOK (WITH SEARCH, FILTER, SORT)
// -------------------------------------------------------------
export type DecksFilterOptions = {
  folderId?: string | null;
  search?: string;
  sortBy?: "updated" | "title" | "cards" | "quizzes" | "order";
};

export function useDecks(filterOptions?: DecksFilterOptions) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeDeckId, setActiveDeckIdState] = useState<string>("");

  const folderId = filterOptions?.folderId;
  const search = filterOptions?.search;
  const sortBy = filterOptions?.sortBy;

  const setActiveDeckId = useCallback((id: string) => {
    setActiveDeckIdState(id);
    setStoredJson(LOCAL_ACTIVE_DECK_KEY, id);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (folderId !== undefined && folderId !== null) params.set("folder_id", folderId);
      if (search) params.set("search", search);
      if (sortBy) params.set("sort_by", sortBy);

      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await apiFetch(`/api/v1/decks${qs}`);
      if (res.ok) {
        const data = await res.json();
        const mapped = (data.decks || []).map(normalizeDeck);
        setDecks(mapped);
        setStoredJson(LOCAL_DECKS_KEY, mapped);

        setActiveDeckIdState((prevActive) => {
          const exists = mapped.some((d: Deck) => d.id === prevActive);
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
  }, [folderId, search, sortBy]);

  const createDeck = useCallback(
    async (title: string, folder_id?: string | null, color?: string, document_ids?: string[]) => {
      try {
        const res = await apiFetch("/api/v1/decks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, folder_id, color, document_ids }),
        });
        if (res.ok) {
          const data = await res.json();
          await refresh();
          notifyDecksChanged();
          return normalizeDeck(data.deck);
        }
      } catch (e) {
        console.error("Failed to create deck:", e);
      }
      return null;
    },
    [refresh]
  );

  const updateDeck = useCallback(
    async (deckId: string, updates: { title?: string; folder_id?: string | null; color?: string; order?: number; document_ids?: string[] }) => {
      // Optimistic instant state update across all instances
      setDecks((prev) =>
        prev.map((d) => (d.id === deckId ? { ...d, ...updates } : d))
      );
      notifyDecksChanged();
      try {
        const res = await apiFetch(`/api/v1/decks/${deckId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (res.ok) {
          const data = await res.json();
          notifyDecksChanged();
          return normalizeDeck(data.deck);
        }
      } catch (e) {
        console.error("Failed to update deck:", e);
        refresh();
        notifyDecksChanged();
      }
      return null;
    },
    [refresh]
  );

  const moveDeck = useCallback(
    async (deckId: string, targetFolderId: string | null, order: number = 0) => {
      try {
        const res = await apiFetch(`/api/v1/decks/${deckId}/move`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder_id: targetFolderId, order }),
        });
        if (res.ok) {
          await refresh();
          notifyDecksChanged();
          return true;
        }
      } catch (e) {
        console.error("Failed to move deck:", e);
      }
      return false;
    },
    [refresh]
  );

  const deleteDeck = useCallback(
    async (deckId: string) => {
      try {
        const res = await apiFetch(`/api/v1/decks/${deckId}`, { method: "DELETE" });
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
          notifyDecksChanged();
          return true;
        }
      } catch (e) {
        console.error("Failed to delete deck:", e);
      }
      return false;
    },
    [decks]
  );

  useEffect(() => {
    refresh();
    const handleUserChanged = () => refresh();
    const handleDecksChanged = () => refresh();
    window.addEventListener(USER_EVENT_NAME, handleUserChanged);
    window.addEventListener(DECKS_CHANGED_EVENT, handleDecksChanged);
    return () => {
      window.removeEventListener(USER_EVENT_NAME, handleUserChanged);
      window.removeEventListener(DECKS_CHANGED_EVENT, handleDecksChanged);
    };
  }, [refresh]);

  return {
    decks,
    loading,
    refresh,
    createDeck,
    updateDeck,
    moveDeck,
    deleteDeck,
    activeDeckId,
    setActiveDeckId,
  };
}

// -------------------------------------------------------------
// DECK DETAILS HOOK (CARDS & QUIZZES CRUD + AI GENERATE MORE)
// -------------------------------------------------------------
export function useDeckDetails(deckId: string | null) {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const refreshDeck = useCallback(async () => {
    if (!deckId) {
      setDeck(null);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/decks/${deckId}`);
      if (res.ok) {
        const data = await res.json();
        setDeck(normalizeDeck(data.deck));
      }
    } catch (e) {
      console.error("Failed to load deck details:", e);
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  const addCard = useCallback(
    async (front: string, back: string) => {
      if (!deckId) return null;
      try {
        const res = await apiFetch(`/api/v1/decks/${deckId}/cards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ front, back }),
        });
        if (res.ok) {
          const data = await res.json();
          setDeck(normalizeDeck(data.deck));
          notifyDecksChanged();
          return data.card;
        }
      } catch (e) {
        console.error("Failed to add card:", e);
      }
      return null;
    },
    [deckId]
  );

  const updateCard = useCallback(
    async (cardId: string, front: string, back: string) => {
      if (!deckId) return false;
      try {
        const res = await apiFetch(`/api/v1/decks/${deckId}/cards/${cardId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ front, back }),
        });
        if (res.ok) {
          const data = await res.json();
          setDeck(normalizeDeck(data.deck));
          notifyDecksChanged();
          return true;
        }
      } catch (e) {
        console.error("Failed to update card:", e);
      }
      return false;
    },
    [deckId]
  );

  const deleteCard = useCallback(
    async (cardId: string) => {
      if (!deckId) return false;
      try {
        const res = await apiFetch(`/api/v1/decks/${deckId}/cards/${cardId}`, { method: "DELETE" });
        if (res.ok) {
          const data = await res.json();
          setDeck(normalizeDeck(data.deck));
          notifyDecksChanged();
          return true;
        }
      } catch (e) {
        console.error("Failed to delete card:", e);
      }
      return false;
    },
    [deckId]
  );

  const addQuiz = useCallback(
    async (question: string, options: string[], answer: number, explanation: string) => {
      if (!deckId) return null;
      try {
        const res = await apiFetch(`/api/v1/decks/${deckId}/quizzes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, options, answer, explanation }),
        });
        if (res.ok) {
          const data = await res.json();
          setDeck(normalizeDeck(data.deck));
          notifyDecksChanged();
          return data.quiz;
        }
      } catch (e) {
        console.error("Failed to add quiz question:", e);
      }
      return null;
    },
    [deckId]
  );

  const updateQuiz = useCallback(
    async (quizId: string, updates: { question?: string; options?: string[]; answer?: number; explanation?: string }) => {
      if (!deckId) return false;
      try {
        const res = await apiFetch(`/api/v1/decks/${deckId}/quizzes/${quizId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
        if (res.ok) {
          const data = await res.json();
          setDeck(normalizeDeck(data.deck));
          notifyDecksChanged();
          return true;
        }
      } catch (e) {
        console.error("Failed to update quiz:", e);
      }
      return false;
    },
    [deckId]
  );

  const deleteQuiz = useCallback(
    async (quizId: string) => {
      if (!deckId) return false;
      try {
        const res = await apiFetch(`/api/v1/decks/${deckId}/quizzes/${quizId}`, { method: "DELETE" });
        if (res.ok) {
          const data = await res.json();
          setDeck(normalizeDeck(data.deck));
          notifyDecksChanged();
          return true;
        }
      } catch (e) {
        console.error("Failed to delete quiz:", e);
      }
      return false;
    },
    [deckId]
  );

  const generateMore = useCallback(
    async (mode: "flashcards" | "quiz" | "both" = "both", count: number = 5, prompt?: string, document_ids?: string[]) => {
      if (!deckId) return null;
      setGenerating(true);
      try {
        const res = await apiFetch(`/api/v1/decks/${deckId}/generate-more`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, count, prompt, document_ids }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.deck) {
            setDeck(normalizeDeck(data.deck));
          }
          const taskId = data.task_id;
          if (taskId && !taskId.startsWith("sync_")) {
            let attempts = 0;
            while (attempts < 30) {
              await new Promise((r) => setTimeout(r, 1200));
              const taskRes = await apiFetch(`/api/v1/tasks/${taskId}`);
              if (taskRes.ok) {
                const taskData = await taskRes.json();
                if (taskData.status === "SUCCESS") {
                  if (taskData.result?.deck) {
                    setDeck(normalizeDeck(taskData.result.deck));
                  }
                  break;
                }
                if (taskData.status === "FAILURE") throw new Error(taskData.error || "Generation failed");
              }
              attempts++;
            }
          }
          await refreshDeck();
          notifyDecksChanged();
          return true;
        }
      } catch (e) {
        console.error("Failed to generate more items:", e);
      } finally {
        setGenerating(false);
      }
      return false;
    },
    [deckId, refreshDeck]
  );

  useEffect(() => {
    refreshDeck();
  }, [refreshDeck]);

  return {
    deck,
    setDeck,
    loading,
    generating,
    refreshDeck,
    addCard,
    updateCard,
    deleteCard,
    addQuiz,
    updateQuiz,
    deleteQuiz,
    generateMore,
  };
}

// -------------------------------------------------------------
// DECK CONTEXTS HOOK (MANAGE ATTACHED DOCUMENTS PER DECK)
// -------------------------------------------------------------
export function useDeckContexts(deckId: string | null) {
  const [attachedDocs, setAttachedDocs] = useState<MnemeDocument[]>([]);
  const [availableDocs, setAvailableDocs] = useState<MnemeDocument[]>([]);
  const [allDocs, setAllDocs] = useState<MnemeDocument[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshContexts = useCallback(async () => {
    if (!deckId) {
      setAttachedDocs([]);
      setAvailableDocs([]);
      setAllDocs([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/decks/${deckId}/contexts`);
      if (res.ok) {
        const data = await res.json();
        setAttachedDocs(data.attached_documents || []);
        setAvailableDocs(data.available_documents || []);
        setAllDocs(data.all_documents || []);
      }
    } catch (e) {
      console.error("Failed to fetch deck contexts:", e);
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  const attachDoc = useCallback(
    async (documentId: string) => {
      if (!deckId) return false;
      try {
        const res = await apiFetch(`/api/v1/decks/${deckId}/contexts/attach`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_id: documentId }),
        });
        if (res.ok) {
          await refreshContexts();
          notifyDecksChanged();
          notifyDocsChanged();
          return true;
        }
      } catch (e) {
        console.error("Failed to attach context:", e);
      }
      return false;
    },
    [deckId, refreshContexts]
  );

  const detachDoc = useCallback(
    async (documentId: string) => {
      if (!deckId) return false;
      try {
        const res = await apiFetch(`/api/v1/decks/${deckId}/contexts/detach`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_id: documentId }),
        });
        if (res.ok) {
          await refreshContexts();
          notifyDecksChanged();
          notifyDocsChanged();
          return true;
        }
      } catch (e) {
        console.error("Failed to detach context:", e);
      }
      return false;
    },
    [deckId, refreshContexts]
  );

  const uploadDocToDeck = useCallback(
    async (file: File) => {
      if (!deckId) return null;
      setLoading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await apiFetch(`/api/v1/decks/${deckId}/contexts/upload`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          await refreshContexts();
          notifyDecksChanged();
          notifyDocsChanged();
          return data;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Upload failed with server status ${res.status}`);
        }
      } catch (e: any) {
        console.error("Failed to upload context to deck:", e);
        throw e;
      } finally {
        setLoading(false);
      }
      return null;
    },
    [deckId, refreshContexts]
  );

  const deleteDocPermanently = useCallback(
    async (documentId: string) => {
      try {
        const res = await apiFetch(`/api/v1/documents/${documentId}`, { method: "DELETE" });
        if (res.ok) {
          await refreshContexts();
          notifyDecksChanged();
          notifyDocsChanged();
          return true;
        }
      } catch (e) {
        console.error("Failed to delete document permanently:", e);
      }
      return false;
    },
    [refreshContexts]
  );

  useEffect(() => {
    refreshContexts();
    const handleDocsChanged = () => refreshContexts();
    window.addEventListener(DOCS_CHANGED_EVENT, handleDocsChanged);
    return () => window.removeEventListener(DOCS_CHANGED_EVENT, handleDocsChanged);
  }, [refreshContexts]);

  return {
    attachedDocs,
    availableDocs,
    allDocs,
    loading,
    refreshContexts,
    attachDoc,
    detachDoc,
    deleteDocPermanently,
    uploadDocToDeck,
  };
}

// -------------------------------------------------------------
// USER DOCUMENTS LIBRARY HOOK
// -------------------------------------------------------------
export function useDocuments() {
  const [documents, setDocuments] = useState<MnemeDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeDocId, setActiveDocIdState] = useState<string>("");

  const setActiveDocId = useCallback((id: string) => {
    setActiveDocIdState(id);
    setStoredJson(LOCAL_DOC_KEY, id);
  }, []);

  const refreshDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/v1/documents");
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
      console.error("Failed to fetch documents:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteDocument = useCallback(
    async (documentId: string) => {
      try {
        const res = await apiFetch(`/api/v1/documents/${documentId}`, { method: "DELETE" });
        if (res.ok || res.status === 404) {
          setDocuments((prev) => prev.filter((d) => d.document_id !== documentId));
          notifyDocsChanged();
          notifyDecksChanged();
          return true;
        }
      } catch (e) {
        console.error("Failed to delete document:", e);
      }
      return false;
    },
    []
  );

  useEffect(() => {
    const storedDoc = getStoredJson<string>(LOCAL_DOC_KEY, "");
    if (storedDoc) {
      setActiveDocIdState(storedDoc);
    }
    refreshDocuments();
    const handleDocsChanged = () => refreshDocuments();
    const handleUserChanged = () => refreshDocuments();
    window.addEventListener(DOCS_CHANGED_EVENT, handleDocsChanged);
    window.addEventListener(USER_EVENT_NAME, handleUserChanged);
    return () => {
      window.removeEventListener(DOCS_CHANGED_EVENT, handleDocsChanged);
      window.removeEventListener(USER_EVENT_NAME, handleUserChanged);
    };
  }, [refreshDocuments]);

  return {
    documents,
    activeDocId,
    setActiveDocId,
    loading,
    refresh: refreshDocuments,
    refreshDocuments,
    deleteDocument,
  };
}

// -------------------------------------------------------------
// STUDY DECK HOOK (UNIFIED FLASHCARDS + QUIZ)
// -------------------------------------------------------------
export function useStudyDeck(_targetMode?: "flashcards" | "quiz") {
  const { decks, loading, refresh, deleteDeck, activeDeckId, setActiveDeckId } = useDecks();

  // Active deck contains BOTH flashcards and quizzes
  const activeDeck =
    decks.find((d) => d.id === activeDeckId) ||
    decks[0] ||
    null;

  const flashcards: Flashcard[] = activeDeck?.flashcards || [];
  const mcqs: Mcq[] = activeDeck?.quizzes || [];

  const recordCardReview = useCallback(
    async (cardId: string, rating: "good" | "again") => {
      if (!activeDeck) return;
      try {
        if (rating === "good") {
          const card = activeDeck.flashcards?.find((c) => c.id === cardId);
          const nextMastery = Math.min(5, (card?.mastery || 0) + 1);
          await apiFetch(`/api/v1/decks/${activeDeck.id}/cards/${cardId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mastery: nextMastery }),
          });
        }
        await apiFetch("/api/v1/users/activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "flashcard_review", metadata: { cardId, rating } }),
        });
        notifyStatsChanged();
      } catch (e) {
        console.error("Failed to record card review:", e);
      }
    },
    [activeDeck]
  );

  return {
    allDecks: decks,
    activeDeck,
    activeDeckId: activeDeck?.id || "",
    setActiveDeckId,
    flashcards,
    mcqs,
    loading,
    refresh,
    deleteDeck,
    recordCardReview,
  };
}

// -------------------------------------------------------------
// UPLOAD DOCUMENT HOOK (UNIFIED BOTH DECK CREATION)
// -------------------------------------------------------------
export type UploadStage = "idle" | "extracting" | "vectorizing" | "saving" | "done";

export function useUploadDocument() {
  const [stage, setStage] = useState<UploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [createdDeckId, setCreatedDeckId] = useState<string | null>(null);

  const upload = useCallback(async (file: File) => {
    setFileName(file.name);
    setStage("extracting");
    setProgress(15);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await apiFetch("/api/v1/upload", {
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
          const taskRes = await apiFetch(`/api/v1/tasks/${taskId}`);
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

      // Generate unified deck containing BOTH flashcards and quiz questions
      const genRes = await apiFetch("/api/v1/decks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document_id: documentId,
          mode: "both",
          title: file.name.replace(/\.[^/.]+$/, ""),
        }),
      });

      if (genRes.ok) {
        const genData = await genRes.json();
        const genTaskId = genData.task_id;
        if (genTaskId && !genTaskId.startsWith("sync_")) {
          let genAttempts = 0;
          while (genAttempts < 30) {
            await new Promise((r) => setTimeout(r, 1000));
            const tRes = await apiFetch(`/api/v1/tasks/${genTaskId}`);
            if (tRes.ok) {
              const tData = await tRes.json();
              if (tData.status === "SUCCESS") break;
              if (tData.status === "FAILURE") break;
            }
            genAttempts++;
          }
        }
      }

      const decksRes = await apiFetch("/api/v1/decks");
      if (decksRes.ok) {
        const decksData = await decksRes.json();
        const serverDecks: Deck[] = (decksData.decks || []).map(normalizeDeck);

        if (serverDecks.length > 0) {
          setStoredJson(LOCAL_DECKS_KEY, serverDecks);
          const firstNew = serverDecks.find((d) => d.document_id === documentId || (d.document_ids && d.document_ids.includes(documentId))) || serverDecks[0];
          if (firstNew) {
            setStoredJson(LOCAL_ACTIVE_DECK_KEY, firstNew.id);
            setCreatedDeckId(firstNew.id);
          }
        }
      }

      setProgress(100);
      setStage("done");
      notifyDecksChanged();
      notifyDocsChanged();
    } catch (err) {
      console.error("Upload & generation failed:", err);
      setProgress(100);
      setStage("done");
      notifyDecksChanged();
      notifyDocsChanged();
    }
  }, []);

  const reset = () => {
    setStage("idle");
    setProgress(0);
    setFileName(null);
    setCreatedDeckId(null);
  };

  return { stage, progress, fileName, createdDeckId, upload, reset };
}

// -------------------------------------------------------------
// BLURT AUDIT HOOK
// -------------------------------------------------------------
export type AuditResult = {
  recalled_concepts: string[];
  missed_concepts: string[];
  score: number;
  feedback: string;
};

export function useBlurtAudit() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);

  const audit = useCallback(
    async (text: string, deckId?: string, documentId?: string) => {
      setLoading(true);

      try {
        const res = await apiFetch("/api/v1/blurt/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deck_id: deckId && deckId !== "all" ? deckId : undefined,
            document_id: documentId && documentId !== "all" ? documentId : undefined,
            blurt_text: text,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setResult({
            recalled_concepts: data.recalled_concepts || [],
            missed_concepts: data.missed_concepts || [],
            score: data.score ?? (data.recalled_concepts?.length ? Math.round((data.recalled_concepts.length / (data.recalled_concepts.length + (data.missed_concepts?.length || 0))) * 100) : 0),
            feedback: data.feedback || "",
          });
          notifyStatsChanged();
        } else {
          const err = await res.json().catch(() => ({}));
          setResult({
            recalled_concepts: [],
            missed_concepts: [],
            score: 0,
            feedback: err.error || "Failed to audit blurt against knowledge base.",
          });
        }
      } catch (err: any) {
        console.error("Blurt evaluation failed:", err);
        setResult({
          recalled_concepts: [],
          missed_concepts: [],
          score: 0,
          feedback: "Network error connecting to evaluation service.",
        });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setResult(null);
  }, []);

  return {
    loading,
    result,
    audit,
    reset,
  };
}

// -------------------------------------------------------------
// CHAT STREAM & FEYNMAN SIMPLICITY
// -------------------------------------------------------------
export type ChatMsg = { id: string; role: "user" | "ai"; text: string; searching?: boolean };

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const clean = w.replace(/(?:[^laeiouy]|ed|es|e)$/, "").replace(/^y/, "");
  const matches = clean.match(/[aeiouy]{1,2}/g);
  return matches ? Math.max(1, matches.length) : 1;
}

export function computeFleschSimplicity(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 75;
  const sentences = Math.max(1, trimmed.split(/[.!?]+/).filter((s) => s.trim().length > 0).length);
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 75;
  const totalSyllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
  
  // Standard Flesch Reading Ease: 206.835 - 1.015 * (words/sentences) - 84.6 * (syllables/words)
  const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (totalSyllables / words.length);
  return Math.round(Math.max(10, Math.min(100, score)));
}

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

  const send = useCallback(
    async (message: string, deckId?: string, documentId?: string) => {
      // Compute deterministic linguistic clarity via Flesch Reading Ease
      setSimplicity(computeFleschSimplicity(message));

      const aiId = crypto.randomUUID();
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "user", text: message },
        { id: aiId, role: "ai", text: "", searching: true },
      ]);

      try {
        const response = await apiFetch("/api/v1/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId.current,
            message,
            deck_id: deckId && deckId !== "all" ? deckId : undefined,
            document_id: documentId && documentId !== "all" ? documentId : undefined,
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
    []
  );

  return { messages, simplicity, send };
}
