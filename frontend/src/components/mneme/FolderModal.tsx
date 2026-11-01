import { useState, useEffect } from "react";
import { Folder as FolderIcon, Trash2, X } from "lucide-react";
import { FOLDER_COLORS, useFolders, type Folder } from "@/services/mneme";

export function FolderModal({
  folder,
  onClose,
  onSaved,
}: {
  folder?: Folder | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { createFolder, updateFolder, deleteFolder } = useFolders();

  const [name, setName] = useState(folder ? folder.name : "");
  const [color, setColor] = useState(folder ? folder.color : "indigo");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (folder) {
      setName(folder.name);
      setColor(folder.color || "indigo");
    } else {
      setName("");
      setColor("indigo");
    }
  }, [folder]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    if (folder) {
      await updateFolder(folder.folder_id, { name: name.trim(), color });
    } else {
      await createFolder(name.trim(), color);
    }
    setSubmitting(false);
    onSaved();
    onClose();
  };

  const handleDelete = async () => {
    if (!folder) return;
    if (confirm(`Delete folder "${folder.name}"? Decks will remain safe in Unorganized.`)) {
      setSubmitting(true);
      await deleteFolder(folder.folder_id);
      setSubmitting(false);
      onSaved();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-elevated">
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <FolderIcon className="h-5 w-5 text-primary" />
            <h3 className="font-display text-base font-bold text-foreground">
              {folder ? "Edit Folder" : "New Folder"}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Folder Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Medicine, CS 301, History"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-muted/60 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Color</label>
            <div className="mt-2 flex items-center gap-2">
              {FOLDER_COLORS.map((c) => (
                <button
                  type="button"
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`h-7 w-7 rounded-full ${c.dot} transition-transform ${
                    color === c.value ? "scale-110 ring-2 ring-primary ring-offset-2" : "opacity-60 hover:opacity-100"
                  }`}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            {folder ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="flex items-center gap-1 text-xs text-destructive hover:underline"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            ) : <div />}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !name.trim()}
                className="rounded-xl bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Saving..." : folder ? "Save Changes" : "Create Folder"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

