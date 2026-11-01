import { useState } from "react";
import {
  Check,
  Edit2,
  FileText,
  Folder as FolderIcon,
  HelpCircle,
  Layers,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  FOLDER_COLORS,
  useDeckContexts,
  useDeckDetails,
  useDecks,
  useFolders,
  type Flashcard,
  type Mcq,
} from "@/services/mneme";

export function DeckModal({
  deckId,
  onClose,
  onUpdated,
}: {
  deckId: string | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const {
    deck,
    setDeck,
    loading,
    generating,
    addCard,
    updateCard,
    deleteCard,
    addQuiz,
    updateQuiz,
    deleteQuiz,
    generateMore,
  } = useDeckDetails(deckId);

  const { updateDeck } = useDecks();
  const { folders } = useFolders();
  const { attachedDocs, availableDocs, attachDoc, detachDoc, uploadDocToDeck } = useDeckContexts(deckId);

  const [activeTab, setActiveTab] = useState<"flashcards" | "quizzes" | "contexts" | "ai">("flashcards");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedContextToAttach, setSelectedContextToAttach] = useState<string>("none");
  const [uploadingContext, setUploadingContext] = useState(false);

  // Deck metadata editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");

  // Card form state
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [cardFront, setCardFront] = useState("");
  const [cardBack, setCardBack] = useState("");
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");

  // Quiz form state
  const [isAddingQuiz, setIsAddingQuiz] = useState(false);
  const [quizQuestion, setQuizQuestion] = useState("");
  const [quizOptions, setQuizOptions] = useState(["", "", "", ""]);
  const [quizAnswer, setQuizAnswer] = useState(0);
  const [quizExplanation, setQuizExplanation] = useState("");
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [editQuizQuestion, setEditQuizQuestion] = useState("");
  const [editQuizOptions, setEditQuizOptions] = useState(["", "", "", ""]);
  const [editQuizAnswer, setEditQuizAnswer] = useState(0);
  const [editQuizExplanation, setEditQuizExplanation] = useState("");

  // AI Generator state
  const [genMode, setGenMode] = useState<"both" | "flashcards" | "quiz">("both");
  const [genCount, setGenCount] = useState(5);
  const [genPrompt, setGenPrompt] = useState("");
  const [genSuccessMsg, setGenSuccessMsg] = useState("");

  if (!deckId || !deck) {
    return null;
  }

  const handleSaveTitle = async () => {
    if (titleValue.trim() && titleValue !== deck.title) {
      setDeck((prev) => (prev ? { ...prev, title: titleValue.trim() } : prev));
      await updateDeck(deck.id, { title: titleValue.trim() });
      onUpdated();
    }
    setEditingTitle(false);
  };

  const handleFolderChange = async (folder_id: string) => {
    const targetFolder = folder_id === "none" ? null : folder_id;
    setDeck((prev) => (prev ? { ...prev, folder_id: targetFolder } : prev));
    await updateDeck(deck.id, { folder_id: targetFolder });
    onUpdated();
  };

  const handleColorChange = async (color: string) => {
    setDeck((prev) => (prev ? { ...prev, color } : prev));
    await updateDeck(deck.id, { color });
    onUpdated();
  };

  // Card actions
  const handleCreateCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardFront.trim() || !cardBack.trim()) return;
    await addCard(cardFront.trim(), cardBack.trim());
    setCardFront("");
    setCardBack("");
    setIsAddingCard(false);
    onUpdated();
  };

  const handleSaveEditCard = async (cardId: string) => {
    if (!editFront.trim() || !editBack.trim()) return;
    await updateCard(cardId, editFront.trim(), editBack.trim());
    setEditingCardId(null);
    onUpdated();
  };

  const handleDeleteCard = async (cardId: string) => {
    if (confirm("Delete this flashcard?")) {
      await deleteCard(cardId);
      onUpdated();
    }
  };

  // Quiz actions
  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quizQuestion.trim() || quizOptions.some((o) => !o.trim())) return;
    await addQuiz(
      quizQuestion.trim(),
      quizOptions.map((o) => o.trim()),
      quizAnswer,
      quizExplanation.trim()
    );
    setQuizQuestion("");
    setQuizOptions(["", "", "", ""]);
    setQuizAnswer(0);
    setQuizExplanation("");
    setIsAddingQuiz(false);
    onUpdated();
  };

  const handleSaveEditQuiz = async (quizId: string) => {
    if (!editQuizQuestion.trim() || editQuizOptions.some((o) => !o.trim())) return;
    await updateQuiz(quizId, {
      question: editQuizQuestion.trim(),
      options: editQuizOptions.map((o) => o.trim()),
      answer: editQuizAnswer,
      explanation: editQuizExplanation.trim(),
    });
    setEditingQuizId(null);
    onUpdated();
  };

  const handleDeleteQuiz = async (quizId: string) => {
    if (confirm("Delete this quiz question?")) {
      await deleteQuiz(quizId);
      onUpdated();
    }
  };

  // AI Generation
  const handleGenerate = async () => {
    setGenSuccessMsg("");
    const docIds = attachedDocs.map((d) => d.document_id);
    const ok = await generateMore(genMode, genCount, genPrompt, docIds);
    if (ok) {
      setGenSuccessMsg("Successfully generated new study material!");
      setGenPrompt("");
      onUpdated();
      // Auto-switch to the appropriate tab so user immediately sees the generated content
      if (genMode === "quiz") {
        setActiveTab("quizzes");
      } else {
        setActiveTab("flashcards");
      }
    }
  };

  // Filters
  const filteredCards = (deck.flashcards || []).filter(
    (c) =>
      c.front.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.back.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredQuizzes = (deck.quizzes || []).filter(
    (q) =>
      q.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.explanation.toLowerCase().includes(searchTerm.toLowerCase()) ||
      q.options.some((opt) => opt.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-foreground/30 backdrop-blur-sm">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-3xl border border-border bg-card shadow-elevated overflow-hidden">
        {/* Header */}
        <div className="border-b border-border p-4 sm:p-6 bg-card">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  Unified Deck
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  attachedDocs.length > 0 ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground"
                }`}>
                  {attachedDocs.length > 0 ? `${attachedDocs.length} Context Document${attachedDocs.length > 1 ? "s" : ""}` : "No Contexts Attached"}
                </span>
              </div>

              {editingTitle ? (
                <div className="flex items-center gap-2 max-w-md">
                  <input
                    type="text"
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    className="flex-1 rounded-xl border border-border bg-muted px-3 py-1.5 font-display text-lg sm:text-xl font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveTitle}
                    className="rounded-xl bg-primary px-3 py-1.5 text-xs sm:text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingTitle(false)}
                    className="rounded-xl border border-border px-3 py-1.5 text-xs sm:text-sm text-muted-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-foreground truncate">
                    {deck.title}
                  </h2>
                  <button
                    onClick={() => {
                      setTitleValue(deck.title);
                      setEditingTitle(true);
                    }}
                    className="rounded-lg p-1 text-muted-foreground opacity-60 hover:opacity-100 hover:bg-muted"
                    title="Rename Deck"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* Folder & Color Badges */}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FolderIcon className="h-3.5 w-3.5" />
                  <select
                    value={deck.folder_id || "none"}
                    onChange={(e) => handleFolderChange(e.target.value)}
                    className="bg-muted border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="none">No Folder (Unorganized)</option>
                    {folders.map((f) => (
                      <option key={f.folder_id} value={f.folder_id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Color Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Color:</span>
                  <div className="flex items-center gap-1">
                    {FOLDER_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => handleColorChange(c.value)}
                        className={`h-5 w-5 rounded-full ${c.dot} transition-transform ${
                          deck.color === c.value ? "scale-125 ring-2 ring-primary ring-offset-2" : "opacity-70 hover:opacity-100"
                        }`}
                        title={c.label}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                onUpdated();
                onClose();
              }}
              className="rounded-full p-2 text-muted-foreground hover:bg-muted"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border">
            <div className="flex gap-1 sm:gap-2 overflow-x-auto pb-1 sm:pb-0 text-xs sm:text-sm">
              <button
                onClick={() => {
                  setActiveTab("flashcards");
                  setSearchTerm("");
                }}
                className={`flex items-center gap-1.5 sm:gap-2 border-b-2 px-3 sm:px-4 py-2 font-semibold transition shrink-0 ${
                  activeTab === "flashcards"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="h-4 w-4" />
                Flashcards ({deck.flashcards?.length || 0})
              </button>
              <button
                onClick={() => {
                  setActiveTab("quizzes");
                  setSearchTerm("");
                }}
                className={`flex items-center gap-1.5 sm:gap-2 border-b-2 px-3 sm:px-4 py-2 font-semibold transition shrink-0 ${
                  activeTab === "quizzes"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <HelpCircle className="h-4 w-4" />
                Quiz ({deck.quizzes?.length || 0})
              </button>
              <button
                onClick={() => {
                  setActiveTab("contexts");
                  setSearchTerm("");
                }}
                className={`flex items-center gap-1.5 sm:gap-2 border-b-2 px-3 sm:px-4 py-2 font-semibold transition shrink-0 ${
                  activeTab === "contexts"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileText className="h-4 w-4" />
                Contexts ({attachedDocs.length})
              </button>
              <button
                onClick={() => setActiveTab("ai")}
                className={`flex items-center gap-1.5 sm:gap-2 border-b-2 px-3 sm:px-4 py-2 font-semibold transition shrink-0 ${
                  activeTab === "ai"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="h-4 w-4 text-primary" />
                Generate with AI
              </button>
            </div>

            {activeTab !== "ai" && activeTab !== "contexts" && (
              <div className="relative mb-2 w-full sm:w-56">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search in deck..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-border bg-muted/70 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB: FLASHCARDS */}
          {activeTab === "flashcards" && (
            <div>
              {genSuccessMsg && (
                <div className="mb-4 flex items-center justify-between rounded-2xl bg-success/10 border border-success/30 px-4 py-3 text-xs font-semibold text-success animate-in fade-in duration-300">
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    {genSuccessMsg} Your flashcards are listed below.
                  </span>
                  <button onClick={() => setGenSuccessMsg("")} className="hover:opacity-75">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Showing {filteredCards.length} of {deck.flashcards?.length || 0} cards
                </span>
                {!isAddingCard && (
                  <button
                    onClick={() => setIsAddingCard(true)}
                    className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Card
                  </button>
                )}
              </div>

              {/* Add Card Form */}
              {isAddingCard && (
                <form
                  onSubmit={handleCreateCard}
                  className="mb-6 rounded-2xl border border-primary/40 bg-secondary/30 p-4 space-y-3"
                >
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                    Create New Flashcard
                  </h4>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      Front (Prompt / Concept)
                    </label>
                    <textarea
                      rows={2}
                      value={cardFront}
                      onChange={(e) => setCardFront(e.target.value)}
                      placeholder="e.g. What is Long-Term Potentiation (LTP)?"
                      className="mt-1 w-full rounded-xl border border-border bg-card p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      Back (Answer / Explanation)
                    </label>
                    <textarea
                      rows={3}
                      value={cardBack}
                      onChange={(e) => setCardBack(e.target.value)}
                      placeholder="e.g. LTP is the persistent strengthening of synapses based on recent patterns of activity..."
                      className="mt-1 w-full rounded-xl border border-border bg-card p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingCard(false)}
                      className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!cardFront.trim() || !cardBack.trim()}
                      className="rounded-xl bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      Add Flashcard
                    </button>
                  </div>
                </form>
              )}

              {/* Cards List */}
              {filteredCards.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                  <p className="text-sm font-semibold text-foreground">No flashcards found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add one manually or use the AI Generator tab to generate cards automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredCards.map((c, idx) => {
                    const isEditing = editingCardId === c.id;
                    return (
                      <div
                        key={c.id || idx}
                        className="rounded-2xl border border-border bg-card p-4 transition shadow-soft hover:shadow-elevated"
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <div>
                              <label className="text-[10px] font-bold uppercase text-muted-foreground">
                                Front
                              </label>
                              <textarea
                                rows={2}
                                value={editFront}
                                onChange={(e) => setEditFront(e.target.value)}
                                className="w-full rounded-xl border border-border bg-muted p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-muted-foreground">
                                Back
                              </label>
                              <textarea
                                rows={2}
                                value={editBack}
                                onChange={(e) => setEditBack(e.target.value)}
                                className="w-full rounded-xl border border-border bg-muted p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </div>
                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                onClick={() => setEditingCardId(null)}
                                className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveEditCard(c.id)}
                                className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
                              >
                                <Save className="h-3 w-3" /> Save Card
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono font-bold text-muted-foreground">
                                  #{idx + 1}
                                </span>
                                <p className="text-xs font-bold text-foreground">{c.front}</p>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed pl-7">
                                {c.back}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => {
                                  setEditingCardId(c.id);
                                  setEditFront(c.front);
                                  setEditBack(c.back);
                                }}
                                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                                title="Edit"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteCard(c.id)}
                                className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: QUIZZES */}
          {activeTab === "quizzes" && (
            <div>
              {genSuccessMsg && (
                <div className="mb-4 flex items-center justify-between rounded-2xl bg-success/10 border border-success/30 px-4 py-3 text-xs font-semibold text-success animate-in fade-in duration-300">
                  <span className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    {genSuccessMsg} Your diagnostic quiz questions are listed below.
                  </span>
                  <button onClick={() => setGenSuccessMsg("")} className="hover:opacity-75">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Showing {filteredQuizzes.length} of {deck.quizzes?.length || 0} questions
                </span>
                {!isAddingQuiz && (
                  <button
                    onClick={() => setIsAddingQuiz(true)}
                    className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Question
                  </button>
                )}
              </div>

              {/* Add Quiz Form */}
              {isAddingQuiz && (
                <form
                  onSubmit={handleCreateQuiz}
                  className="mb-6 rounded-2xl border border-primary/40 bg-secondary/30 p-4 space-y-3"
                >
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                    Create New Quiz Question
                  </h4>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      Question Prompt
                    </label>
                    <textarea
                      rows={2}
                      value={quizQuestion}
                      onChange={(e) => setQuizQuestion(e.target.value)}
                      placeholder="e.g. Which neurotransmitter is primarily involved in neuromuscular junction signaling?"
                      className="mt-1 w-full rounded-xl border border-border bg-card p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      Answer Options (select radio for correct answer)
                    </label>
                    {quizOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="correct_answer"
                          checked={quizAnswer === i}
                          onChange={() => setQuizAnswer(i)}
                          className="text-primary focus:ring-primary"
                        />
                        <span className="font-mono text-xs font-bold text-muted-foreground w-4">
                          {String.fromCharCode(65 + i)}
                        </span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const next = [...quizOptions];
                            next[i] = e.target.value;
                            setQuizOptions(next);
                          }}
                          placeholder={`Option ${String.fromCharCode(65 + i)}`}
                          className="flex-1 rounded-xl border border-border bg-card px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground">
                      Explanation (Why is this answer correct?)
                    </label>
                    <textarea
                      rows={2}
                      value={quizExplanation}
                      onChange={(e) => setQuizExplanation(e.target.value)}
                      placeholder="e.g. Acetylcholine binds to nicotinic receptors at the motor end plate..."
                      className="mt-1 w-full rounded-xl border border-border bg-card p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingQuiz(false)}
                      className="rounded-xl border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!quizQuestion.trim() || quizOptions.some((o) => !o.trim())}
                      className="rounded-xl bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      Add Question
                    </button>
                  </div>
                </form>
              )}

              {/* Quiz List */}
              {filteredQuizzes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                  <p className="text-sm font-semibold text-foreground">No quiz questions found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Add one manually or use the AI Generator tab to generate questions automatically.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredQuizzes.map((q, idx) => {
                    const isEditing = editingQuizId === q.id;
                    return (
                      <div
                        key={q.id || idx}
                        className="rounded-2xl border border-border bg-card p-4 transition shadow-soft hover:shadow-elevated"
                      >
                        {isEditing ? (
                          <div className="space-y-2">
                            <textarea
                              rows={2}
                              value={editQuizQuestion}
                              onChange={(e) => setEditQuizQuestion(e.target.value)}
                              className="w-full rounded-xl border border-border bg-muted p-2 text-xs text-foreground"
                            />
                            {editQuizOptions.map((opt, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <input
                                  type="radio"
                                  name={`edit_q_${q.id}`}
                                  checked={editQuizAnswer === i}
                                  onChange={() => setEditQuizAnswer(i)}
                                />
                                <span className="text-xs font-bold text-muted-foreground font-mono">
                                  {String.fromCharCode(65 + i)}
                                </span>
                                <input
                                  type="text"
                                  value={opt}
                                  onChange={(e) => {
                                    const next = [...editQuizOptions];
                                    next[i] = e.target.value;
                                    setEditQuizOptions(next);
                                  }}
                                  className="flex-1 rounded-lg border border-border bg-muted px-2.5 py-1 text-xs"
                                />
                              </div>
                            ))}
                            <textarea
                              rows={2}
                              value={editQuizExplanation}
                              onChange={(e) => setEditQuizExplanation(e.target.value)}
                              placeholder="Explanation"
                              className="w-full rounded-xl border border-border bg-muted p-2 text-xs text-foreground"
                            />
                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                onClick={() => setEditingQuizId(null)}
                                className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveEditQuiz(q.id)}
                                className="rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                              >
                                Save Question
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-2">
                                <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono font-bold text-muted-foreground mt-0.5">
                                  Q{idx + 1}
                                </span>
                                <p className="text-xs font-bold text-foreground">{q.question}</p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => {
                                    setEditingQuizId(q.id);
                                    setEditQuizQuestion(q.question);
                                    setEditQuizOptions([...q.options]);
                                    setEditQuizAnswer(q.answer);
                                    setEditQuizExplanation(q.explanation || "");
                                  }}
                                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteQuiz(q.id)}
                                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Options */}
                            <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
                              {q.options.map((opt, i) => {
                                const isCorrect = i === q.answer;
                                return (
                                  <div
                                    key={i}
                                    className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs ${
                                      isCorrect
                                        ? "bg-success/15 border border-success/30 font-semibold text-success"
                                        : "bg-muted/50 text-foreground"
                                    }`}
                                  >
                                    <span className="font-mono text-[10px] font-bold">
                                      {String.fromCharCode(65 + i)}
                                    </span>
                                    <span className="truncate">{opt}</span>
                                    {isCorrect && <Check className="ml-auto h-3 w-3 text-success shrink-0" />}
                                  </div>
                                );
                              })}
                            </div>

                            {q.explanation && (
                              <p className="mt-2 pl-7 text-[11px] text-muted-foreground italic">
                                Note: {q.explanation}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: CONTEXTS */}
          {activeTab === "contexts" && (
            <div className="max-w-2xl mx-auto space-y-6 py-2">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-foreground">Deck-Specific Study Contexts</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Attach or upload PDFs and lecture notes specific to this deck. Mneme AI extracts and
                      synthesizes flashcards and quiz questions directly from your attached segregated contexts.
                    </p>
                  </div>
                </div>
              </div>

              {/* Attach Existing or Upload New */}
              <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-soft">
                <div className="flex items-center justify-between pb-2 border-b border-border/60">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                    Attach Study Contexts
                  </h4>
                  <span className="text-[11px] text-muted-foreground">
                    Link existing PDFs or upload new ones
                  </span>
                </div>

                {/* Section A: Attach from Library */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                    <span>1. Attach from Document Library</span>
                    <span className="text-[11px] font-normal text-muted-foreground">
                      {availableDocs.length} unattached file{availableDocs.length !== 1 ? "s" : ""} available
                    </span>
                  </label>
                  {availableDocs.length > 0 ? (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <select
                        value={selectedContextToAttach}
                        onChange={(e) => setSelectedContextToAttach(e.target.value)}
                        className="w-full sm:flex-1 rounded-xl border border-border bg-muted/50 px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary truncate"
                      >
                        <option value="none">Choose a document from library...</option>
                        {availableDocs.map((doc) => (
                          <option key={doc.document_id} value={doc.document_id}>
                            {doc.filename} ({doc.chunk_count || 0} chunks)
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={selectedContextToAttach === "none"}
                        onClick={async () => {
                          if (selectedContextToAttach !== "none") {
                            await attachDoc(selectedContextToAttach);
                            setSelectedContextToAttach("none");
                            onUpdated();
                          }
                        }}
                        className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40 shrink-0 transition"
                      >
                        Attach to Deck
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground">
                      {allDocs.length === 0
                        ? "Your document library is empty. Upload a PDF below to get started."
                        : "All documents currently in your library are already attached to this deck."}
                    </div>
                  )}
                </div>

                {/* Subtle Divider */}
                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-border"></div>
                  <span className="flex-shrink mx-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    OR
                  </span>
                  <div className="flex-grow border-t border-border"></div>
                </div>

                {/* Section B: Upload Direct to Deck */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">
                    2. Upload New PDF Directly to this Deck
                  </label>
                  <label
                    className={`group flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-border bg-muted/20 p-4 transition cursor-pointer hover:border-primary hover:bg-muted/40 ${
                      uploadingContext ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="rounded-xl bg-primary/10 p-2 text-primary shrink-0 group-hover:scale-105 transition-transform">
                        <Upload className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground">
                          {uploadingContext ? "Ingesting and vectorizing document..." : "Click to select and upload a study PDF"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Automatically parses semantic chunks and attaches them directly to this deck
                        </p>
                      </div>
                    </div>
                    <span className="rounded-xl bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shrink-0 shadow-sm transition hover:opacity-90">
                      {uploadingContext ? "Ingesting..." : "Select PDF Document"}
                    </span>
                    <input
                      type="file"
                      accept=".pdf"
                      disabled={uploadingContext}
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          setUploadingContext(true);
                          try {
                            await uploadDocToDeck(f);
                            onUpdated();
                          } finally {
                            setUploadingContext(false);
                            e.target.value = "";
                          }
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Attached Documents List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Attached Context Documents ({attachedDocs.length})
                  </h4>
                  {attachedDocs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab("ai")}
                      className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Generate from these contexts
                    </button>
                  )}
                </div>

                {attachedDocs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-8 text-center bg-card/50">
                    <FileText className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-xs font-semibold text-foreground">No documents attached yet</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                      Attach documents from your library or upload a PDF above to ground your deck's AI flashcards and quiz questions.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {attachedDocs.map((doc) => (
                      <div
                        key={doc.document_id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3.5 transition hover:border-border/80"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="rounded-xl bg-primary/10 p-2 text-primary shrink-0">
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-foreground truncate">
                                {doc.filename}
                              </span>
                              <span className="rounded-md bg-success/10 text-success border border-success/20 px-1.5 py-0.2 text-[10px] font-semibold shrink-0">
                                Active Context
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {doc.chunk_count || 0} semantic chunks • ID: {doc.document_id.slice(0, 10)}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={async () => {
                            await detachDoc(doc.document_id);
                            onUpdated();
                          }}
                          className="rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive-soft hover:border-destructive/30 shrink-0 transition"
                          title="Detach from this deck (document remains in library)"
                        >
                          Detach
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: AI GENERATOR */}
          {activeTab === "ai" && (
            <div className="max-w-xl mx-auto space-y-5 py-4">
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-primary mb-2" />
                <h3 className="font-display text-base font-bold text-foreground">
                  Generate Content with GroqCloud Qwen 27B
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  AI will analyze the deck's attached source contexts and instructions to synthesize
                  diagnostic flashcards and quiz questions.
                </p>
              </div>

              {/* Grounding Context Status */}
              {attachedDocs.length > 0 ? (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <FileText className="h-4 w-4" />
                      Grounded with {attachedDocs.length} Attached Context{attachedDocs.length > 1 ? "s" : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab("contexts")}
                      className="text-[11px] font-semibold text-primary hover:underline"
                    >
                      Manage contexts
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {attachedDocs.map((d) => (
                      <span
                        key={d.document_id}
                        className="rounded-lg bg-card border border-border px-2 py-0.5 text-[11px] font-medium text-foreground truncate max-w-xs"
                      >
                        {d.filename}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-warning/30 bg-warning/10 p-3.5 flex items-center justify-between text-xs text-warning-foreground">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-warning" />
                    No source documents attached to this deck yet.
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab("contexts")}
                    className="underline font-semibold hover:opacity-80 ml-2 shrink-0"
                  >
                    Attach contexts
                  </button>
                </div>
              )}

              {genSuccessMsg && (
                <div className="rounded-2xl bg-success/10 border border-success/30 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-success">
                    <Sparkles className="h-5 w-5" />
                    {genSuccessMsg}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Deck currently has{" "}
                    <strong className="text-foreground">{deck.flashcards?.length || 0} flashcards</strong> and{" "}
                    <strong className="text-foreground">{deck.quizzes?.length || 0} quiz questions</strong>.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setActiveTab("flashcards")}
                      className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                    >
                      <Layers className="h-3.5 w-3.5" /> View Flashcards ({deck.flashcards?.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("quizzes")}
                      className="flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-muted"
                    >
                      <HelpCircle className="h-3.5 w-3.5" /> View Quiz ({deck.quizzes?.length || 0})
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">What to Generate</label>
                  <div className="grid grid-cols-3 gap-2 mt-1.5">
                    {[
                      { key: "both", label: "Both (Cards + Quiz)" },
                      { key: "flashcards", label: "Flashcards Only" },
                      { key: "quiz", label: "Quiz Only" },
                    ].map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => setGenMode(m.key as any)}
                        className={`rounded-xl border p-2.5 text-xs font-semibold transition ${
                          genMode === m.key
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border bg-card text-foreground hover:bg-muted"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Items Count: <span className="text-foreground font-bold">{genCount}</span>
                  </label>
                  <input
                    type="range"
                    min={3}
                    max={15}
                    value={genCount}
                    onChange={(e) => setGenCount(Number(e.target.value))}
                    className="w-full mt-2"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>3 items</span>
                    <span>5 items</span>
                    <span>10 items</span>
                    <span>15 items</span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted-foreground">
                    Special Focus or Prompt (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={genPrompt}
                    onChange={(e) => setGenPrompt(e.target.value)}
                    placeholder="e.g. Focus on complex mechanisms, common pitfalls, definitions, and high-yield test points..."
                    className="mt-1.5 w-full rounded-xl border border-border bg-card p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="w-full rounded-2xl bg-gradient-primary py-3 text-sm font-bold text-primary-foreground shadow-elevated transition hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  {generating ? "Synthesizing with GroqCloud Qwen 27B..." : "Generate Content"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

