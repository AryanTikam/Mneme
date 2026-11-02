import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Flame,
  Layers,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import React, { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  getFolderColor,
  useDecks,
  useSpacedSchedule,
  type SpacedCalendarDay,
  type SpacedCardItem,
} from "@/services/mneme";

function formatDateLong(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

// -------------------------------------------------------------
// DATE INSPECT MODAL (DETAILED SCHEDULE PER SELECTED CALENDAR DAY)
// -------------------------------------------------------------
function DateDetailModal({
  day,
  onClose,
  onLaunchTask,
}: {
  day: SpacedCalendarDay;
  onClose: () => void;
  onLaunchTask: (actionType: string, deckId?: string) => void;
}) {
  const [revealedCards, setRevealedCards] = useState<Record<string, boolean>>({});

  const toggleReveal = (cardId: string) => {
    setRevealedCards((prev) => ({ ...prev, [cardId]: !prev[cardId] }));
  };

  const formattedDate = formatDateLong(day.date);
  const items = day.items || [];

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-foreground/40 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 14 }}
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-border bg-card shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4 sm:p-5 bg-card/95 sticky top-0 z-10 backdrop-blur">
          <div className="flex items-center gap-2.5">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-base sm:text-lg font-bold text-foreground">
                  {formattedDate}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    day.is_today
                      ? "bg-primary text-primary-foreground"
                      : day.is_past && day.reviewed
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : day.scheduled_count > 0
                      ? "bg-purple-500/15 text-purple-600 dark:text-purple-400"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {day.is_today
                    ? "Today"
                    : day.is_past && day.reviewed
                    ? "Session Completed"
                    : day.scheduled_count > 0
                    ? `${day.scheduled_count} Scheduled`
                    : "Rest Day"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Exact cards & tasks scheduled by the SuperMemo-2 item-level algorithm
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted transition"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Summary Strip */}
          <div className="grid grid-cols-3 gap-2.5 rounded-2xl bg-secondary/40 p-3.5 border border-border/60 text-center">
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Scheduled Items
              </span>
              <span className="text-lg font-bold text-foreground">{items.length}</span>
            </div>
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Decks Involved
              </span>
              <span className="text-lg font-bold text-foreground">
                {day.decks_involved?.length || 0}
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Activity Status
              </span>
              <span className="text-xs font-bold capitalize text-primary mt-1 block">
                {day.status}
              </span>
            </div>
          </div>

          {/* Cards List */}
          {items.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Layers className="h-4 w-4" /> Cards Due / Scheduled on this Date
                </h4>
                <span className="text-[11px] text-muted-foreground">
                  Tap to preview question & answer
                </span>
              </div>

              <div className="space-y-2.5">
                {items.map((card, idx) => {
                  const colorSpec = getFolderColor(card.deck_color);
                  const isAnswerRevealed = !!revealedCards[card.card_id];

                  return (
                    <div
                      key={card.card_id || idx}
                      className="rounded-2xl border border-border/80 bg-card p-4 space-y-3 shadow-soft hover:border-primary/40 transition"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/50">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${colorSpec.dot}`} />
                          <span className="text-xs font-bold text-foreground">
                            {card.deck_title}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] font-mono">
                          <span
                            className="rounded-md bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground"
                            title="SuperMemo-2 Repetition Level"
                          >
                            R{card.repetition}
                          </span>
                          <span
                            className="rounded-md bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground"
                            title="Inter-repetition interval in days"
                          >
                            {card.interval_days}d
                          </span>
                          <span
                            className="rounded-md bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground"
                            title="Dynamic Ease Factor"
                          >
                            EF {card.ease_factor.toFixed(2)}
                          </span>
                          {card.lapses > 0 && (
                            <span
                              className="rounded-md bg-destructive/10 text-destructive px-2 py-0.5 font-bold"
                              title="Cumulative memory lapses"
                            >
                              L{card.lapses}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Front Question */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                          Prompt / Front
                        </span>
                        <p className="text-sm font-semibold text-foreground leading-snug">
                          {card.front}
                        </p>
                      </div>

                      {/* Back Answer (Collapsible) */}
                      {isAnswerRevealed && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-1 pt-2 border-t border-border/40"
                        >
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            Answer / Back
                          </span>
                          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                            {card.back}
                          </p>
                        </motion.div>
                      )}

                      {/* Action Bar */}
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => toggleReveal(card.card_id)}
                          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                        >
                          {isAnswerRevealed ? (
                            <>
                              <EyeOff className="h-3.5 w-3.5" /> Hide Answer
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5" /> Reveal Answer
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onLaunchTask("flashcards", card.deck_id)}
                          className="rounded-xl bg-secondary hover:bg-primary hover:text-primary-foreground px-3 py-1 text-xs font-semibold text-secondary-foreground transition shadow-sm"
                        >
                          Review Deck &rarr;
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center space-y-2">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
              <p className="text-sm font-bold text-foreground">No Cards Due On This Date</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                SuperMemo-2 projects your memory retrievability for active cards will remain above
                the 85% consolidation threshold on this day. No forced reviews are required.
              </p>
              <div className="pt-3 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => onLaunchTask("blurt")}
                  className="rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                >
                  Do a Free-Recall Blurt
                </button>
                <button
                  type="button"
                  onClick={() => onLaunchTask("feynman")}
                  className="rounded-xl bg-secondary px-3.5 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-muted"
                >
                  Teach Feynman
                </button>
              </div>
            </div>
          )}

          {/* Educational Note */}
          <div className="rounded-2xl bg-primary/5 border border-primary/20 p-3.5 text-[11px] text-muted-foreground space-y-1">
            <span className="font-bold text-foreground flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Per-Card Scheduling Explained
            </span>
            <p className="leading-relaxed">
              Every card has its own independent Ease Factor (EF) and repetition interval. When you
              rate a card as <strong>Good</strong> or <strong>Easy</strong>, its next review
              interval expands dynamically (<code className="text-primary font-mono font-semibold">I(n) = I(n-1) &times; EF</code>), projecting it onto later
              calendar dates.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// -------------------------------------------------------------
// MAIN SPACED SCHEDULE MODAL
// -------------------------------------------------------------
export function SpacedScheduleModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  initialSelectedDate?: string | null;
}) {
  const navigate = useNavigate();
  const { schedule, loading } = useSpacedSchedule();
  const { setActiveDeckId } = useDecks();
  const [inspectDay, setInspectDay] = useState<SpacedCalendarDay | null>(null);

  if (!open) return null;

  const handleLaunchTask = (actionType: string, deckId?: string) => {
    if (deckId) {
      setActiveDeckId(deckId);
    }
    setInspectDay(null);
    onClose();
    if (actionType === "flashcards") {
      navigate({ to: "/flashcards" });
    } else if (actionType === "blurt") {
      navigate({ to: "/blurt" });
    } else if (actionType === "quiz") {
      navigate({ to: "/quiz" });
    } else if (actionType === "feynman") {
      window.dispatchEvent(new CustomEvent("mneme:open_tutor"));
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-foreground/30 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative flex max-h-[92vh] w-full max-w-3xl flex-col rounded-3xl border border-border bg-card shadow-elevated overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border p-5 sm:p-6 bg-card sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Flame className="h-6 w-6 text-primary animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg sm:text-xl font-bold text-foreground">
                    Cognitive Mastery & Spaced Schedule
                  </h2>
                  <span className="hidden sm:inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary uppercase tracking-wider">
                    SM-2 Algorithm
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Peer-reviewed spaced repetition (Wozniak 1994) & active recall testing schedule
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-muted-foreground hover:bg-muted transition"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
            {/* Top Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Metric 1: Streak */}
              <div className="rounded-2xl border border-border/80 bg-secondary/30 p-3.5 space-y-1">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                  <Flame className="h-3.5 w-3.5 text-primary" /> Daily Streak
                </span>
                <p className="text-xl sm:text-2xl font-bold text-foreground">
                  {schedule?.streak_days || 1}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {(schedule?.streak_days || 1) === 1 ? "day" : "days"}
                  </span>
                </p>
                <p className="text-[10px] text-muted-foreground">Consecutive study days</p>
              </div>

              {/* Metric 2: Due Today */}
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 space-y-1">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                  <Clock className="h-3.5 w-3.5" /> Due Today
                </span>
                <p className="text-xl sm:text-2xl font-bold text-primary">
                  {schedule?.total_due_today || 0}{" "}
                  <span className="text-xs font-normal text-muted-foreground">cards</span>
                </p>
                <p className="text-[10px] text-muted-foreground">Optimal retrieval point</p>
              </div>

              {/* Metric 3: Ease Factor */}
              <div className="rounded-2xl border border-border/80 bg-secondary/30 p-3.5 space-y-1">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                  <Brain className="h-3.5 w-3.5 text-secondary-foreground" /> Avg Ease Factor
                </span>
                <p className="text-xl sm:text-2xl font-bold text-foreground">
                  {schedule?.average_ease_factor?.toFixed(2) || "2.50"}
                </p>
                <p className="text-[10px] text-muted-foreground">Memory stability metric</p>
              </div>

              {/* Metric 4: Estimated Retention */}
              <div className="rounded-2xl border border-border/80 bg-secondary/30 p-3.5 space-y-1">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> Retrievability
                </span>
                <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {schedule?.retrievability_estimate || 88}%
                </p>
                <p className="text-[10px] text-muted-foreground">Ebbinghaus $R(t)$ model</p>
              </div>
            </div>

            {/* Interactive Spaced Calendar */}
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3.5 shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">
                    Rolling 35-Day Spaced Repetition Matrix
                  </h3>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Reviewed
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-primary" /> Due Today
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-purple-400" /> Scheduled
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Click any date to inspect the exact flashcards and tasks scheduled for that day.
              </p>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2 pt-1 text-center">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-[10px] font-bold text-muted-foreground pb-1">
                    {day}
                  </div>
                ))}
                {schedule?.calendar_days.map((day) => {
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => setInspectDay(day)}
                      className={`relative flex flex-col items-center justify-center rounded-xl p-2 transition text-xs font-semibold cursor-pointer group ${
                        day.is_today
                          ? "ring-2 ring-primary ring-offset-1 ring-offset-card bg-primary/10 text-primary font-bold shadow-sm"
                          : day.scheduled_count > 0
                          ? "bg-secondary/60 hover:bg-secondary text-foreground border border-border/40"
                          : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                      }`}
                      title={`${day.date}: Click to inspect ${day.scheduled_count} scheduled cards`}
                    >
                      <span className="group-hover:scale-110 transition">{day.day_number}</span>
                      <div className="mt-1 flex items-center justify-center gap-0.5">
                        {day.reviewed && (
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        )}
                        {day.scheduled_count > 0 && !day.reviewed && (
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              day.is_today ? "bg-primary" : "bg-purple-400"
                            }`}
                          />
                        )}
                      </div>
                      {day.scheduled_count > 0 && (
                        <span className="absolute -top-1 -right-1 text-[8px] bg-secondary border border-border/80 text-foreground font-bold rounded-full px-1 py-0.1 opacity-0 group-hover:opacity-100 transition shadow-xs">
                          {day.scheduled_count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Decks with Cards Due Today */}
            {(schedule?.due_by_deck || []).length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3 shadow-soft">
                <div className="flex items-center justify-between pb-1 border-b border-border/60">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-primary" /> Active Study Decks & Due Cards
                  </h4>
                  <span className="text-[11px] text-muted-foreground">
                    Scheduled via SM-2 Exponential Spacing
                  </span>
                </div>
                <div className="space-y-2 pt-1">
                  {schedule?.due_by_deck.map((d) => {
                    const colorSpec = getFolderColor(d.color);
                    return (
                      <div
                        key={d.deck_id}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 hover:bg-muted/40 transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`h-3 w-3 rounded-full shrink-0 ${colorSpec.dot}`} />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">{d.title}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {d.due_count > 0 ? (
                                <span className="text-primary font-bold">
                                  {d.due_count} card{d.due_count !== 1 ? "s" : ""} due today
                                </span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                  All caught up! Next review scheduled
                                </span>
                              )}
                              {" · "}
                              {d.total_cards} total cards in deck
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLaunchTask("flashcards", d.deck_id)}
                          className={`rounded-xl px-3 py-1.5 text-xs font-semibold shrink-0 transition ${
                            d.due_count > 0
                              ? "bg-primary text-primary-foreground hover:opacity-90 shadow-sm"
                              : "bg-secondary text-secondary-foreground hover:bg-muted"
                          }`}
                        >
                          {d.due_count > 0 ? "Review Due Cards" : "Review Deck"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Daily Recommended Cognitive Tasks */}
            <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 space-y-3.5 shadow-soft">
              <div className="flex items-center justify-between pb-1 border-b border-border/60">
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Zap className="h-4 w-4" /> Daily Active Recall Tasks
                </h4>
                <span className="text-[11px] text-muted-foreground">
                  Grounded in Peer-Reviewed Educational Neuroscience
                </span>
              </div>
              <div className="space-y-2.5 pt-1">
                {schedule?.recommended_tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card p-3.5 hover:border-primary/40 transition"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground">{task.title}</span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-semibold text-muted-foreground">
                          {task.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {task.description}
                      </p>
                      <p className="text-[10px] text-primary/80 font-medium italic">
                        Citation: {task.citation}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleLaunchTask(task.action_type)}
                      className="rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shrink-0 shadow-sm transition hover:opacity-90 flex items-center gap-1.5"
                    >
                      <span>{task.action_label}</span>
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Cognitive Science Foundations Box */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs text-muted-foreground space-y-1.5">
              <div className="flex items-center gap-2 text-foreground font-bold">
                <Sparkles className="h-4 w-4 text-primary" />
                <span>Why Spaced Active Recall Works: Educational Foundations</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Hermann Ebbinghaus established that unreinforced memories decay exponentially:{" "}
                <code className="text-primary font-mono font-semibold">R(t) = exp(-t/S)</code>.
                SuperMemo-2 schedules each active recall review at the precise moment when
                retrievability drops toward the 70% threshold, exponentially lengthening stability{" "}
                <code className="text-primary font-mono font-semibold">S</code> with minimal
                cumulative study time.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Sub-modal: Selected Calendar Date Inspector */}
      {inspectDay && (
        <DateDetailModal
          day={inspectDay}
          onClose={() => setInspectDay(null)}
          onLaunchTask={handleLaunchTask}
        />
      )}
    </AnimatePresence>
  );
}
