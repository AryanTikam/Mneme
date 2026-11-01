import { useState } from "react";
import { Check, FileText, Folder as FolderIcon, Plus, X } from "lucide-react";
import { FOLDER_COLORS, useDecks, useDocuments, useFolders } from "@/services/mneme";

export function CreateDeckModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (deckId: string) => void;
}) {
  const { createDeck } = useDecks();
  const { folders } = useFolders();
  const { documents } = useDocuments();

  const [title, setTitle] = useState("");
  const [folderId, setFolderId] = useState<string>("none");
  const [color, setColor] = useState("indigo");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    const newDeck = await createDeck(
      title.trim(),
      folderId === "none" ? null : folderId,
      color,
      selectedDocIds
    );
    setCreating(false);
    if (newDeck) {
      onCreated(newDeck.id);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-elevated max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <h3 className="font-display text-lg font-bold text-foreground">Create New Deck</h3>
          <button onClick={onClose} className="rounded-full p-1 text-muted-foreground hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 overflow-y-auto pr-1">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Deck Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Neuroscience & Cognitive Architecture"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-muted/60 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Folder</label>
            <div className="mt-1 flex items-center gap-2">
              <FolderIcon className="h-4 w-4 text-muted-foreground" />
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-muted/60 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="none">No Folder (Unorganized)</option>
                {folders.map((f) => (
                  <option key={f.folder_id} value={f.folder_id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Theme Color</label>
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

          {/* Context Files Selection */}
          <div className="rounded-2xl border border-border bg-secondary/20 p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <FileText className="h-3.5 w-3.5 text-primary" />
                Attach Study Contexts ({selectedDocIds.length} selected)
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Select files from your library to provide technical grounding for active recall cards and quizzes.
            </p>
            {documents.length > 0 ? (
              <div className="max-h-36 overflow-y-auto space-y-1.5 pt-1">
                {documents.map((doc) => {
                  const selected = selectedDocIds.includes(doc.document_id);
                  return (
                    <button
                      type="button"
                      key={doc.document_id}
                      onClick={() => toggleDocSelection(doc.document_id)}
                      className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition border ${
                        selected
                          ? "border-primary bg-primary/10 text-primary font-semibold"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      }`}
                    >
                      <div className="truncate pr-2">
                        <p className="truncate font-medium">{doc.filename}</p>
                        <span className="text-[10px] text-muted-foreground">
                          {doc.chunk_count || 1} chunks
                        </span>
                      </div>
                      <div
                        className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
                          selected ? "bg-primary border-primary text-primary-foreground" : "border-border"
                        }`}
                      >
                        {selected && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] italic text-muted-foreground py-1">
                No uploaded files yet. You can upload documents on the dashboard or inside the deck later.
              </p>
            )}
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !title.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {creating ? "Creating..." : "Create Deck"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
