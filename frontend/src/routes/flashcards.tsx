import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import { ChevronDown, Layers, RotateCcw, ThumbsDown, ThumbsUp, Trash2, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { AppShell, PageHeader } from "@/components/mneme/AppShell";
import { useStudyDeck, type Flashcard } from "@/services/mneme";

export const Route = createFileRoute("/flashcards")({
  head: () => ({
    meta: [
      { title: "Flashcards — Mneme" },
      { name: "description", content: "Flip and swipe through AI-generated flashcards with spaced repetition." },
      { property: "og:title", content: "Flashcards — Mneme" },
      { property: "og:description", content: "Flip and swipe through AI-generated flashcards with spaced repetition." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FlashcardsPage,
});

const THRESHOLD = 120;

function SwipeCard({ card, onDone }: { card: Flashcard; onDone: (dir: "left" | "right") => void }) {
  const [flipped, setFlipped] = useState(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-18, 18]);
  const goodOpacity = useTransform(x, [20, THRESHOLD], [0, 0.85]);
  const againOpacity = useTransform(x, [-THRESHOLD, -20], [0.85, 0]);

  const fly = (dir: "left" | "right") => {
    animate(x, dir === "right" ? 700 : -700, {
      type: "spring",
      stiffness: 260,
      damping: 30,
      onComplete: () => onDone(dir),
    });
  };

  return (
    <motion.div
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
      style={{ x, rotate }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.7}
      onDragEnd={(_, info) => {
        if (info.offset.x > THRESHOLD) fly("right");
        else if (info.offset.x < -THRESHOLD) fly("left");
      }}
      initial={{ scale: 0.92, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      onTap={() => setFlipped((f) => !f)}
    >
      <div className="h-full w-full [perspective:1400px]">
        <motion.div
          className="relative h-full w-full preserve-3d"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
        >
          <div className="absolute inset-0 flex flex-col justify-between rounded-[2rem] bg-card p-8 shadow-elevated backface-hidden">
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">Question</span>
            <p className="font-display text-2xl font-bold leading-snug">{card.front}</p>
            <span className="text-xs text-muted-foreground">Tap to flip · swipe to grade</span>
          </div>
          <div className="absolute inset-0 flex flex-col justify-between rounded-[2rem] bg-gradient-primary p-8 text-primary-foreground shadow-elevated backface-hidden [transform:rotateY(180deg)]">
            <span className="text-xs font-semibold uppercase tracking-widest opacity-80">Answer</span>
            <p className="text-xl font-semibold leading-relaxed">{card.back}</p>
            <span className="text-xs opacity-80">← Again · Good →</span>
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
  const { allDecks, activeDeck, activeDeckId, setActiveDeckId, flashcards, deleteDeck } =
    useStudyDeck("flashcards");
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState({ good: 0, again: 0 });
  const [missedCards, setMissedCards] = useState<Flashcard[]>([]);
  const [activeCardsList, setActiveCardsList] = useState<Flashcard[] | null>(null);

  const displayCards = activeCardsList !== null ? activeCardsList : flashcards;
  const isFinished = displayCards.length > 0 && index >= displayCards.length;
  const card = displayCards[index];

  const handleDeckChange = (newDeckId: string) => {
    setActiveDeckId(newDeckId);
    setIndex(0);
    setScore({ good: 0, again: 0 });
    setMissedCards([]);
    setActiveCardsList(null);
  };

  const next = (dir: "left" | "right") => {
    if (card) {
      if (dir === "left") {
        setScore((s) => ({ ...s, again: s.again + 1 }));
        setMissedCards((m) => [...m, card]);
      } else {
        setScore((s) => ({ ...s, good: s.good + 1 }));
      }
    }
    setIndex((i) => i + 1);
  };

  const handleRestart = () => {
    setIndex(0);
    setScore({ good: 0, again: 0 });
    setMissedCards([]);
    setActiveCardsList(null);
  };

  const handleReviewMissed = () => {
    if (missedCards.length > 0) {
      setActiveCardsList([...missedCards]);
      setIndex(0);
      setScore({ good: 0, again: 0 });
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

  const total = displayCards.length;
  const accuracy = total > 0 ? Math.round((score.good / total) * 100) : 0;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Active Recall"
        title="Flashcards"
        subtitle="Tap to flip. Swipe right if you remembered, left to see it again."
      />

      {/* Deck Selector & Controls Bar */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-semibold text-muted-foreground">Active Deck:</label>
          {allDecks.length > 0 ? (
            <div className="relative">
              <select
                value={activeDeckId}
                onChange={(e) => handleDeckChange(e.target.value)}
                className="appearance-none rounded-2xl border border-border bg-card px-4 py-2 pr-9 font-semibold shadow-soft outline-none focus:ring-2 focus:ring-primary"
              >
                {allDecks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.cards} cards)
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No decks available</span>
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
        <div className="mx-auto max-w-md rounded-[2rem] bg-card p-10 text-center shadow-soft">
          <p className="font-display text-xl font-bold">No flashcards in this deck</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Upload your notes or select another deck above to start your active recall session.
          </p>
          <Link
            to="/"
            className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Go to Upload
          </Link>
        </div>
      ) : (
        <>
          {/* Progress Counters */}
          <div className="mb-6 flex items-center gap-3 text-sm">
            <span className="rounded-full bg-secondary px-3 py-1 font-semibold text-secondary-foreground">
              {Math.min(index + 1, total)} / {total}
            </span>
            <span className="rounded-full bg-success-soft px-3 py-1 font-semibold text-success">
              {score.good} remembered
            </span>
            <span className="rounded-full bg-destructive-soft px-3 py-1 font-semibold text-destructive">
              {score.again} again
            </span>
            {activeCardsList !== null && (
              <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-bold uppercase text-accent-foreground">
                Reviewing Missed
              </span>
            )}
          </div>

          <div className="relative mx-auto h-[420px] w-full max-w-md">
            {displayCards[index + 1] && (
              <div className="absolute inset-0 translate-y-4 scale-95 rounded-[2rem] bg-card opacity-60 shadow-soft" />
            )}

            <AnimatePresence mode="wait">
              {!isFinished && card ? (
                <SwipeCard key={`${card.id}_${index}`} card={card} onDone={next} />
              ) : (
                <motion.div
                  key="completion"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center rounded-[2rem] bg-card p-8 text-center shadow-elevated"
                >
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-md mb-4">
                    <Layers className="h-7 w-7" />
                  </div>
                  <h3 className="font-display text-2xl font-bold">Session Complete!</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    You reviewed {total} flashcards in this deck.
                  </p>

                  <div className="my-5 flex items-center justify-center gap-3">
                    <div className="rounded-2xl bg-success-soft px-4 py-2 text-center">
                      <span className="block text-xl font-bold text-success">{score.good}</span>
                      <span className="text-xs font-semibold text-success">Remembered</span>
                    </div>
                    <div className="rounded-2xl bg-destructive-soft px-4 py-2 text-center">
                      <span className="block text-xl font-bold text-destructive">{score.again}</span>
                      <span className="text-xs font-semibold text-destructive">Again</span>
                    </div>
                    <div className="rounded-2xl bg-secondary px-4 py-2 text-center">
                      <span className="block text-xl font-bold text-secondary-foreground">{accuracy}%</span>
                      <span className="text-xs font-semibold text-muted-foreground">Retention</span>
                    </div>
                  </div>

                  <div className="flex flex-col w-full gap-2.5">
                    {missedCards.length > 0 && activeCardsList === null && (
                      <button
                        onClick={handleReviewMissed}
                        className="flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm transition hover:opacity-90"
                      >
                        <RotateCcw className="h-4 w-4" /> Review Missed ({missedCards.length} cards)
                      </button>
                    )}
                    <button
                      onClick={handleRestart}
                      className="flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
                    >
                      <RotateCcw className="h-4 w-4" /> Restart Entire Deck
                    </button>
                    <Link
                      to="/"
                      className="flex items-center justify-center gap-2 rounded-full bg-secondary px-5 py-2.5 text-sm font-semibold text-secondary-foreground transition hover:bg-muted"
                    >
                      <ArrowLeft className="h-4 w-4" /> Return to Dashboard
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </AppShell>
  );
}
