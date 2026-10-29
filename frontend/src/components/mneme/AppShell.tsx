import { Link, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, Layers, LayoutDashboard, ListChecks, MessageCircle, PenLine } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ChatDrawer } from "./ChatDrawer";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/flashcards", label: "Flashcards", icon: Layers },
  { to: "/quiz", label: "Quiz", icon: ListChecks },
  { to: "/blurt", label: "Blurt", icon: PenLine },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background font-sans">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar p-5 md:flex">
        <Link to="/" className="mb-10 flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-elevated">
            <Brain className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">Mneme</span>
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = path === to;
            return (
              <Link key={to} to={to} className="relative flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-sidebar-accent" transition={{ type: "spring", stiffness: 400, damping: 32 }} />}
                <Icon className={`relative h-5 w-5 ${active ? "text-primary" : ""}`} />
                <span className={`relative ${active ? "text-sidebar-accent-foreground font-semibold" : ""}`}>{label}</span>
              </Link>
            );
          })}
          <button onClick={() => setChatOpen(true)} className="flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <MessageCircle className="h-5 w-5" /> Feynman Tutor
          </button>
        </nav>
        <div className="mt-auto rounded-3xl bg-secondary p-4">
          <p className="text-xs font-semibold text-secondary-foreground">Daily streak</p>
          <p className="font-display text-2xl font-bold text-secondary-foreground">12 days</p>
          <p className="text-xs text-muted-foreground">18 cards due today</p>
        </div>
      </aside>

      <main className="pb-24 md:pb-0 md:pl-64">
        <AnimatePresence mode="wait">
          <motion.div key={path} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="mx-auto max-w-5xl px-5 py-8 md:px-10 md:py-12">
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-card/95 py-2 backdrop-blur md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} className={`flex flex-col items-center gap-1 px-3 py-1 text-[11px] font-medium ${path === to ? "text-primary" : "text-muted-foreground"}`}>
            <Icon className="h-5 w-5" /> {label}
          </Link>
        ))}
      </nav>

      <motion.button
        whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
        onClick={() => setChatOpen(true)}
        aria-label="Open Feynman tutor"
        className="fixed bottom-20 right-5 z-40 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-elevated md:bottom-8 md:right-8"
      >
        <MessageCircle className="h-6 w-6" />
      </motion.button>

      <ChatDrawer open={chatOpen} onOpenChange={setChatOpen} />
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  return (
    <header className="mb-8">
      <p className="text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
      {subtitle && <p className="mt-2 max-w-xl text-muted-foreground">{subtitle}</p>}
    </header>
  );
}
