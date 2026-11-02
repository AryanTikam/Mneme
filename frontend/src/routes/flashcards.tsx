import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import {
  ChevronDown,
  Layers,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  ArrowLeft,
  Sparkles,
  Clock,
  CheckCircle2,
  Brain,
  Zap,
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { AppShell, PageHeader } from "@/components/mneme/AppShell";
import { useStudyDeck, type Flashcard } from "@/services/mneme";

type FlashcardsSearch = {
  deckId?: string | undefined;
};

export const Route = createFileRoute("/flashcards")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): FlashcardsSearch => ({
    deckId: typeof search["deckId"] === "string" ? (search["deckId"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Flashcards — Mneme" },
      { name: "description", content: "Active recall flashcards with SuperMemo-2 spaced repetition scheduling." },
      { property: "og:title", content: "Flashcards — Mneme" },
      { property: "og:description", content: "Active recall flashcards with SuperMemo-2 spaced repetition scheduling." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FlashcardsPage,
});

const THRESHOLD = 110;

function formatIntervalDays(days?: number): string {
  if (days === undefined || days === null) return "1d";
  if (days < 1) return "<1d";
  if (days === 1) return "1d";
  return `${Math.round(days)}d`;
}

function isCardDue(card: Flashcard): boolean {
  if (!card.next_review_utc) return true;
  try {
    return new Date(card.next_review_utc).getTime() <= Date.now();
  } catch {
    return true;
  }
}

type SwipeCardProps = {
  card: Flashcard;
  flipped: boolean;
  onToggleFlip: () => void;
  onSwipe: (dir: "left" | "right") => void;
};

function SwipeCard({ card, flipped, onToggleFlip, onSwipe }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-18, 18]);
  const goodOpacity = useTransform(x, [20, THRESHOLD], [0, 0.85]);
  const againOpacity = useTransform(x, [-THRESHOLD, -20], [0.85, 0]);

  const fly = (dir: "left" | "right") => {
    animate(x, dir === "right" ? 700 : -700, {
      type: "spring",
      stiffness: 260,
      damping: 30,
      onComplete: () => onSwipe(dir),
    });
  };

  const due = isCardDue(card);
  const repCount = card.repetition ?? 0;
  const ease = (card.ease_factor ?? 2.5).toFixed(2);
  const interval = formatIntervalDays(card.interval_days);

  return (
    <motion.div
      className="absolute inset-0 cursor-grab active:cursor-grabbing select-none"
      style={{ x, rotate }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.7}
      onDragEnd={(_, info) => {
        if (info.offset.x > THRESHOLD) fly("right");
        else if (info.offset.x < -THRESHOLD) fly("left");
      }}
      initial={{ scale: 0.94, opacity: 0, y: 16 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.92, opacity: 0, y: -16 }}
      transition={{ duration: 0.2 }}
      onTap={onToggleFlip}
    >
      <div className="h-full w-full [perspective:1400px]">
        <motion.div
          className="relative h-full w-full preserve-3d"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
        >
          {/* FRONT */}
          <div className="absolute inset-0 flex flex-col justify-between rounded-[2rem] bg-card p-6 sm:p-8 shadow-elevated border border-border/40 backface-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5" /> Question
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    due
                      ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                  title={due ? "Card is due for spaced review" : "Card is reviewed and scheduled"}
                >
                  {due ? "Due Now" : `Due in ${interval}`}
                </span>
                <span
                  className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground"
                  title={`SuperMemo-2 Repetition Level: ${repCount}, Interval: ${interval}, Ease Factor: ${ease}`}
                >
                  R{repCount} · EF {ease}
                </span>
              </div>
            </div>

            <div className="my-auto py-4">
              <p className="font-display text-xl sm:text-2xl font-bold leading-snug text-foreground">
                {card.front}
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs text-muted-foreground">
              <span>Tap to flip</span>
              <span>Swipe right for Good · left for Again</span>
            </div>
          </div>

          {/* BACK */}
          <div className="absolute inset-0 flex flex-col justify-between rounded-[2rem] bg-gradient-to-br from-primary via-primary/95 to-primary/85 p-6 sm:p-8 text-primary-foreground shadow-elevated backface-hidden [transform:rotateY(180deg)]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest opacity-85 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" /> Answer
              </span>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
                R{repCount} · Next: ~{interval}
              </span>
            </div>

            <div className="my-auto py-4 overflow-y-auto max-h-[220px]">
              <p className="text-lg sm:text-xl font-semibold leading-relaxed">
                {card.back}
              </p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/20 text-xs opacity-85">
              <span>Grade your recall with the buttons below</span>
              <span>1: Again · 2: Hard · 3: Good · 4: Easy</span>
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div
        style={{ opacity: goodOpacity }}
        className="pointer-events-none absolute inset-0 grid place-items-center rounded-[2rem] bg-success text-success-foreground"
      >
        <span className="flex items-center gap-2 font-display text-2xl font-bold">
          <ThumbsUp /> Good
        </span>
      </motion.div>
      <motion.div
        style={{ opacity: againOpacity }}
        className="pointer-events-none absolute inset-0 grid place-items-center rounded-[2rem] bg-destructive text-destructive-foreground"
      >
        <span className="flex items-center gap-2 font-display text-2xl font-bold">
          <ThumbsDown /> Again
        </span>
      </motion.div>
    </motion.div>
  );
}

function FlashcardsPage() {
  const { deckId: searchDeckId } = Route.useSearch();
  const { allDecks, activeDeck, activeDeckId, setActiveDeckId, flashcards, deleteDeck, recordCardReview } =
    useStudyDeck("flashcards");
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [filterMode, setFilterMode] = useState<"all" | "due">("all");
  const [score, setScore] = useState({ good: 0, hard: 0, easy: 0, again: 0 });
  const [missedCards, setMissedCards] = useState<Flashcard[]>([]);
  const [activeCardsList, setActiveCardsList] = useState<Flashcard[] | null>(null);

  // Sync active deck if deep-linked via URL query parameter
  useEffect(() => {
    if (searchDeckId && searchDeckId !== activeDeckId) {
      setActiveDeckId(searchDeckId);
      setIndex(0);
      setFlipped(false);
      setScore({ good: 0, hard: 0, easy: 0, again: 0 });
      setMissedCards([]);
      setActiveCardsList(null);
    }
  }, [searchDeckId, activeDeckId, setActiveDeckId]);

  const dueCards = useMemo(() => flashcards.filter(isCardDue), [flashcards]);

  const displayCards = useMemo(() => {
    if (activeCardsList !== null) return activeCardsList;
    if (filterMode === "due") return dueCards;
    return flashcards;
  }, [activeCardsList, filterMode, dueCards, flashcards]);

  const total = displayCards.length;
  const isFinished = total > 0 && index >= total;
  const card = displayCards[index];

  const handleDeckChange = (newDeckId: string) => {
    setActiveDeckId(newDeckId);
    setIndex(0);
    setFlipped(false);
    setScore({ good: 0, hard: 0, easy: 0, again: 0 });
    setMissedCards([]);
    setActiveCardsList(null);
  };

  const gradeCard = useCallback(
    (rating: "again" | "hard" | "good" | "easy", quality: number) => {
      if (!card) return;
      recordCardReview(card.id, rating, quality);

      setScore((s) => ({
        ...s,
        [rating]: (s[rating] || 0) + 1,
      }));

      if (rating === "again") {
        setMissedCards((m) => [...m, card]);
      }

      setFlipped(false);
      setIndex((i) => i + 1);
    },
    [card, recordCardReview]
  );

  const handleSwipe = (dir: "left" | "right") => {
    if (dir === "left") {
      gradeCard("again", 1);
    } else {
      gradeCard("good", 4);
    }
  };

  const handleRestart = () => {
    setIndex(0);
    setFlipped(false);
    setScore({ good: 0, hard: 0, easy: 0, again: 0 });
    setMissedCards([]);
    setActiveCardsList(null);
  };

  const handleReviewMissed = () => {
    if (missedCards.length > 0) {
      setActiveCardsList([...missedCards]);
      setIndex(0);
      setFlipped(false);
      setScore({ good: 0, hard: 0, easy: 0, again: 0 });
      setMissedCards([]);
    }
  };

  const handleDeleteCurrentDeck = async () => {
    if (!activeDeck) return;
    if (confirm(`Are you sure you want to delete deck "${activeDeck.title}"?`)) {
      await deleteDeck(activeDeck.id);
      handleRestart();
    }
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (isFinished || !card) return;

      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "1") {
        e.preventDefault();
        gradeCard("again", 1);
      } else if (e.key === "2") {
        e.preventDefault();
        gradeCard("hard", 3);
      } else if (e.key === "3") {
        e.preventDefault();
        gradeCard("good", 4);
      } else if (e.key === "4") {
        e.preventDefault();
        gradeCard("easy", 5);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [card, isFinished, gradeCard]);

  const successfulCount = score.good + score.easy + score.hard;
  const totalReviewed = successfulCount + score.again;
  const accuracy = totalReviewed > 0 ? Math.round((successfulCount / totalReviewed) * 100) : 0;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Active Recall & Spaced Repetition"
        title="Flashcards"
        subtitle="SuperMemo-2 spaced scheduling with calibrated interval progression. Tap card or press Space to reveal the answer."
      />

      {/* Deck Selector & Controls Bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold text-muted-foreground">Deck:</label>
          {allDecks.length > 0 ? (
            <div className="relative">
              <select
                value={activeDeckId}
                onChange={(e) => handleDeckChange(e.target.value)}
                className="appearance-none rounded-2xl border border-border bg-card px-4 py-2 pr-9 font-semibold shadow-soft outline-none focus:ring-2 focus:ring-primary text-sm"
              >
                {allDecks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.flashcards?.length ?? 0} cards)
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No decks available</span>
          )}

          {/* SM-2 Due Filter Pills */}
          {flashcards.length > 0 && activeCardsList === null && (
            <div className="inline-flex rounded-xl bg-secondary/80 p-0.5 border border-border/40 text-xs font-semibold">
              <button
                onClick={() => {
                  setFilterMode("all");
                  setIndex(0);
                  setFlipped(false);
                }}
                className={`rounded-lg px-3 py-1 transition ${
                  filterMode === "all"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All Cards ({flashcards.length})
              </button>
              <button
                onClick={() => {
                  setFilterMode("due");
                  setIndex(0);
                  setFlipped(false);
                }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 transition ${
                  filterMode === "due"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>Due Now</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    dueCards.length > 0
                      ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {dueCards.length}
                </span>
              </button>
            </div>
          )}
        </div>

        {activeDeck && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestart}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
              title="Restart Deck"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restart
            </button>
            <button
              onClick={handleDeleteCurrentDeck}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-destructive transition hover:bg-destructive-soft"
              title="Delete Deck"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        )}
      </div>

      {total === 0 ? (
        <div className="mx-auto max-w-md rounded-[2rem] bg-card p-10 text-center shadow-soft border border-border/40">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">
            {filterMode === "due" ? <CheckCircle2 className="h-6 w-6 text-success" /> : <Layers className="h-6 w-6" />}
          </div>
          {filterMode === "due" && flashcards.length > 0 ? (
            <>
              <p className="font-display text-xl font-bold">All Caught Up!</p>
              <p className="mt-2 text-sm text-muted-foreground">
                There are no cards currently due for spaced review in this deck based on your SuperMemo-2 schedule.
              </p>
              <button
                onClick={() => {
                  setFilterMode("all");
                  setIndex(0);
                }}
                className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
              >
                Review All {flashcards.length} Cards Anyway
              </button>
            </>
          ) : (
            <>
              <p className="font-display text-xl font-bold">No flashcards in this deck</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload your study material or select another deck to begin active recall practice.
              </p>
              <Link
                to="/"
                className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Go to Upload
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Progress & Live Rating Stats */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-secondary px-3 py-1 font-semibold text-secondary-foreground">
                {Math.min(index + 1, total)} / {total}
              </span>
              {activeCardsList !== null && (
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold uppercase text-amber-700 dark:text-amber-400">
                  Reviewing Missed
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 font-medium">
              <span className="text-destructive font-semibold">{score.again} Again</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-amber-600 dark:text-amber-400 font-semibold">{score.hard} Hard</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-primary font-semibold">{score.good} Good</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-success font-semibold">{score.easy} Easy</span>
            </div>
          </div>

          {/* Flashcard Container */}
          <div className="relative mx-auto h-[380px] sm:h-[400px] w-full max-w-lg">
            {displayCards[index + 1] && (
              <div className="absolute inset-0 translate-y-3 scale-95 rounded-[2rem] bg-card/60 opacity-60 shadow-soft border border-border/30" />
            )}

            <AnimatePresence mode="wait">
              {!isFinished && card ? (
                <SwipeCard
                  key={`${card.id}_${index}`}
                  card={card}
                  flipped={flipped}
                  onToggleFlip={() => setFlipped((f) => !f)}
                  onSwipe={handleSwipe}
                />
              ) : (
                <motion.div
                  key="completion"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center rounded-[2rem] bg-card p-6 sm:p-8 text-center shadow-elevated border border-border/40"
                >
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-md mb-4">
                    <Layers className="h-7 w-7" />
                  </div>
                  <h3 className="font-display text-2xl font-bold">Session Complete!</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground max-w-xs">
                    You reviewed {totalReviewed} active recall items. SuperMemo-2 intervals have been updated.
                  </p>

                  <div className="my-5 grid grid-cols-4 gap-2 w-full max-w-sm">
                    <div className="rounded-2xl bg-destructive-soft p-2.5 text-center">
                      <span className="block text-lg font-bold text-destructive">{score.again}</span>
                      <span className="text-[10px] font-semibold text-destructive uppercase">Again</span>
                    </div>
                    <div className="rounded-2xl bg-amber-500/10 p-2.5 text-center">
                      <span className="block text-lg font-bold text-amber-600 dark:text-amber-400">{score.hard}</span>
                      <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase">Hard</span>
                    </div>
                    <div className="rounded-2xl bg-primary/10 p-2.5 text-center">
                      <span className="block text-lg font-bold text-primary">{score.good}</span>
                      <span className="text-[10px] font-semibold text-primary uppercase">Good</span>
                    </div>
                    <div className="rounded-2xl bg-success-soft p-2.5 text-center">
                      <span className="block text-lg font-bold text-success">{score.easy}</span>
                      <span className="text-[10px] font-semibold text-success uppercase">Easy</span>
                    </div>
                  </div>

                  <div className="flex flex-col w-full max-w-xs gap-2">
                    {missedCards.length > 0 && activeCardsList === null && (
                      <button
                        onClick={handleReviewMissed}
                        className="flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground shadow-sm transition hover:opacity-90"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Drill Missed ({missedCards.length} cards)
                      </button>
                    )}
                    <button
                      onClick={handleRestart}
                      className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restart Session
                    </button>
                    <Link
                      to="/"
                      className="flex items-center justify-center gap-2 rounded-full bg-secondary px-4 py-2.5 text-xs font-semibold text-secondary-foreground transition hover:bg-muted"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* SuperMemo-2 4-Choice Rating Control Deck */}
          {!isFinished && card && (
            <div className="mt-6 mx-auto max-w-lg">
              <div className="rounded-2xl border border-border/50 bg-card p-3 shadow-soft">
                <div className="flex items-center justify-between px-2 pb-2 text-[11px] text-muted-foreground font-semibold">
                  <span>Grade recall (or use 1-4 keys):</span>
                  <span>
                    {!flipped ? "Tap card or Space to reveal" : "Select rating below"}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={() => gradeCard("again", 1)}
                    className="flex flex-col items-center justify-center rounded-xl border border-destructive/20 bg-destructive/10 px-2 py-2.5 text-center transition hover:bg-destructive hover:text-destructive-foreground active:scale-95 group"
                    title="Complete lapse: interval resets to 1 day"
                  >
                    <span className="text-xs font-bold text-destructive group-hover:text-destructive-foreground">
                      Again
                    </span>
                    <span className="text-[10px] text-destructive/80 group-hover:text-destructive-foreground/90">
                      1d (Reset)
                    </span>
                  </button>

                  <button
                    onClick={() => gradeCard("hard", 3)}
                    className="flex flex-col items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 px-2 py-2.5 text-center transition hover:bg-amber-500 hover:text-white active:scale-95 group"
                    title="Difficult recall: interval expands moderately, EF drops 0.15"
                  >
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400 group-hover:text-white">
                      Hard
                    </span>
                    <span className="text-[10px] text-amber-600/80 dark:text-amber-400/80 group-hover:text-white/90">
                      ~1.2×
                    </span>
                  </button>

                  <button
                    onClick={() => gradeCard("good", 4)}
                    className="flex flex-col items-center justify-center rounded-xl border border-primary/20 bg-primary/10 px-2 py-2.5 text-center transition hover:bg-primary hover:text-primary-foreground active:scale-95 group"
                    title="Standard successful recall: interval multiplied by current EF"
                  >
                    <span className="text-xs font-bold text-primary group-hover:text-primary-foreground">
                      Good
                    </span>
                    <span className="text-[10px] text-primary/80 group-hover:text-primary-foreground/90">
                      ~EF×
                    </span>
                  </button>

                  <button
                    onClick={() => gradeCard("easy", 5)}
                    className="flex flex-col items-center justify-center rounded-xl border border-success/20 bg-success/10 px-2 py-2.5 text-center transition hover:bg-success hover:text-success-foreground active:scale-95 group"
                    title="Effortless recall: interval multiplied by 1.3×EF, EF increases +0.15"
                  >
                    <span className="text-xs font-bold text-success group-hover:text-success-foreground">
                      Easy
                    </span>
                    <span className="text-[10px] text-success/80 group-hover:text-success-foreground/90">
                      ~1.3×EF
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
