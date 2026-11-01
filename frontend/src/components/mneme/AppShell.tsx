import { Link, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  Brain,
  Layers,
  LayoutDashboard,
  ListChecks,
  Menu,
  MessageCircle,
  PenLine,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth, useUserStats } from "@/services/mneme";
import { ChatDrawer } from "./ChatDrawer";
import { LoginPage } from "./LoginPage";
import { UserMenu } from "./UserMenu";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/flashcards", label: "Flashcards", icon: Layers },
  { to: "/quiz", label: "Quiz", icon: ListChecks },
  { to: "/blurt", label: "Blurt", icon: PenLine },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { currentUser } = useAuth();
  const { stats } = useUserStats();
  const [chatOpen, setChatOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // If user is not logged in, show Login / Register screen
  if (!currentUser) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      {/* Mobile Top Header (Visible on screens < md) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-card/95 px-4 py-2.5 backdrop-blur md:hidden">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-sm">
            <Brain className="h-4 w-4" />
          </div>
          <span className="font-display text-base font-bold tracking-tight">Mneme</span>
        </Link>

        <div className="flex items-center gap-2">
          {/* Mobile Profile Trigger */}
          <div className="w-auto">
            <UserMenu compact />
          </div>

          {/* Hamburger Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label="Toggle Navigation Menu"
            className="rounded-xl border border-border bg-muted/60 p-2 text-foreground transition hover:bg-muted"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {/* Slide-Out Mobile Navigation Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-40 bg-foreground/25 backdrop-blur-sm md:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 350, damping: 35 }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar p-5 shadow-elevated md:hidden"
            >
              <div className="flex items-center justify-between mb-6">
                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-1"
                >
                  <div className="grid h-9 w-9 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-sm">
                    <Brain className="h-5 w-5" />
                  </div>
                  <span className="font-display text-lg font-bold tracking-tight">Mneme</span>
                </Link>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* User Profile in Drawer */}
              <div className="mb-6">
                <UserMenu />
              </div>

              {/* Nav links */}
              <nav className="flex flex-col gap-1.5">
                {NAV.map(({ to, label, icon: Icon }) => {
                  const active = path === to;
                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`relative flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <span>{label}</span>
                    </Link>
                  );
                })}

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setChatOpen(true);
                  }}
                  className="flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  <MessageCircle className="h-5 w-5 text-primary" /> Feynman Tutor
                </button>
              </nav>

              {/* Real User Stats (Mobile) */}
              <div className="mt-auto rounded-2xl bg-secondary/80 p-4 border border-border/40">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-secondary-foreground">Daily streak</p>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {stats.mastery_percentage}% Mastery
                  </span>
                </div>
                <p className="font-display text-2xl font-bold text-secondary-foreground mt-0.5">
                  {stats.streak_days} {stats.streak_days === 1 ? "day" : "days"}
                </p>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(5, stats.mastery_percentage)}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="truncate">{stats.active_recall_label}</span>
                  <span className="font-semibold text-foreground/80 shrink-0 ml-1">{stats.total_cards} cards</span>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Fixed Left Sidebar (Visible on md and up) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar p-5 md:flex">
        <Link to="/" className="mb-6 flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-elevated">
            <Brain className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">Mneme</span>
        </Link>

        {/* User Profile Switcher: opens DOWNWARDS underneath button */}
        <div className="mb-6">
          <UserMenu placement="down" />
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = path === to;
            return (
              <Link
                key={to}
                to={to}
                className="relative flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-sidebar-accent"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon className={`relative h-5 w-5 ${active ? "text-primary" : ""}`} />
                <span className={`relative ${active ? "text-sidebar-accent-foreground font-semibold" : ""}`}>
                  {label}
                </span>
              </Link>
            );
          })}
          <button
            onClick={() => setChatOpen(true)}
            className="flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <MessageCircle className="h-5 w-5" /> Feynman Tutor
          </button>
        </nav>

        {/* Real User Stats (Desktop) */}
        <div className="mt-auto rounded-3xl bg-secondary/80 p-4 border border-border/40">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-secondary-foreground">Daily streak</p>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              {stats.mastery_percentage}% Mastery
            </span>
          </div>
          <p className="font-display text-2xl font-bold text-secondary-foreground mt-0.5">
            {stats.streak_days} {stats.streak_days === 1 ? "day" : "days"}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.max(5, stats.mastery_percentage)}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="truncate">{stats.active_recall_label}</span>
            <span className="font-semibold text-foreground/80 shrink-0 ml-1">{stats.total_cards} cards</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area: Responsive padding */}
      <main className="pb-24 md:pb-8 md:pl-64">
        <AnimatePresence mode="wait">
          <motion.div
            key={path}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Navigation Bar (< md) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-card/95 py-2 backdrop-blur md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className={`flex flex-col items-center gap-1 px-3 py-1 text-[11px] font-medium transition ${
              path === to ? "text-primary font-bold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>

      {/* Floating Feynman Tutor Button */}
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        onClick={() => setChatOpen(true)}
        aria-label="Open Feynman tutor"
        className="fixed bottom-20 right-4 z-30 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-elevated md:bottom-8 md:right-8 md:h-14 md:w-14"
      >
        <MessageCircle className="h-5 w-5 md:h-6 md:w-6" />
      </motion.button>

      <ChatDrawer open={chatOpen} onOpenChange={setChatOpen} />
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <header className="mb-6 md:mb-8">
      <p className="text-[11px] sm:text-xs font-bold uppercase tracking-widest text-primary">{eyebrow}</p>
      <h1 className="mt-1.5 font-display text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1.5 max-w-xl text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {subtitle}
        </p>
      )}
    </header>
  );
}
