import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, RotateCcw, Sparkles, Timer } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/mneme/AppShell";
import { useBlurtAudit } from "@/services/mneme";

export const Route = createFileRoute("/blurt")({
  head: () => ({
    meta: [
      { title: "Blurt Mode — Mneme" },
      { name: "description", content: "Write everything you remember, then let AI audit which concepts you recalled and missed." },
      { property: "og:title", content: "Blurt Mode — Mneme" },
      { property: "og:description", content: "Write everything you remember, then let AI audit which concepts you recalled and missed." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BlurtPage,
});

function highlight(text: string, terms: string[]): ReactNode[] {
  if (!terms.length) return [text];
  const keys: string[] = terms.flatMap((t) => [t, t.split(" ")[0] ?? t]).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? <mark key={i} className="rounded-md bg-success-soft px-1 font-semibold text-success">{part}</mark> : part,
  );
}

function BlurtPage() {
  const [text, setText] = useState("");
  const [seconds, setSeconds] = useState(300);
  const { loading, result, audit, reset } = useBlurtAudit();

  useEffect(() => {
    if (result || loading || seconds <= 0) return;
    const t = setInterval(() => setSeconds((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [result, loading, seconds]);

  const rendered = useMemo(() => (result ? highlight(text, result.recalled_concepts) : null), [result, text]);
  const mm = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <AppShell>
      <PageHeader eyebrow="Active recall" title="Blurt Mode" subtitle="Write down everything you remember about the Neuroscience of Memory. No peeking." />

      <div className="relative">
        <div className={`absolute -top-14 right-0 flex items-center gap-2 rounded-full px-4 py-2 font-mono text-sm font-semibold shadow-soft ${seconds < 60 ? "bg-destructive-soft text-destructive" : "bg-card"}`}>
          <Timer className="h-4 w-4" /> {mm}
        </div>

        <AnimatePresence mode="wait">
          {!result && !loading && (
            <motion.div key="write" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <textarea
                value={text} onChange={(e) => setText(e.target.value)} autoFocus
                placeholder="Start typing… the hippocampus helps with…"
                className="min-h-[360px] w-full resize-none rounded-[2rem] bg-card p-8 text-lg leading-relaxed shadow-soft outline-none placeholder:text-muted-foreground focus:shadow-elevated"
              />
              <div className="mt-6 flex justify-center">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={!text.trim()} onClick={() => audit(text, "neuro")} className="flex items-center gap-2 rounded-full bg-gradient-primary px-8 py-4 font-semibold text-primary-foreground shadow-elevated disabled:opacity-40">
                  <Brain className="h-5 w-5" /> Audit Memory
                </motion.button>
              </div>
            </motion.div>
          )}

          {loading && (
            <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3 rounded-[2rem] bg-card p-8 shadow-soft">
              {[90, 75, 85, 60, 40].map((w, i) => <div key={i} className="h-4 animate-pulse rounded-full bg-muted" style={{ width: `${w}%` }} />)}
              <p className="pt-4 text-sm text-muted-foreground">Matching your recall against source concepts…</p>
            </motion.div>
          )}

          {result && (
            <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="rounded-[2rem] bg-card p-8 shadow-soft">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold">Your recall</h2>
                  <span className="rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success">{result.recalled_concepts.length} concepts matched</span>
                </div>
                <p className="whitespace-pre-wrap text-lg leading-relaxed">{rendered}</p>
              </div>
              <div className="rounded-[2rem] bg-destructive-soft p-8">
                <h2 className="font-display text-lg font-bold text-destructive">Missed Concepts</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.missed_concepts.map((c, i) => (
                    <motion.span key={c} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} className="rounded-full bg-destructive px-4 py-1.5 text-sm font-semibold capitalize text-destructive-foreground">{c}</motion.span>
                  ))}
                  {!result.missed_concepts.length && <p className="text-sm">Nothing missed — impressive!</p>}
                </div>
                <div className="mt-6 flex flex-wrap gap-3">
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => toast.success(`${result.missed_concepts.length} flashcards added to your deck`)} className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                    <Sparkles className="h-4 w-4" /> Generate Flashcards for Missed Concepts
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { reset(); setText(""); setSeconds(300); }} className="flex items-center gap-2 rounded-full bg-card px-5 py-2.5 text-sm font-semibold">
                    <RotateCcw className="h-4 w-4" /> Try again
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
