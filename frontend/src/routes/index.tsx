import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { CheckCircle2, FileUp, Layers } from "lucide-react";
import { useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/mneme/AppShell";
import { DECKS, useUploadDocument } from "@/services/mneme";

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
  { key: "saving", label: "Saving to MongoDB" },
] as const;

function Dashboard() {
  const { stage, progress, fileName, upload, reset } = useUploadDocument();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const busy = stage !== "idle" && stage !== "done";
  const activeIdx = STAGES.findIndex((s) => s.key === stage);

  const handle = (f?: File) => f && !busy && upload(f);

  return (
    <AppShell>
      <PageHeader eyebrow="Good afternoon" title="What will you remember today?" subtitle="Drop a PDF and Mneme distills it into flashcards, quizzes and recall drills." />

      <motion.div
        whileHover={{ y: -4 }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files[0]); }}
        onClick={() => stage === "idle" && inputRef.current?.click()}
        className={`cursor-pointer rounded-[2rem] border-2 border-dashed bg-card p-10 text-center shadow-soft transition-shadow hover:shadow-elevated md:p-14 ${drag ? "border-primary bg-secondary" : "border-border"}`}
      >
        <input ref={inputRef} type="file" accept=".pdf,.txt,.md,.docx" className="hidden" onChange={(e) => handle(e.target.files?.[0])} />
        {stage === "idle" && (
          <>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-primary text-primary-foreground shadow-elevated"><FileUp className="h-7 w-7" /></div>
            <h2 className="mt-5 font-display text-xl font-bold">Drop your study material</h2>
            <p className="mt-1 text-sm text-muted-foreground">PDF, DOCX or Markdown · up to 50 MB</p>
          </>
        )}
        {stage !== "idle" && (
          <div className="mx-auto max-w-md text-left" onClick={(e) => e.stopPropagation()}>
            <p className="truncate text-sm font-semibold">{fileName}</p>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
              <motion.div className={`h-full rounded-full ${stage === "done" ? "bg-success" : "bg-gradient-primary"}`} animate={{ width: `${progress}%` }} transition={{ ease: "easeOut" }} />
            </div>
            <ul className="mt-5 space-y-2">
              {STAGES.map((s, i) => {
                const done = stage === "done" || i < activeIdx;
                const active = i === activeIdx;
                return (
                  <li key={s.key} className={`flex items-center gap-3 text-sm ${done ? "text-foreground" : active ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                    {done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <span className={`h-4 w-4 rounded-full border-2 ${active ? "animate-pulse border-primary" : "border-border"}`} />}
                    {s.label}
                  </li>
                );
              })}
            </ul>
            {stage === "done" && (
              <div className="mt-6 flex gap-2">
                <Link to="/flashcards" className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">Start studying</Link>
                <button onClick={reset} className="rounded-full bg-secondary px-5 py-2.5 text-sm font-semibold text-secondary-foreground">Upload another</button>
              </div>
            )}
          </div>
        )}
      </motion.div>

      <h3 className="mb-4 mt-12 font-display text-lg font-bold">Your decks</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        {DECKS.map((d, i) => (
          <motion.div key={d.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Link to="/flashcards" className="block rounded-3xl bg-card p-5 shadow-soft transition-shadow hover:shadow-elevated">
              <div className="flex items-start justify-between">
                <div className={`grid h-11 w-11 place-items-center rounded-2xl ${d.hue} text-primary-foreground`}><Layers className="h-5 w-5" /></div>
                <span className="text-xs text-muted-foreground">{d.updated}</span>
              </div>
              <p className="mt-4 font-semibold">{d.title}</p>
              <p className="text-sm text-muted-foreground">{d.cards} cards</p>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success" style={{ width: `${d.mastery}%` }} /></div>
                <span className="text-xs font-semibold">{d.mastery}%</span>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </AppShell>
  );
}
