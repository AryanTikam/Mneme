import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, FileText, Trash2, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { useDocuments, useUploadDocument } from "@/services/mneme";

export function ContextLibraryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { documents, loading, deleteDocument, refreshDocuments } = useDocuments();
  const { upload, stage, progress, fileName, reset } = useUploadDocument();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleDelete = async (docId: string, filename: string) => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete "${filename}"?\n\nThis will remove all associated vector embeddings and decouple it from all study decks.`
      )
    ) {
      return;
    }

    setDeletingId(docId);
    setErrorMsg(null);
    const ok = await deleteDocument(docId);
    setDeletingId(null);
    if (!ok) {
      setErrorMsg("Failed to delete document. Please try again.");
    } else {
      await refreshDocuments();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setErrorMsg(null);
      await upload(file);
      await refreshDocuments();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-foreground/30 backdrop-blur-sm">
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col rounded-3xl border border-border bg-card shadow-elevated overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-5 sm:p-6 bg-card">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-foreground">
                Document Context Library
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Manage all uploaded source materials and segregated contexts for your study decks
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {errorMsg && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3.5 flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Quick Upload Box */}
          <div className="rounded-2xl border-2 border-dashed border-border bg-muted/20 p-4 transition hover:border-primary">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3 text-center sm:text-left">
                <div className="rounded-xl bg-primary/10 p-2 text-primary shrink-0">
                  <Upload className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground">Upload New Study Context</p>
                  <p className="text-[11px] text-muted-foreground">
                    PDFs are automatically parsed and embedded into isolated tenant vectors
                  </p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={stage !== "idle" && stage !== "done"}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 shrink-0 transition"
              >
                {stage !== "idle" && stage !== "done" ? "Processing..." : "Select PDF Document"}
              </button>
            </div>

            {/* Ingestion Progress */}
            {stage !== "idle" && stage !== "done" && (
              <div className="mt-3 space-y-2 pt-2 border-t border-border/40">
                <div className="flex justify-between text-xs font-medium">
                  <span className="truncate">{fileName}</span>
                  <span className="text-primary font-bold">{progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Documents List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Stored Documents ({documents.length})
              </span>
              <span className="text-xs text-muted-foreground">
                {documents.reduce((acc, d) => acc + (d.chunk_count || 0), 0)} total semantic chunks
              </span>
            </div>

            {documents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center bg-card">
                <FileText className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-xs font-semibold text-foreground">No documents in your library</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Upload a PDF above to build your private active-recall knowledge base.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {documents.map((doc) => (
                  <div
                    key={doc.document_id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 transition hover:border-border/80 shadow-soft"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="rounded-xl bg-primary/10 p-2.5 text-primary shrink-0">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-foreground truncate">
                          {doc.filename}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="rounded-md bg-muted px-2 py-0.5 font-medium">
                            {doc.chunk_count || 0} chunks
                          </span>
                          <span>•</span>
                          <span>ID: {(doc.document_id || "").slice(0, 12)}</span>
                          {doc.created_at && (
                            <>
                              <span>•</span>
                              <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={deletingId === doc.document_id}
                      onClick={() => handleDelete(doc.document_id, doc.filename)}
                      className="flex items-center gap-1.5 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40 transition shrink-0"
                      title="Permanently delete document"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border p-4 sm:p-5 bg-card/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

