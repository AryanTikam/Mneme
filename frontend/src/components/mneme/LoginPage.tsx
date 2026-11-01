import { useState } from "react";
import { Brain, CheckCircle2, Eye, EyeOff, Lock, LogIn, Sparkles, User, UserPlus } from "lucide-react";
import { useAuth } from "@/services/mneme";

export function LoginPage({ onSuccess }: { onSuccess?: () => void }) {
  const { login, register, loading } = useAuth();
  const [tab, setTab] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    if (!cleanUser) {
      setError("Please enter your username");
      return;
    }
    if (!cleanPass) {
      setError("Please enter your password");
      return;
    }

    if (tab === "register") {
      if (cleanUser.length < 3) {
        setError("Username must be at least 3 characters");
        return;
      }
      if (cleanPass.length < 4) {
        setError("Password must be at least 4 characters");
        return;
      }
      const res = await register(cleanUser, cleanPass, name.trim() || undefined);
      if (res.success) {
        if (onSuccess) onSuccess();
      } else {
        setError(res.error || "Registration failed. Username may already be taken.");
      }
    } else {
      const res = await login(cleanUser, cleanPass);
      if (res.success) {
        if (onSuccess) onSuccess();
      } else {
        setError(res.error || "Invalid username or password");
      }
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md space-y-8">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-gradient-primary text-primary-foreground shadow-elevated">
            <Brain className="h-9 w-9" />
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Mneme
          </h1>
          <p className="mt-2 text-sm font-medium text-muted-foreground">
            AI Active Recall & Neural Retention Studio
          </p>
        </div>

        {/* Auth Card */}
        <div className="rounded-[2rem] border border-border bg-card p-6 shadow-elevated sm:p-8">
          {/* Mode Tabs */}
          <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1">
            <button
              type="button"
              onClick={() => {
                setTab("signin");
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition ${
                tab === "signin"
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LogIn className="h-3.5 w-3.5" /> Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab("register");
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold transition ${
                tab === "register"
                  ? "bg-card text-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" /> Register
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs font-medium text-destructive">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                Username
              </label>
              <div className="mt-1 relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  required
                  placeholder="e.g. aryantikam"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/60 pl-9 pr-3 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
              </div>
            </div>

            {tab === "register" && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  Full Name (Optional)
                </label>
                <div className="mt-1 relative">
                  <input
                    type="text"
                    placeholder="Aryan Tikam"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-border bg-muted/60 px-3 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                Password
              </label>
              <div className="mt-1 relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/60 pl-9 pr-10 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {tab === "register" && (
              <div className="rounded-2xl bg-secondary/50 p-3 space-y-1 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1.5 text-foreground font-semibold">
                  <Sparkles className="h-3.5 w-3.5 text-primary" /> Private Account Security:
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-success" />
                  <span>Password-protected personal workspace</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-success" />
                  <span>Strictly isolated documents, flashcards & quizzes</span>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username.trim() || !password.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary py-2.5 text-xs font-bold text-primary-foreground shadow-elevated transition hover:opacity-90 disabled:opacity-50"
            >
              {tab === "signin" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {loading
                ? tab === "signin" ? "Signing In..." : "Creating Account..."
                : tab === "signin" ? "Sign In & Open Studio" : "Create Account & Start Learning"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Each learner profile is private and securely protected by password.
        </p>
      </div>
    </div>
  );
}
