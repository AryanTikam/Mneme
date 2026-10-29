// Mock service layer. Each hook mirrors a future FastAPI endpoint
// (MongoDB for decks/progress, Qdrant for vector retrieval). Swap the
// bodies for real fetch calls later; component contracts stay the same.
import { useCallback, useEffect, useRef, useState } from "react";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Deck = { id: string; title: string; cards: number; mastery: number; updated: string; hue: string };
export type Flashcard = { id: string; front: string; back: string };
export type Mcq = { id: string; question: string; options: string[]; answer: number; explanation: string };

export const DECKS: Deck[] = [
  { id: "neuro", title: "Neuroscience of Memory", cards: 42, mastery: 72, updated: "2h ago", hue: "bg-primary" },
  { id: "bio", title: "Cell Biology Essentials", cards: 36, mastery: 54, updated: "Yesterday", hue: "bg-success" },
  { id: "econ", title: "Macroeconomics 101", cards: 28, mastery: 31, updated: "3d ago", hue: "bg-primary-glow" },
  { id: "ml", title: "Intro to Machine Learning", cards: 51, mastery: 88, updated: "1w ago", hue: "bg-destructive" },
];

const CARDS: Flashcard[] = [
  { id: "1", front: "What is the hippocampus primarily responsible for?", back: "Consolidating short-term memories into long-term declarative memory." },
  { id: "2", front: "Define the 'testing effect'.", back: "Retrieving information from memory strengthens it more than re-reading it." },
  { id: "3", front: "What is spaced repetition?", back: "Reviewing material at increasing intervals to exploit the spacing effect and slow forgetting." },
  { id: "4", front: "What does long-term potentiation (LTP) describe?", back: "A persistent strengthening of synapses following high-frequency stimulation." },
  { id: "5", front: "Ebbinghaus' forgetting curve shows…", back: "Memory retention drops exponentially over time without review." },
];

const MCQS: Mcq[] = [
  { id: "q1", question: "Which brain region is most associated with forming new declarative memories?", options: ["Cerebellum", "Hippocampus", "Amygdala", "Brainstem"], answer: 1, explanation: "The hippocampus binds events and facts into durable traces; damage (e.g. patient H.M.) prevents new declarative memories while procedural learning survives." },
  { id: "q2", question: "The 'testing effect' suggests that…", options: ["Re-reading is the best strategy", "Highlighting boosts retention", "Retrieval practice strengthens memory", "Sleep is unrelated to memory"], answer: 2, explanation: "Actively pulling information out of memory creates stronger, more retrievable traces than passive review." },
  { id: "q3", question: "Spaced repetition works best when intervals…", options: ["Shrink over time", "Stay constant", "Are random", "Grow over time"], answer: 3, explanation: "Expanding intervals review an item just before it would be forgotten, maximising effort and retention per review." },
];

export type UploadStage = "idle" | "extracting" | "vectorizing" | "saving" | "done";
export function useUploadDocument() {
  const [stage, setStage] = useState<UploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const upload = useCallback(async (file: File) => {
    setFileName(file.name);
    const steps: UploadStage[] = ["extracting", "vectorizing", "saving"];
    for (let i = 0; i < steps.length; i++) {
      setStage(steps[i]!);
      for (let p = 0; p <= 10; p++) {
        setProgress(Math.round(((i + p / 10) / steps.length) * 100));
        await wait(110);
      }
    }
    setStage("done");
    setProgress(100);
  }, []);
  const reset = () => { setStage("idle"); setProgress(0); setFileName(null); };
  return { stage, progress, fileName, upload, reset };
}

export function useStudyDeck(_deckId: string) {
  return { deck: DECKS[0], flashcards: CARDS, mcqs: MCQS };
}

export type AuditResult = { recalled_concepts: string[]; missed_concepts: string[] };
const GROUND_TRUTH = ["hippocampus", "consolidation", "long-term potentiation", "synapse", "spaced repetition", "forgetting curve", "sleep", "retrieval practice", "encoding"];
export function useBlurtAudit() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const audit = useCallback(async (text: string, _documentId: string) => {
    setLoading(true);
    await wait(1600);
    const lower = text.toLowerCase();
    const recalled = GROUND_TRUTH.filter((c) => lower.includes(c) || lower.includes(c.split(" ")[0]!));
    setResult({ recalled_concepts: recalled, missed_concepts: GROUND_TRUTH.filter((c) => !recalled.includes(c)) });
    setLoading(false);
  }, []);
  return { loading, result, audit, reset: () => setResult(null) };
}

export type ChatMsg = { id: string; role: "user" | "ai"; text: string; searching?: boolean };
const REPLIES = [
  "Nice start! Imagine explaining it to a 10-year-old — what would the hippocampus be, if your brain were a library?",
  "Good — now, why would reviewing *later* beat reviewing right away? Think about effort.",
  "You used a few technical terms there. Can you say it again using only everyday words?",
  "That's much clearer. What's one example from your own life where this happened?",
];
export function useChatStream() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: "0", role: "ai", text: "Hi! Pick any concept and teach it to me like I know nothing. I'll ask questions to find the gaps." },
  ]);
  const [simplicity, setSimplicity] = useState(60);
  const turn = useRef(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const send = useCallback(async (message: string, _contextId: string) => {
    const words = message.split(/\s+/).filter(Boolean);
    const longWords = words.filter((w) => w.length > 9).length;
    setSimplicity(Math.max(10, Math.min(98, 92 - longWords * 14 - Math.max(0, words.length - 30) + Math.random() * 8)));
    const aiId = crypto.randomUUID();
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: message }, { id: aiId, role: "ai", text: "", searching: true }]);
    await wait(1200);
    const full = REPLIES[turn.current++ % REPLIES.length]!;
    let out = "";
    for (const w of full.split(" ")) {
      if (!alive.current) return;
      out += (out ? " " : "") + w;
      const t = out;
      setMessages((m) => m.map((x) => (x.id === aiId ? { ...x, text: t, searching: false } : x)));
      await wait(45);
    }
  }, []);
  return { messages, simplicity, send };
}
