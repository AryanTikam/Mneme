import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  Layers,
  Play,
  RotateCcw,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/mneme/AppShell";
import {
  getFolderColor,
  useBlurtAudit,
  useDecks,
  type Deck,
} from "@/services/mneme";

export const Route = createFileRoute("/blurt")({
  head: () => ({
    meta: [
      { title: "Blurt Mode — Mneme" },
      {
        name: "description",
        content:
          "Timed active recall arena. Write down everything you remember from your deck, then let AI audit your retention.",
      },
      { property: "og:title", content: "Blurt Mode — Mneme" },
      {
        property: "og:description",
        content:
          "Timed active recall arena. Write down everything you remember from your deck, then let AI audit your retention.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BlurtPage,
});

const PRESET_DURATIONS = [
  { label: "1 min", seconds: 60, desc: "Quick Sprint" },
  { label: "3 mins", seconds: 180, desc: "Focused Recall" },
  { label: "5 mins", seconds: 300, desc: "Standard (Recommended)" },
  { label: "10 mins", seconds: 600, desc: "Deep Exhaustive" },
];

function highlight(text: string, terms: string[]): ReactNode[] {
  if (!terms.length) return [text];
  const keys: string[] = terms
    .flatMap((t) => [t, t.split(" ")[0] ?? t])
    .sort((a, b) => b.length - a.length);
  const re = new RegExp(
    `(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi"
  );
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="rounded-md bg-success/20 text-success px-1 py-0.5 font-bold"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function BlurtPage() {
  const { decks, activeDeckId, setActiveDeckId } = useDecks();
  const { loading, result, audit, reset } = useBlurtAudit();

  // Session state: 'config' (start screen) | 'running' (active timer + typing) | 'done' (viewing audit)
  const [sessionState, setSessionState] = useState<"config" | "running">("config");
  const [selectedDeckId, setSelectedDeckId] = useState<string>("");
  const [durationSeconds, setDurationSeconds] = useState<number>(300);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(300);
  const [text, setText] = useState("");
  const [timeExpiredAlert, setTimeExpiredAlert] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const hasTriggeredExpiryAudit = useRef(false);

  // Set default deck on load or when decks change
  useEffect(() => {
    if (!selectedDeckId && decks.length > 0) {
      setSelectedDeckId(activeDeckId || decks[0].id);
    }
  }, [decks, activeDeckId, selectedDeckId]);

  const activeDeck = useMemo(
    () => decks.find((d) => d.id === selectedDeckId) || decks[0] || null,
    [decks, selectedDeckId]
  );

  // Countdown timer when session is running
  useEffect(() => {
    if (sessionState !== "running" || loading || result) return;

    if (secondsRemaining <= 0) {
      // Timer just expired!
      if (!hasTriggeredExpiryAudit.current) {
        hasTriggeredExpiryAudit.current = true;
        handleTimerExpired();
      }
      return;
    }

    const timer = setInterval(() => {
      setSecondsRemaining((s) => s - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionState, secondsRemaining, loading, result]);

  // Handle timer reaching zero
  const handleTimerExpired = () => {
    if (text.trim().length > 0) {
      setTimeExpiredAlert(true);
      toast.info("Time is up! Submitting your blurt for AI cognitive audit...");
      triggerAudit(text);
    } else {
      toast.error("Time expired with no notes entered. Review your deck and try again!");
      setSessionState("config");
    }
  };

  const startSession = () => {
    if (!activeDeck) {
      toast.error("Please select a study deck first.");
      return;
    }
    hasTriggeredExpiryAudit.current = false;
    setTimeExpiredAlert(false);
    setText("");
    reset();
    setSecondsRemaining(durationSeconds);
    setSessionState("running");
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  };

  const triggerAudit = async (blurtText: string) => {
    if (!blurtText.trim() || !activeDeck) return;
    await audit(blurtText.trim(), activeDeck.id);
  };

  const handleManualSubmit = () => {
    if (!text.trim()) {
      toast.error("Type your recalled notes before auditing.");
      return;
    }
    triggerAudit(text);
  };

  const handleRestart = () => {
    reset();
    setText("");
    setTimeExpiredAlert(false);
    hasTriggeredExpiryAudit.current = false;
    setSessionState("config");
  };

  const mm = `${Math.floor(secondsRemaining / 60)}:${String(secondsRemaining % 60).padStart(2, "0")}`;
  const progressPercent = Math.max(0, Math.min(100, ((durationSeconds - secondsRemaining) / durationSeconds) * 100));
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const rendered = useMemo(
    () => (result ? highlight(text, result.recalled_concepts) : null),
    [result, text]
  );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Active Recall"
        title="Blurt Mode"
        subtitle="Write down everything you remember from your deck without looking. Then let AI audit your retention."
      />

      {/* =================================================================== */}
      {/* 1. START / CONFIGURATION SCREEN */}
      {/* =================================================================== */}
      {sessionState === "config" && !result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto space-y-6"
        >
          {/* Intro Card */}
          <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-6 sm:p-8 shadow-soft">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-elevated">
                <Brain className="h-6 w-6" />
              </div>
              <div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground">
                  Active Recall Arena
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  Select a study deck and set your timer. When the session starts, write every concept, formula, and step you remember before the clock runs out.
                </p>
              </div>
            </div>
          </div>

          {/* Deck Selector Card */}
          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                <Layers className="h-4 w-4" />
                1. Select Target Study Deck
              </label>
              <span className="text-xs text-muted-foreground">
                {decks.length} deck{decks.length !== 1 ? "s" : ""} available
              </span>
            </div>

            {decks.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center space-y-2">
                <p className="text-sm font-semibold text-foreground">No study decks found</p>
                <p className="text-xs text-muted-foreground">
                  Create a deck or upload lecture materials from the dashboard first.
                </p>
                <Link
                  to="/"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline mt-2"
                >
                  Go to Dashboard <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {decks.map((deck) => {
                  const isSelected = (selectedDeckId || activeDeck?.id) === deck.id;
                  const colorMeta = getFolderColor(deck.color);
                  const docCount = (deck.document_ids || []).length || (deck.document_id ? 1 : 0);

                  return (
                    <button
                      key={deck.id}
                      type="button"
                      onClick={() => {
                        setSelectedDeckId(deck.id);
                        setActiveDeckId(deck.id);
                      }}
                      className={`flex flex-col text-left p-3.5 rounded-2xl border transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                          : "border-border bg-card hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${colorMeta.dot}`} />
                        <span className="font-display text-sm font-bold text-foreground truncate">
                          {deck.title}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{deck.flashcards?.length || 0} cards</span>
                        <span>•</span>
                        <span>{deck.quizzes?.length || 0} quizzes</span>
                        {docCount > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-accent font-semibold">{docCount} context{docCount > 1 ? "s" : ""}</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Duration Selector Card */}
          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                <Clock className="h-4 w-4" />
                2. Select Timer Duration
              </label>
              <span className="text-xs text-muted-foreground font-mono">
                {Math.round(durationSeconds / 60)} minutes
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {PRESET_DURATIONS.map((preset) => {
                const isSelected = durationSeconds === preset.seconds;
                return (
                  <button
                    key={preset.seconds}
                    type="button"
                    onClick={() => setDurationSeconds(preset.seconds)}
                    className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground font-bold shadow-sm"
                        : "border-border bg-card text-foreground hover:bg-muted font-medium"
                    }`}
                  >
                    <span className="text-base font-bold">{preset.label}</span>
                    <span
                      className={`text-[10px] mt-0.5 ${
                        isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                      }`}
                    >
                      {preset.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Begin Button */}
          <div className="flex justify-center pt-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={decks.length === 0}
              onClick={startSession}
              className="flex items-center gap-2.5 rounded-full bg-gradient-primary px-10 py-4 font-display text-base font-bold text-primary-foreground shadow-elevated disabled:opacity-40 transition"
            >
              <Play className="h-5 w-5 fill-current" />
              Begin Blurt Session
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* =================================================================== */}
      {/* 2. ACTIVE BLURT SESSION (RUNNING) */}
      {/* =================================================================== */}
      {sessionState === "running" && !result && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4"
        >
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="flex items-center gap-2.5">
              <span className={`h-3 w-3 rounded-full ${getFolderColor(activeDeck?.color).dot}`} />
              <div>
                <span className="text-xs text-muted-foreground">Auditing Deck:</span>
                <h3 className="font-display text-sm sm:text-base font-bold text-foreground">
                  {activeDeck?.title}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Countdown Badge */}
              <div
                className={`flex items-center gap-2 rounded-full px-4 py-2 font-mono text-sm sm:text-base font-bold transition shadow-soft ${
                  secondsRemaining < 60
                    ? "bg-destructive text-destructive-foreground animate-pulse"
                    : "bg-muted text-foreground"
                }`}
              >
                <Timer className="h-4 w-4" />
                <span>{mm}</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (confirm("Cancel this blurt session and return to deck selection?")) {
                    setSessionState("config");
                  }
                }}
                className="rounded-full p-2 text-muted-foreground hover:bg-muted transition"
                title="Cancel Session"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Time Progress Bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className={`h-full transition-all duration-300 rounded-full ${
                secondsRemaining < 60 ? "bg-destructive" : "bg-primary"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Time Expired Notice */}
          {timeExpiredAlert && (
            <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 flex items-center gap-2.5 text-xs font-semibold text-primary animate-in fade-in">
              <Sparkles className="h-4 w-4 shrink-0 animate-spin" />
              <span>Time has elapsed! Submitting your recalled notes for AI cognitive audit...</span>
            </div>
          )}

          {/* Textarea */}
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Start typing everything you can recall from "${activeDeck?.title}"...\n\nKey terms, formulas, mechanisms, workflows, derivations, and definitions...`}
              className="min-h-[380px] w-full resize-none rounded-[2rem] bg-card p-6 sm:p-8 text-base sm:text-lg leading-relaxed shadow-soft outline-none placeholder:text-muted-foreground/60 focus:shadow-elevated border border-border/80 focus:border-primary transition"
            />
            <div className="absolute bottom-5 right-6 text-xs text-muted-foreground font-medium">
              {wordCount} {wordCount === 1 ? "word" : "words"} written
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
            <span className="text-xs text-muted-foreground">
              When the timer expires, your text is audited automatically.
            </span>
            <div className="flex items-center gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={!text.trim()}
                onClick={handleManualSubmit}
                className="flex items-center gap-2 rounded-full bg-gradient-primary px-6 py-3 font-semibold text-primary-foreground shadow-elevated disabled:opacity-40 transition text-sm"
              >
                <Brain className="h-4 w-4" />
                Finish Early & Audit Memory
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}

      {/* =================================================================== */}
      {/* 3. AUDITING LOADING STATE */}
      {/* =================================================================== */}
      {loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-4 rounded-[2rem] bg-card p-8 sm:p-12 shadow-soft border border-border text-center max-w-xl mx-auto"
        >
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-primary/10 text-primary mx-auto mb-4 animate-bounce">
            <Brain className="h-8 w-8" />
          </div>
          <h3 className="font-display text-xl font-bold text-foreground">
            Auditing Recall Against Deck Knowledge
          </h3>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Qwen 27B is extracting semantic differences between your blurt and "{activeDeck?.title}" source notes...
          </p>
          <div className="space-y-2 pt-4 max-w-sm mx-auto">
            <div className="h-2 w-full animate-pulse rounded-full bg-primary/20" />
            <div className="h-2 w-3/4 animate-pulse rounded-full bg-primary/20 mx-auto" />
          </div>
        </motion.div>
      )}

      {/* =================================================================== */}
      {/* 4. RESULTS & EVALUATION */}
      {/* =================================================================== */}
      {result && (
        <motion.div
          key="result"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Deck Header & Score Banner */}
          <div className="rounded-[2rem] border border-border bg-card p-6 sm:p-8 shadow-soft space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <span className={`h-3 w-3 rounded-full ${getFolderColor(activeDeck?.color).dot}`} />
                <span className="font-display text-base font-bold text-foreground">
                  {activeDeck?.title}
                </span>
                <span className="text-xs text-muted-foreground">• Recall Audit Result</span>
              </div>
              <span
                className={`rounded-full px-4 py-1.5 text-xs sm:text-sm font-bold shadow-sm ${
                  result.score >= 70
                    ? "bg-success/15 text-success border border-success/30"
                    : result.score >= 40
                    ? "bg-primary/15 text-primary border border-primary/30"
                    : "bg-destructive/15 text-destructive border border-destructive/30"
                }`}
              >
                {result.score}% Retention Score
              </span>
            </div>

            {/* Cognitive Feedback */}
            {result.feedback && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase tracking-wider">
                  <Sparkles className="h-4 w-4" />
                  <span>Cognitive Diagnostic Feedback</span>
                </div>
                <p className="text-sm leading-relaxed text-foreground font-medium">
                  {result.feedback}
                </p>
              </div>
            )}
          </div>

          {/* Recalled Concepts Card */}
          <div className="rounded-[2rem] bg-card p-6 sm:p-8 shadow-soft border border-border">
            <div className="mb-4 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <h2 className="font-display text-lg font-bold text-foreground">
                  Your Recalled Concepts ({result.recalled_concepts.length})
                </h2>
              </div>
              <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-success">
                {result.recalled_concepts.length} concepts matched
              </span>
            </div>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {result.recalled_concepts.map((c) => (
                <span
                  key={c}
                  className="rounded-lg bg-success/10 border border-success/20 px-2.5 py-1 text-xs font-bold text-success"
                >
                  ✓ {c}
                </span>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border/60">
              <span className="text-xs font-semibold text-muted-foreground mb-2 block">
                Highlighted Submission:
              </span>
              <p className="whitespace-pre-wrap text-sm sm:text-base leading-relaxed text-foreground bg-muted/30 p-4 rounded-2xl border border-border/40">
                {rendered}
              </p>
            </div>
          </div>

          {/* Missed Concepts Card */}
          <div className="rounded-[2rem] bg-destructive/5 border border-destructive/20 p-6 sm:p-8 shadow-soft">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <h2 className="font-display text-lg font-bold text-destructive">
                Missed Concepts ({result.missed_concepts.length})
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              These high-yield concepts exist in your deck's grounding context but were omitted from your recall:
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {result.missed_concepts.map((c, i) => (
                <motion.span
                  key={c}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-full bg-destructive/15 border border-destructive/30 px-3.5 py-1.5 text-xs font-bold capitalize text-destructive"
                >
                  {c}
                </motion.span>
              ))}
              {!result.missed_concepts.length && (
                <p className="text-sm font-semibold text-success">
                  Nothing missed: outstanding retention across all deck concepts!
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-wrap gap-3 pt-4 border-t border-destructive/10">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  toast.success(
                    `${result.missed_concepts.length} concepts highlighted for your next review cycle`
                  );
                }}
                className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs sm:text-sm font-semibold text-primary-foreground shadow-sm"
              >
                <Sparkles className="h-4 w-4" /> Save Missed Concepts
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleRestart}
                className="flex items-center gap-2 rounded-full bg-card border border-border px-5 py-2.5 text-xs sm:text-sm font-semibold text-foreground hover:bg-muted"
              >
                <RotateCcw className="h-4 w-4" /> Try Another Session
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AppShell>
  );
}
