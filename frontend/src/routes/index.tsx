import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { CheckCircle2, FileUp, Layers, HelpCircle, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/mneme/AppShell";
import { useDecks, useUploadDocument } from "@/services/mneme";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mneme — AI Active Recall Studio" },
      { name: "description", content: "Upload notes and turn them into flashcards, quizzes and recall drills powered by AI." },
      { property: "og:title", content: "Mneme — AI Active Recall Studio" },
      { property: "og:description", content: "Upload notes and turn them into flashcards, quizzes and recall drills powered by AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const STAGES = [
  { key: "extracting", label: "Extracting concepts" },
  { key: "vectorizing", label: "Vectorizing to Qdrant" },
  { key: "saving", label: "Generating Qwen 27B Decks" },
] as const;

function Dashboard() {
  const { stage, progress, fileName, upload, reset } = useUploadDocument();
  const { decks, deleteDeck, setActiveDeckId } = useDecks();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const busy = stage !== "idle" && stage !== "done";
  const activeIdx = STAGES.findIndex((s) => s.key === stage);

  const handle = (f?: File) => f && !busy && upload(f);

  const handleOpenDeck = (deck: (typeof decks)[0]) => {
    setActiveDeckId(deck.id);
    if (deck.mode === "quiz") {
      navigate({ to: "/quiz" });
    } else {
      navigate({ to: "/flashcards" });
    }
  };

  const handleDeleteDeck = async (e: React.MouseEvent, deckId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this deck?")) {
      setDeletingId(deckId);
      await deleteDeck(deckId);
      setDeletingId(null);
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Good afternoon"
        title="What will you remember today?"
        subtitle="Drop a PDF and Mneme distills it into high-yield flashcards, quizzes and active recall drills."
      />

      <motion.div
        whileHover={{ y: -4 }}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handle(e.dataTransfer.files[0]);
        }}
        onClick={() => stage === "idle" && inputRef.current?.click()}
        className={`cursor-pointer rounded-[2rem] border-2 border-dashed bg-card p-10 text-center shadow-soft transition-shadow hover:shadow-elevated md:p-14 ${
          drag ? "border-primary bg-secondary" : "border-border"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.md,.docx"
          className="hidden"
          onChange={(e) => handle(e.target.files?.[0])}
        />
        {stage === "idle" && (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-primary text-primary-foreground shadow-elevated">
              <FileUp className="h-7 w-7" />
            </div>
            <h2 className="mt-5 font-display text-xl font-bold">Drop your study material</h2>
            <p className="mt-1 text-sm text-muted-foreground">PDF, DOCX or Markdown · up to 50 MB</p>
          </>
        )}
        {stage !== "idle" && (
          <div className="mx-auto max-w-md text-left" onClick={(e) => e.stopPropagation()}>
            <p className="truncate text-sm font-semibold">{fileName}</p>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
              <motion.div
                className={`h-full rounded-full ${stage === "done" ? "bg-success" : "bg-gradient-primary"}`}
                animate={{ width: `${progress}%` }}
                transition={{ ease: "easeOut" }}
              />
            </div>
            <ul className="mt-5 space-y-2">
              {STAGES.map((s, i) => {
                const done = stage === "done" || i < activeIdx;
                const active = i === activeIdx;
                return (
                  <li
                    key={s.key}
                    className={`flex items-center gap-3 text-sm ${
                      done ? "text-foreground" : active ? "text-primary font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <span className={`h-4 w-4 rounded-full border-2 ${active ? "animate-pulse border-primary" : "border-border"}`} />
                    )}
                    {s.label}
                  </li>
                );
              })}
            </ul>
            {stage === "done" && (
              <div className="mt-6 flex gap-2">
                <Link to="/flashcards" className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                  Start studying
                </Link>
                <button onClick={reset} className="rounded-full bg-secondary px-5 py-2.5 text-sm font-semibold text-secondary-foreground">
                  Upload another
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>

      <div className="mb-4 mt-12 flex items-center justify-between">
        <h3 className="font-display text-lg font-bold">Your decks ({decks.length})</h3>
        <span className="text-xs text-muted-foreground">Click a deck to start active recall</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {decks.length === 0 ? (
          <div className="col-span-2 rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center">
            <Layers className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="font-semibold text-foreground">No decks yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Upload your notes or study material above to generate your first active recall deck.</p>
          </div>
        ) : (
          decks.map((d, i) => (
            <motion.div
              key={d.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="group relative cursor-pointer rounded-3xl bg-card p-5 shadow-soft transition-all hover:shadow-elevated"
              onClick={() => handleOpenDeck(d)}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`grid h-11 w-11 place-items-center rounded-2xl ${d.hue} text-primary-foreground shadow-sm`}>
                    {d.mode === "quiz" ? <HelpCircle className="h-5 w-5" /> : <Layers className="h-5 w-5" />}
                  </div>
                  <div>
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                      d.mode === "quiz" ? "bg-accent/20 text-accent-foreground" : "bg-primary/20 text-primary"
                    }`}>
                      {d.mode === "quiz" ? "Diagnostic Quiz" : "Flashcards"}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleDeleteDeck(e, d.id)}
                    disabled={deletingId === d.id}
                    className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground opacity-60 transition-all hover:bg-destructive-soft hover:text-destructive hover:opacity-100"
                    title="Delete Deck"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <p className="mt-4 font-semibold text-foreground">{d.title}</p>
              <p className="text-sm text-muted-foreground">
                {d.cards} {d.mode === "quiz" ? "questions" : "cards"}
              </p>

              <div className="mt-4 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-success" style={{ width: `${d.mastery}%` }} />
                </div>
                <span className="text-xs font-semibold">{d.mastery}%</span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </AppShell>
  );
}
