import { AnimatePresence, motion } from "framer-motion";
import { Database, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useChatStream } from "@/services/mneme";

export function ChatDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { messages, simplicity, send } = useChatStream();
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    send(input.trim(), "neuro");
    setInput("");
  };
  const tone = simplicity > 66 ? "bg-success" : simplicity > 40 ? "bg-primary" : "bg-destructive";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => onOpenChange(false)} />
          <motion.aside
            role="dialog" aria-label="Feynman tutor"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-card shadow-elevated"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="border-b border-border p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-lg font-bold">Feynman Tutor</h2>
                </div>
                <button onClick={() => onOpenChange(false)} aria-label="Close" className="rounded-full p-2 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs font-medium">
                  <span className="text-muted-foreground">Simplicity Score</span>
                  <span>{Math.round(simplicity)}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <motion.div className={`h-full rounded-full ${tone}`} animate={{ width: `${simplicity}%` }} transition={{ type: "spring", stiffness: 120, damping: 14 }} />
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {messages.map((m) => (
                <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-3xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-muted text-foreground"}`}>
                    {m.searching ? (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}><Database className="h-4 w-4" /></motion.span>
                        Searching vector base…
                      </span>
                    ) : m.text}
                  </div>
                </motion.div>
              ))}
              <div ref={endRef} />
            </div>

            <form onSubmit={submit} className="flex gap-2 border-t border-border p-4">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Explain a concept simply…" className="flex-1 rounded-full bg-muted px-5 py-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} type="submit" aria-label="Send" className="grid h-11 w-11 place-items-center rounded-full bg-gradient-primary text-primary-foreground"><Send className="h-4 w-4" /></motion.button>
            </form>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
