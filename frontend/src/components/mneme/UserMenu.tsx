import { useState } from "react";
import { ChevronDown, LogOut, ShieldAlert, Trash2, User } from "lucide-react";
import { useAuth } from "@/services/mneme";

export function UserMenu({
  placement = "down",
  compact = false,
}: {
  placement?: "down" | "up";
  compact?: boolean;
}) {
  const { currentUser, logout, deleteAccount, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!currentUser) {
    return (
      <button
        onClick={() => {
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
        }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:opacity-90"
      >
        <User className="h-4 w-4" />
        <span>Sign In / Register</span>
      </button>
    );
  }

  const handleDeleteProfile = async () => {
    setDeleting(true);
    await deleteAccount();
    setDeleting(false);
    setConfirmDelete(false);
    setOpen(false);
  };

  const initials = (currentUser.name || currentUser.username || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => {
          setConfirmDelete(false);
          setOpen((prev) => !prev);
        }}
        className={`flex w-full items-center justify-between gap-2.5 rounded-2xl border border-border/70 bg-card/70 p-2 text-left transition hover:bg-card hover:border-border shadow-soft ${
          compact ? "p-1.5" : "p-2.5"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-primary text-xs font-bold text-primary-foreground shadow-sm">
            {initials}
          </div>
          {!compact && (
            <div className="min-w-0 truncate">
              <p className="truncate text-xs font-bold text-foreground leading-tight">
                {currentUser.name || currentUser.username}
              </p>
              <p className="truncate text-[10px] text-muted-foreground font-mono">
                @{currentUser.username}
              </p>
            </div>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <>
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-xs"
            onClick={() => {
              setOpen(false);
              setConfirmDelete(false);
            }}
          />

          {/* Pop-up Menu: Opens DOWNWARDS with top-full mt-2 left-0 */}
          <div
            className={`fixed inset-x-4 top-16 z-50 max-h-[85vh] overflow-y-auto rounded-3xl border border-border bg-card p-4 shadow-elevated sm:absolute sm:inset-auto sm:w-72 sm:rounded-2xl sm:p-4 ${
              placement === "up" ? "sm:bottom-full sm:mb-2 sm:left-0" : "sm:top-full sm:mt-2 sm:left-0"
            }`}
          >
            {/* User Profile Card */}
            <div className="flex items-center gap-3 pb-3 border-b border-border">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-sm font-bold text-primary-foreground shadow-sm">
                {initials}
              </div>
              <div className="min-w-0 truncate">
                <p className="truncate text-sm font-bold text-foreground">
                  {currentUser.name || currentUser.username}
                </p>
                <p className="truncate text-xs font-mono text-muted-foreground">
                  @{currentUser.username}
                </p>
              </div>
            </div>

            {!confirmDelete ? (
              <div className="pt-3 space-y-1.5">
                {/* Log Out */}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted transition"
                >
                  <LogOut className="h-4 w-4 text-muted-foreground" />
                  <span>Log Out</span>
                </button>

                {/* Delete Profile trigger */}
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive-soft transition"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Delete Profile...</span>
                </button>
              </div>
            ) : (
              /* Confirmation view */
              <div className="pt-3 space-y-3">
                <div className="flex items-start gap-2 rounded-xl bg-destructive/10 p-2.5 text-destructive border border-destructive/20">
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    Permanently delete <strong className="font-bold">@{currentUser.username}</strong> and all your uploaded notes, decks, and folders? This cannot be undone.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 rounded-xl border border-border py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDeleteProfile}
                    className="flex-1 rounded-xl bg-destructive py-1.5 text-xs font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {deleting ? "Deleting..." : "Confirm Delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
