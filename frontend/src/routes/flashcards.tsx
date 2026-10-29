import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "framer-motion";
import { RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
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
    animate(x, dir === "right" ? 700 : -700, { type: "spring", stiffness: 260, damping: 30, onComplete: () => onDone(dir) });
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
        <motion.div className="relative h-full w-full preserve-3d" animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: "spring", stiffness: 220, damping: 22 }}>
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
      <motion.div style={{ opacity: goodOpacity }} className="pointer-events-none absolute inset-0 grid place-items-center rounded-[2rem] bg-success text-success-foreground">
        <span className="flex items-center gap-2 font-display text-2xl font-bold"><ThumbsUp /> Good</span>
      </motion.div>
      <motion.div style={{ opacity: againOpacity }} className="pointer-events-none absolute inset-0 grid place-items-center rounded-[2rem] bg-destructive text-destructive-foreground">
        <span className="flex items-center gap-2 font-display text-2xl font-bold"><ThumbsDown /> Again</span>
      </motion.div>
    </motion.div>
  );
}

function FlashcardsPage() {
  const { flashcards } = useStudyDeck("neuro");
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState({ good: 0, again: 0 });
  const card = flashcards[index];

  const next = (dir: "left" | "right") => {
    setScore((s) => (dir === "right" ? { ...s, good: s.good + 1 } : { ...s, again: s.again + 1 }));
    setIndex((i) => i + 1);
  };

  return (
    <AppShell>
      <PageHeader eyebrow="Neuroscience of Memory" title="Flashcards" subtitle="Tap to flip. Swipe right if you knew it, left to see it again sooner." />
      <div className="mb-6 flex items-center gap-3 text-sm">
        <span className="rounded-full bg-secondary px-3 py-1 font-semibold text-secondary-foreground">{Math.min(index + 1, flashcards.length)} / {flashcards.length}</span>
        <span className="rounded-full bg-success-soft px-3 py-1 font-semibold text-success">{score.good} good</span>
        <span className="rounded-full bg-destructive-soft px-3 py-1 font-semibold text-destructive">{score.again} again</span>
      </div>

      <div className="relative mx-auto h-[420px] w-full max-w-md">
        {flashcards[index + 1] && <div className="absolute inset-0 translate-y-4 scale-95 rounded-[2rem] bg-card opacity-60 shadow-soft" />}
        <AnimatePresence>
          {card ? (
            <SwipeCard key={card.id} card={card} onDone={next} />
          ) : (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 flex flex-col items-center justify-center rounded-[2rem] bg-card p-8 text-center shadow-elevated">
              <p className="font-display text-2xl font-bold">Session complete</p>
              <p className="mt-2 text-muted-foreground">{score.good} remembered · {score.again} to review again</p>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => { setIndex(0); setScore({ good: 0, again: 0 }); }} className="mt-6 flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground">
                <RotateCcw className="h-4 w-4" /> Restart
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}
