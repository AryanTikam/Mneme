import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
  Layers,
} from "lucide-react";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/mneme/AppShell";
import { useStudyDeck, useUserStats } from "@/services/mneme";

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

type QuestionResult = {
  questionIndex: number;
  question: string;
  picked: number;
  correctAnswer: number;
  isCorrect: boolean;
  explanation: string;
};

function QuizPage() {
  const { allDecks, activeDeck, activeDeckId, setActiveDeckId, mcqs, deleteDeck } =
    useStudyDeck("quiz");
  const { recordActivity } = useUserStats();
  const navigate = useNavigate();

  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [history, setHistory] = useState<QuestionResult[]>([]);

  const total = mcqs.length;
  const isCompleted = total > 0 && qi >= total;
  const q = !isCompleted && mcqs[qi] ? mcqs[qi] : null;

  const handleDeckChange = (newDeckId: string) => {
    setActiveDeckId(newDeckId);
    setQi(0);
    setPicked(null);
    setCorrect(0);
    setHistory([]);
  };

  const handleRestart = () => {
    setQi(0);
    setPicked(null);
    setCorrect(0);
    setHistory([]);
  };

  const choose = (i: number) => {
    if (picked !== null || !q) return;
    setPicked(i);
    const isRight = i === q.answer;
    if (isRight) setCorrect((c) => c + 1);
    recordActivity("quiz_attempt", { isRight });

    setHistory((prev) => [
      ...prev,
      {
        questionIndex: qi,
        question: q.question,
        picked: i,
        correctAnswer: q.answer,
        isCorrect: isRight,
        explanation: q.explanation,
      },
    ]);
  };

  const handleNext = () => {
    setPicked(null);
    setQi((n) => n + 1);
  };

  const handleDeleteCurrentDeck = async () => {
    if (!activeDeck) return;
    if (confirm(`Are you sure you want to delete deck "${activeDeck.title}"?`)) {
      await deleteDeck(activeDeck.id);
      handleRestart();
    }
  };

  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Active Recall"
        title="Diagnostic Quiz"
        subtitle="Test your conceptual retention with AI-generated questions and instant pedagogical explanations."
      />

      {/* Top Deck Selector & Controls */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-muted-foreground">Active Quiz:</label>
          {allDecks.length > 0 ? (
            <div className="relative">
              <select
                value={activeDeckId}
                onChange={(e) => handleDeckChange(e.target.value)}
                className="appearance-none rounded-2xl border border-border bg-card px-4 py-2 pr-9 font-semibold shadow-soft outline-none focus:ring-2 focus:ring-primary"
              >
                {allDecks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.quizzes?.length ?? 0} questions)
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No quiz decks available</span>
          )}
        </div>

        {activeDeck && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestart}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
              title="Restart Quiz"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restart
            </button>
            <button
              onClick={handleDeleteCurrentDeck}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-destructive transition hover:bg-destructive-soft"
              title="Delete Quiz"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        )}
      </div>

      {total === 0 ? (
        <div className="mx-auto max-w-md rounded-[2rem] bg-card p-10 text-center shadow-soft">
          <p className="font-display text-xl font-bold">No quiz questions in this deck</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Upload your study notes on the dashboard to generate a custom diagnostic quiz.
          </p>
          <Link
            to="/"
            className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Go to Upload
          </Link>
        </div>
      ) : isCompleted ? (
        /* Completion & Review Screen */
        <motion.div
          key="quiz-completed"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-auto max-w-2xl space-y-6"
        >
          <div className="rounded-[2rem] bg-card p-8 text-center shadow-elevated">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-primary text-primary-foreground shadow-md mb-4">
              <Sparkles className="h-8 w-8" />
            </div>
            <h2 className="font-display text-2xl font-bold">Quiz Completed!</h2>
            <p className="mt-1 text-muted-foreground">
              {activeDeck?.title || "Study Material"}
            </p>

            <div className="my-6 flex items-center justify-center gap-4">
              <div className="rounded-2xl bg-secondary px-6 py-3 text-center">
                <span className="block font-display text-3xl font-bold text-foreground">
                  {correct} / {total}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">Score</span>
              </div>
              <div className="rounded-2xl bg-success-soft px-6 py-3 text-center">
                <span className="block font-display text-3xl font-bold text-success">
                  {percentage}%
                </span>
                <span className="text-xs font-semibold text-success">Accuracy</span>
              </div>
            </div>

            <p className="text-sm font-semibold text-foreground">
              {percentage >= 80
                ? "Outstanding Mastery! You have deeply retained these concepts."
                : percentage >= 50
                ? "Good Foundation! Review the missed questions below to solidify your understanding."
                : "Active Recall Recommended: Re-read the notes or practice flashcards to close gaps."}
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                onClick={handleRestart}
                className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
              >
                <RotateCcw className="h-4 w-4" /> Retake Quiz
              </button>
              <Link
                to="/flashcards"
                className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm transition hover:opacity-90"
              >
                <Layers className="h-4 w-4" /> Study as Flashcards
              </Link>
              <Link
                to="/"
                className="flex items-center gap-2 rounded-full bg-secondary px-5 py-2.5 text-sm font-semibold text-secondary-foreground transition hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" /> Return to Dashboard
              </Link>
            </div>
          </div>

          {/* Detailed Question Review Breakdown */}
          <div className="space-y-4">
            <h3 className="font-display text-lg font-bold">Review Questions</h3>
            {history.map((h, idx) => (
              <div
                key={idx}
                className={`rounded-3xl p-6 shadow-soft ${
                  h.isCorrect ? "bg-card border border-success/30" : "bg-card border border-destructive/30"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Question {idx + 1}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      h.isCorrect
                        ? "bg-success-soft text-success"
                        : "bg-destructive-soft text-destructive"
                    }`}
                  >
                    {h.isCorrect ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {h.isCorrect ? "Correct" : "Missed"}
                  </span>
                </div>
                <p className="font-semibold text-foreground text-base">{h.question}</p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  <strong className="text-foreground">AI Explanation: </strong>
                  {h.explanation}
                </p>
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        /* Active Question Display */
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">
              Question {qi + 1} of {total}
            </span>
            <span className="font-semibold text-muted-foreground">
              {correct} correct
            </span>
          </div>

          <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full bg-gradient-primary"
              animate={{
                width: `${(((qi + (picked !== null ? 1 : 0)) / total) * 100)}%`,
              }}
            />
          </div>

          {q && (
            <AnimatePresence mode="wait">
              <motion.div
                key={qi}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
              >
                <h2 className="font-display text-2xl font-bold leading-snug md:text-3xl">
                  {q.question}
                </h2>
                <div className="mt-8 grid gap-3">
                  {q.options.map((opt, i) => {
                    const isAnswer = i === q.answer;
                    const state =
                      picked === null
                        ? "idle"
                        : isAnswer
                        ? "right"
                        : picked === i
                        ? "wrong"
                        : "dim";
                    const cls = {
                      idle: "bg-card shadow-soft hover:shadow-elevated",
                      right: "bg-success text-success-foreground shadow-elevated",
                      wrong: "bg-destructive text-destructive-foreground",
                      dim: "bg-card opacity-50",
                    }[state];

                    return (
                      <motion.button
                        key={i}
                        whileHover={picked === null ? { scale: 1.01 } : {}}
                        whileTap={picked === null ? { scale: 0.99 } : {}}
                        onClick={() => choose(i)}
                        className={`flex items-center gap-4 rounded-2xl px-5 py-4 text-left font-medium transition-colors ${cls}`}
                      >
                        <span
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
                            state === "idle" || state === "dim"
                              ? "bg-secondary text-secondary-foreground"
                              : "bg-card/25"
                          }`}
                        >
                          {state === "right" ? (
                            <Check className="h-4 w-4" />
                          ) : state === "wrong" ? (
                            <X className="h-4 w-4" />
                          ) : (
                            String.fromCharCode(65 + i)
                          )}
                        </span>
                        {opt}
                      </motion.button>
                    );
                  })}
                </div>

                <AnimatePresence>
                  {picked !== null && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-6 rounded-3xl bg-secondary p-6">
                        <p className="flex items-center gap-2 text-sm font-semibold text-secondary-foreground">
                          <Sparkles className="h-4 w-4" /> AI explanation
                        </p>
                        <p className="mt-2 leading-relaxed text-secondary-foreground">
                          {q.explanation}
                        </p>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleNext}
                          className="mt-5 flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md"
                        >
                          {qi + 1 >= total ? "View Final Results" : "Next question"}{" "}
                          <ArrowRight className="h-4 w-4" />
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      )}
    </AppShell>
  );
}
