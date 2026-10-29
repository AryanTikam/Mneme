import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/mneme/AppShell";
import { useStudyDeck } from "@/services/mneme";

export const Route = createFileRoute("/quiz")({
  head: () => ({
    meta: [
      { title: "Diagnostic Quiz — Mneme" },
      { name: "description", content: "Test your understanding with AI-generated multiple-choice questions and instant explanations." },
      { property: "og:title", content: "Diagnostic Quiz — Mneme" },
      { property: "og:description", content: "Test your understanding with AI-generated multiple-choice questions and instant explanations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuizPage,
});

function QuizPage() {
  const { mcqs } = useStudyDeck("neuro");
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const q = mcqs[qi % mcqs.length]!;

  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    if (i === q.answer) setCorrect((c) => c + 1);
  };

  return (
    <AppShell>
      <PageHeader eyebrow={`Question ${(qi % mcqs.length) + 1} of ${mcqs.length} · ${correct} correct`} title="Diagnostic Quiz" />
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div className="h-full bg-gradient-primary" animate={{ width: `${(((qi % mcqs.length) + (picked !== null ? 1 : 0)) / mcqs.length) * 100}%` }} />
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={qi} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
            <h2 className="font-display text-2xl font-bold leading-snug md:text-3xl">{q.question}</h2>
            <div className="mt-8 grid gap-3">
              {q.options.map((opt, i) => {
                const isAnswer = i === q.answer;
                const state = picked === null ? "idle" : isAnswer ? "right" : picked === i ? "wrong" : "dim";
                const cls = {
                  idle: "bg-card shadow-soft hover:shadow-elevated",
                  right: "bg-success text-success-foreground shadow-elevated",
                  wrong: "bg-destructive text-destructive-foreground",
                  dim: "bg-card opacity-50",
                }[state];
                return (
                  <motion.button key={i} whileHover={picked === null ? { scale: 1.02 } : {}} whileTap={picked === null ? { scale: 0.98 } : {}} onClick={() => choose(i)} className={`flex items-center gap-4 rounded-2xl px-5 py-4 text-left font-medium transition-colors ${cls}`}>
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${state === "idle" || state === "dim" ? "bg-secondary text-secondary-foreground" : "bg-card/25"}`}>
                      {state === "right" ? <Check className="h-4 w-4" /> : state === "wrong" ? <X className="h-4 w-4" /> : String.fromCharCode(65 + i)}
                    </span>
                    {opt}
                  </motion.button>
                );
              })}
            </div>
            <AnimatePresence>
              {picked !== null && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="mt-6 rounded-3xl bg-secondary p-6">
                    <p className="flex items-center gap-2 text-sm font-semibold text-secondary-foreground"><Sparkles className="h-4 w-4" /> AI explanation</p>
                    <p className="mt-2 leading-relaxed text-secondary-foreground">{q.explanation}</p>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { setPicked(null); setQi((n) => n + 1); }} className="mt-5 flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                      Next question <ArrowRight className="h-4 w-4" />
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
