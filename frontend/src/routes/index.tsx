import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  ArrowUpDown,
  CheckCircle2,
  Edit2,
  FileText,
  FileUp,
  Folder as FolderIcon,
  HelpCircle,
  Layers,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/mneme/AppShell";
import { ContextLibraryModal } from "@/components/mneme/ContextLibraryModal";
import { CreateDeckModal } from "@/components/mneme/CreateDeckModal";
import { DeckModal } from "@/components/mneme/DeckModal";
import { FolderModal } from "@/components/mneme/FolderModal";
import {
  getFolderColor,
  useDecks,
  useFolders,
  useUploadDocument,
  type Deck,
  type Folder,
} from "@/services/mneme";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mneme — AI Active Recall Studio" },
      { name: "description", content: "Upload notes and turn them into flashcards, quizzes and recall drills powered by AI." },
      { property: "og:title", content: "Mneme — AI Active Recall Studio" },
      { property: "og:description", content: "Upload notes and turn them into flashcards, quizzes and recall drills powered by AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const STAGES = [
  { key: "extracting", label: "Extracting concepts" },
  { key: "vectorizing", label: "Vectorizing to Qdrant" },
  { key: "saving", label: "Generating Flashcards & Quiz" },
] as const;

function Dashboard() {
  const { stage, progress, fileName, createdDeckId, upload, reset } = useUploadDocument();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Search & Filter state
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"updated" | "title" | "cards" | "quizzes">("updated");

  // Decks & Folders hooks
  const { decks, loading, refresh, deleteDeck, moveDeck, setActiveDeckId } = useDecks({
    folderId: selectedFolderId,
    search: searchQuery,
    sortBy: sortBy,
  });

  const { folders, refreshFolders } = useFolders();

  useEffect(() => {
    if (stage === "done") {
      refresh();
    }
  }, [stage, refresh]);

  // Modals state
  const [managingDeckId, setManagingDeckId] = useState<string | null>(null);
  const [isCreatingDeck, setIsCreatingDeck] = useState(false);
  const [isManagingContexts, setIsManagingContexts] = useState(false);
  const [folderToEdit, setFolderToEdit] = useState<Folder | null | "new">(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fileDrag, setFileDrag] = useState(false);

  const busy = stage !== "idle" && stage !== "done";
  const activeIdx = STAGES.findIndex((s) => s.key === stage);

  const handleFileUpload = (f?: File) => f && !busy && upload(f);

  const handleStudyCards = (d: Deck) => {
    setActiveDeckId(d.id);
    navigate({ to: "/flashcards" });
  };

  const handleTakeQuiz = (d: Deck) => {
    setActiveDeckId(d.id);
    navigate({ to: "/quiz" });
  };

  const handleDeleteDeck = async (e: React.MouseEvent, deckId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this deck? All flashcards and quizzes inside will be removed.")) {
      setDeletingId(deckId);
      await deleteDeck(deckId);
      setDeletingId(null);
    }
  };

  // Drag & drop handlers for moving decks into folders
  const handleDragStart = (e: React.DragEvent, deckId: string) => {
    e.dataTransfer.setData("text/plain", deckId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleFolderDrop = async (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const deckId = e.dataTransfer.getData("text/plain");
    if (deckId) {
      await moveDeck(deckId, targetFolderId);
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="Active Recall Studio"
        title="What will you remember today?"
        subtitle="Drop your notes or textbook, and Mneme organizes unified decks with both diagnostic flashcards and self-testing quizzes."
      />

      {/* Upload Drop Zone */}
      <motion.div
        whileHover={{ y: -2 }}
        onDragOver={(e) => {
          e.preventDefault();
          setFileDrag(true);
        }}
        onDragLeave={() => setFileDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setFileDrag(false);
          handleFileUpload(e.dataTransfer.files[0]);
        }}
        onClick={() => stage === "idle" && inputRef.current?.click()}
        className={`cursor-pointer rounded-[2rem] border-2 border-dashed bg-card p-8 text-center shadow-soft transition-all hover:shadow-elevated md:p-12 ${
          fileDrag ? "border-primary bg-secondary/60" : "border-border"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.md,.docx"
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files?.[0])}
        />
        {stage === "idle" && (
          <>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-3xl bg-gradient-primary text-primary-foreground shadow-elevated">
              <FileUp className="h-6 w-6" />
            </div>
            <h2 className="mt-4 font-display text-lg font-bold">Drop your study material</h2>
            <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX, TXT or Markdown · up to 50 MB</p>
          </>
        )}
        {stage !== "idle" && (
          <div className="mx-auto max-w-md text-left" onClick={(e) => e.stopPropagation()}>
            <p className="truncate text-sm font-semibold">{fileName}</p>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                className={`h-full rounded-full ${stage === "done" ? "bg-success" : "bg-gradient-primary"}`}
                animate={{ width: `${progress}%` }}
                transition={{ ease: "easeOut" }}
              />
            </div>
            <ul className="mt-4 space-y-2">
              {STAGES.map((s, i) => {
                const done = stage === "done" || i < activeIdx;
                const active = i === activeIdx;
                return (
                  <li
                    key={s.key}
                    className={`flex items-center gap-2.5 text-xs ${
                      done ? "text-foreground font-medium" : active ? "text-primary font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <span className={`h-3.5 w-3.5 rounded-full border-2 ${active ? "animate-pulse border-primary" : "border-border"}`} />
                    )}
                    {s.label}
                  </li>
                );
              })}
            </ul>
            {stage === "done" && (
              <div className="mt-5 flex gap-2">
                <button
                  onClick={async () => {
                    await refresh();
                    if (createdDeckId) {
                      setManagingDeckId(createdDeckId);
                      setActiveDeckId(createdDeckId);
                    } else if (decks.length > 0) {
                      setManagingDeckId(decks[0].id);
                      setActiveDeckId(decks[0].id);
                    }
                    reset();
                  }}
                  className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 shadow-sm transition"
                >
                  View Generated Deck
                </button>
                <button
                  onClick={reset}
                  className="rounded-full bg-secondary px-4 py-2 text-xs font-semibold text-secondary-foreground hover:bg-muted transition"
                >
                  Upload Another
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Control Bar: Folders, Search, Sort & Actions */}
      <div className="mt-12 space-y-4">
        {/* Top actions & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search decks by title or content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl border border-border bg-card pl-9 pr-4 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground shadow-soft focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Sort selector */}
            <div className="flex items-center gap-1.5 rounded-2xl border border-border bg-card px-3 py-1.5 text-xs text-foreground shadow-soft">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent font-medium text-xs focus:outline-none cursor-pointer"
              >
                <option value="updated">Recently Updated</option>
                <option value="title">Title (A-Z)</option>
                <option value="cards">Most Flashcards</option>
                <option value="quizzes">Most Quizzes</option>
              </select>
            </div>

            {/* Context Library */}
            <button
              onClick={() => setIsManagingContexts(true)}
              className="flex items-center gap-1.5 rounded-2xl border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-soft transition hover:bg-muted"
              title="Manage study documents and segregated contexts"
            >
              <FileText className="h-3.5 w-3.5 text-primary" /> Context Library
            </button>

            {/* Create Blank Deck */}
            <button
              onClick={() => setIsCreatingDeck(true)}
              className="flex items-center gap-1.5 rounded-2xl border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground shadow-soft transition hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5 text-primary" /> New Deck
            </button>

            {/* Create Folder */}
            <button
              onClick={() => setFolderToEdit("new")}
              className="flex items-center gap-1.5 rounded-2xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft transition hover:opacity-90"
            >
              <FolderIcon className="h-3.5 w-3.5" /> New Folder
            </button>
          </div>
        </div>

        {/* Folder Pills Bar (Droppable targets for Drag & Drop!) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          {/* "All Decks" Pill */}
          <button
            onClick={() => setSelectedFolderId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleFolderDrop(e, null)}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-semibold transition shrink-0 ${
              selectedFolderId === null
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All Decks
          </button>

          {/* User Folders */}
          {folders.map((f) => {
            const isSelected = selectedFolderId === f.folder_id;
            const isDragOver = dragOverFolderId === f.folder_id;
            const colorSpec = getFolderColor(f.color);

            return (
              <div
                key={f.folder_id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverFolderId(f.folder_id);
                }}
                onDragLeave={() => setDragOverFolderId(null)}
                onDrop={(e) => handleFolderDrop(e, f.folder_id)}
                className={`group flex items-center gap-2 rounded-xl px-3 py-1.5 font-semibold transition shrink-0 border cursor-pointer ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : isDragOver
                    ? "bg-primary/20 border-primary ring-2 ring-primary"
                    : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-border/80"
                }`}
                onClick={() => setSelectedFolderId(f.folder_id)}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${colorSpec.dot}`} />
                <span>{f.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFolderToEdit(f);
                  }}
                  className={`p-1 rounded-lg transition-all ${
                    isSelected
                      ? "opacity-90 hover:opacity-100 text-primary-foreground bg-primary-foreground/20 hover:bg-primary-foreground/30"
                      : "opacity-70 hover:opacity-100 text-foreground/80 hover:text-foreground hover:bg-muted"
                  }`}
                  title="Folder Settings"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}

          {/* "Unorganized" Pill */}
          <button
            onClick={() => setSelectedFolderId("unorganized")}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverFolderId("unorganized");
            }}
            onDragLeave={() => setDragOverFolderId(null)}
            onDrop={(e) => handleFolderDrop(e, null)}
            className={`flex items-center gap-2 rounded-xl px-3 py-1.5 font-semibold transition shrink-0 border ${
              selectedFolderId === "unorganized"
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : dragOverFolderId === "unorganized"
                ? "bg-primary/20 border-primary ring-2 ring-primary"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            Unorganized
          </button>
        </div>
      </div>

      {/* Decks Grid */}
      <div className="mt-6 mb-4 flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-foreground">
          Decks ({decks.length})
        </h3>
        <span className="text-xs text-muted-foreground">
          Drag cards onto folders above to organize
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {decks.length === 0 ? (
          <div className="col-span-2 rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center">
            <Layers className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
            <p className="font-semibold text-foreground">No decks found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {searchQuery
                ? "No decks match your search criteria."
                : "Upload study materials or create a new deck to get started."}
            </p>
          </div>
        ) : (
          decks.map((d, i) => {
            const folderObj = folders.find((f) => f.folder_id === d.folder_id);
            const colorSpec = getFolderColor(d.color || folderObj?.color);

            return (
              <motion.div
                key={d.id}
                draggable
                onDragStart={(e) => handleDragStart(e as any, d.id)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="group relative flex flex-col justify-between rounded-3xl border border-border bg-card p-5 shadow-soft transition-all hover:shadow-elevated hover:border-primary/40 cursor-grab active:cursor-grabbing"
              >
                <div>
                  {/* Card Top: Folder badge & quick actions */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${colorSpec.dot}`} />
                      <span className="text-[11px] font-bold text-muted-foreground truncate uppercase tracking-wider">
                        {folderObj ? folderObj.name : "Unorganized"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setManagingDeckId(d.id)}
                        className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        title="Manage Cards & Quizzes"
                      >
                        <Settings2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteDeck(e, d.id)}
                        disabled={deletingId === d.id}
                        className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-destructive-soft hover:text-destructive"
                        title="Delete Deck"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Title */}
                  <h4
                    onClick={() => setManagingDeckId(d.id)}
                    className="mt-3 font-display text-lg font-bold text-foreground hover:text-primary transition cursor-pointer truncate"
                  >
                    {d.title}
                  </h4>

                  {/* Unified Counters */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 font-medium">
                      <Layers className="h-3.5 w-3.5 text-primary" />
                      {d.flashcards?.length || 0} Cards
                    </span>
                    <span className="flex items-center gap-1 font-medium">
                      <HelpCircle className="h-3.5 w-3.5 text-accent" />
                      {d.quizzes?.length || 0} Questions
                    </span>
                    {(d.document_ids?.length ?? (d.document_id ? 1 : 0)) > 0 && (
                      <span className="flex items-center gap-1 font-medium text-foreground/80">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        {d.document_ids?.length || 1} Context{((d.document_ids?.length || 1) > 1) ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom Actions: Flashcards vs Quiz Buttons */}
                <div className="mt-5 pt-3 border-t border-border/60 flex items-center gap-2">
                  <button
                    onClick={() => handleStudyCards(d)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 py-2 text-xs font-bold text-primary transition hover:bg-primary hover:text-primary-foreground"
                  >
                    <Layers className="h-3.5 w-3.5" /> Study Cards
                  </button>
                  <button
                    onClick={() => handleTakeQuiz(d)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-secondary py-2 text-xs font-bold text-secondary-foreground transition hover:bg-accent hover:text-accent-foreground"
                  >
                    <HelpCircle className="h-3.5 w-3.5" /> Take Quiz
                  </button>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* MODALS */}
      {managingDeckId && (
        <DeckModal
          deckId={managingDeckId}
          onClose={() => setManagingDeckId(null)}
          onUpdated={() => {
            refresh();
            refreshFolders();
          }}
        />
      )}

      {isCreatingDeck && (
        <CreateDeckModal
          onClose={() => setIsCreatingDeck(false)}
          onCreated={(newDeckId) => {
            refresh();
            setManagingDeckId(newDeckId);
          }}
        />
      )}

      {folderToEdit && (
        <FolderModal
          folder={folderToEdit === "new" ? null : folderToEdit}
          onClose={() => setFolderToEdit(null)}
          onSaved={() => {
            refreshFolders();
            refresh();
          }}
        />
      )}

      {isManagingContexts && (
        <ContextLibraryModal
          open={isManagingContexts}
          onClose={() => setIsManagingContexts(false)}
        />
      )}
    </AppShell>
  );
}
