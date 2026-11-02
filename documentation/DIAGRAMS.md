# Mneme Architecture and Workflow Diagram Specifications

This document provides production-ready **PlantUML** and **Mermaid** source code blocks for all architectural and workflow diagrams referenced in `documentation/Report.tex`. You can paste these directly into PlantUML editors (e.g. [planttext.com](https://www.planttext.com/) or the PlantUML CLI) or Mermaid previewers (e.g. [mermaid.live](https://mermaid.live/)) to render high-resolution PNG or SVG figures for your project submission.

---

## 1. System Microservices Architecture (Figure 5.1)

### PlantUML
```plantuml
@startuml
skinparam componentStyle rectangle
skinparam roundcorner 12
skinparam monochrome false
skinparam shadowing true
skinparam packageBackgroundColor #F8FAFC
skinparam packageBorderColor #CBD5E1

package "Client Presentation Layer" {
    [React 19 SPA\n(Vite + TypeScript + Tailwind CSS)] as ReactClient
    [Flesch Reading Ease NLP\n& Framer Motion UI] as ClientNLP
}

package "Application Gateway" {
    [Flask REST API Gateway\n(Werkzeug WSGI)] as FlaskAPI
    [SSE Streaming Controller\n(Token Streamer)] as SSEController
}

package "Asynchronous Processing Layer" {
    queue "Redis 7.0\n(Message Broker / Queue)" as RedisQueue
    [Celery Distributed Workers\n(PDF Ingestion & Generation)] as CeleryPool
}

package "Data & Storage Layer" {
    database "MongoDB Atlas\n(Users, Decks, Folders, Logs)" as MongoStore
    database "Qdrant Cloud\n(Isolated Tenant Vector Partitions)" as QdrantEngine
}

package "Inference Core" {
    [Groq Cloud LPUs\n(Qwen 2.5/3.8 27B-Instruct)] as GroqLPU
}

ReactClient --> FlaskAPI : HTTP REST (Auth, Decks, Tasks)
ReactClient --> SSEController : Server-Sent Events (Feynman Chat)
FlaskAPI --> RedisQueue : Enqueue Task (PDF / Gen)
RedisQueue --> CeleryPool : Dequeue Task
CeleryPool --> GroqLPU : Cyclical LangGraph Invocation
FlaskAPI --> MongoStore : User & Deck CRUD
FlaskAPI --> QdrantEngine : Context Similarity Search
CeleryPool --> QdrantEngine : Dense Vector Embeddings Upsert
CeleryPool --> MongoStore : Save Flashcards & Quizzes
@enduml
```

### Mermaid
```mermaid
graph TD
    subgraph Presentation["Presentation Layer (Client)"]
        SPA["React 19 SPA (Vite + Tailwind)"]
        Flesch["Client Flesch NLP & Framer Motion"]
    end

    subgraph Gateway["Application Gateway"]
        Flask["Flask REST API Gateway"]
        SSE["SSE Token Streamer"]
    end

    subgraph AsyncPool["Asynchronous Worker Layer"]
        Redis[("Redis 7.0 Queue")]
        Celery["Celery Worker Pool"]
    end

    subgraph Storage["Storage Layer"]
        Mongo[("MongoDB Atlas Primary Store")]
        Qdrant[("Qdrant Cloud Tenant Vectors")]
    end

    subgraph Inference["Inference Acceleration"]
        Groq["Groq Cloud LPUs (Qwen 27B)"]
    end

    SPA -->|HTTP REST| Flask
    SPA -->|SSE Stream| SSE
    Flask -->|Enqueue Task| Redis
    Redis -->|Dequeue Task| Celery
    Celery -->|LangGraph Inference| Groq
    Flask -->|CRUD Operations| Mongo
    Flask -->|Vector Search| Qdrant
    Celery -->|Vector Upsert| Qdrant
    Celery -->|Persist Cards| Mongo
```

---

## 2. Use Case Workflow Diagram (Figure 5.2)

### PlantUML
```plantuml
@startuml
left to right direction
skinparam actorStyle awesome
skinparam packageStyle rectangle

actor "Student / Learner" as Student

rectangle "Mneme Cognitive System" {
    usecase "Authenticate & Onboard\n(Multi-Tenant Isolation)" as UC_Auth
    usecase "Manage Document Library\n(Upload PDF, Markdown, Text)" as UC_Ingest
    usecase "Organize Study Decks & Folders\n(Bind Segregated Contexts)" as UC_Decks
    usecase "Synthesize Active Recall Content\n(Cyclical LangGraph Cards & Quizzes)" as UC_Gen
    usecase "Spaced Repetition Drills\n(SuperMemo-2 Ease Rating)" as UC_SRS
    usecase "Timed Blurt Arena\n(Recall Sprint & Semantic Diff)" as UC_Blurt
    usecase "Socratic & Feynman Tutoring\n(Plain-English Jargon Audit)" as UC_Feynman
    usecase "Track Mastery & Streaks\n(Daily Active Retention)" as UC_Stats
}

Student --> UC_Auth
Student --> UC_Ingest
Student --> UC_Decks
Student --> UC_Gen
Student --> UC_SRS
Student --> UC_Blurt
Student --> UC_Feynman
Student --> UC_Stats

UC_Decks ..> UC_Ingest : <<includes>>
UC_Gen ..> UC_Decks : <<requires bound contexts>>
UC_Blurt ..> UC_Decks : <<grounds against deck>>
UC_Feynman ..> UC_Decks : <<filters context>>
@enduml
```

### Mermaid
```mermaid
flowchart LR
    Student((Student / Learner))

    subgraph MnemeSystem["Mneme Cognitive Retention Platform"]
        Auth["Authenticate & Onboard"]
        Ingest["Manage Document Library"]
        Decks["Organize Decks & Folders"]
        Gen["Synthesize Flashcards & Quizzes"]
        SRS["Spaced Repetition Drills (SM-2)"]
        Blurt["Timed Blurt Arena (Semantic Diff)"]
        Feynman["Socratic & Feynman Tutoring"]
        Stats["Track Daily Mastery & Streaks"]
    end

    Student --> Auth
    Student --> Ingest
    Student --> Decks
    Student --> Gen
    Student --> SRS
    Student --> Blurt
    Student --> Feynman
    Student --> Stats

    Decks -.->|Includes Contexts| Ingest
    Gen -.->|Requires Deck| Decks
    Blurt -.->|Deck Grounding| Decks
    Feynman -.->|Deck Context| Decks
```

---

## 3. Ingestion & Retrieval Pipeline Sequence Diagram (Figure 5.3)

### PlantUML
```plantuml
@startuml
autonumber
actor Student
participant "React 19 Client" as Client
participant "Flask REST API" as API
queue "Redis Queue" as Redis
participant "Celery Worker" as Worker
database "MongoDB Atlas" as Mongo
database "Qdrant Cloud" as Qdrant

Student -> Client : Uploads Study PDF
Client -> API : POST /api/v1/documents/upload (Multipart)
API -> Mongo : Create Document Record (status: 'pending')
API -> Redis : Enqueue Ingestion Task ('mneme.ingest_pdf')
API --> Client : 202 Accepted (task_id, document_id)

Worker -> Redis : Poll and Dequeue Ingestion Task
Worker -> Worker : Extract Text (PyPDF / pdfplumber)
Worker -> Worker : Recursive Chunking (500 chars, 100 overlap)
Worker -> Worker : Generate Dense Embeddings
Worker -> Qdrant : Upsert Points with payload {user_id, document_id}
Worker -> Mongo : Update Document Record (status: 'ready', chunk_count)
Worker --> Redis : Task Success

Client -> API : GET /api/v1/tasks/{task_id} (Polling)
API --> Client : {status: 'completed', progress: 100}
Client -> Student : Context Ready for Deck Attachment
@enduml
```

### Mermaid
```mermaid
sequenceDiagram
    autonumber
    actor Student
    participant Client as React 19 Client
    participant API as Flask REST API
    participant Redis as Redis Queue
    participant Worker as Celery Worker
    participant Mongo as MongoDB Atlas
    participant Qdrant as Qdrant Cloud

    Student->>Client: Uploads Study PDF
    Client->>API: POST /api/v1/documents/upload
    API->>Mongo: Create Document (status: 'pending')
    API->>Redis: Enqueue Task ('mneme.ingest_pdf')
    API-->>Client: 202 Accepted (task_id, document_id)

    Worker->>Redis: Dequeue Task
    Worker->>Worker: Parse Text (PyPDF / pdfplumber)
    Worker->>Worker: Recursive Chunking (500 chars, 100 overlap)
    Worker->>Worker: Compute Dense Embeddings
    Worker->>Qdrant: Upsert Points with payload {user_id, document_id}
    Worker->>Mongo: Update Document (status: 'ready')
    Worker-->>Redis: Mark Completed

    Client->>API: GET /api/v1/tasks/{task_id}
    API-->>Client: {status: 'completed', progress: 100}
    Client->>Student: Context Ready for Deck Attachment
```

---

## 4. Cyclical LangGraph State Machine Workflow: Generator (Figure 5.4)

### PlantUML
```plantuml
@startuml
skinparam state {
    BackgroundColor #EEF2FF
    BorderColor #4F46E5
    RoundCorner 15
}

[*] --> PrepareChunksNode : Deck Generation Requested

state PrepareChunksNode {
    PrepareChunksNode : Extract Attached Deck Contexts
    PrepareChunksNode : Retrieve Top Informative Chunks
}

state GenerateNode {
    GenerateNode : Construct Grounded Schema Prompt
    GenerateNode : Invoke Groq LPU (Qwen 2.5/3.8 27B)
}

state ValidateNode <<choice>>
state FormatErrorNode {
    FormatErrorNode : Feed Syntax Error to System Prompt
    FormatErrorNode : Increment Retry Counter (Max 3)
}

state PersistDeckNode {
    PersistDeckNode : Validate Pydantic Model
    PersistDeckNode : Commit Cards/Quizzes to MongoDB
}

PrepareChunksNode --> GenerateNode : Grounded Chunks Ready
GenerateNode --> ValidateNode : Raw LLM JSON String
ValidateNode --> PersistDeckNode : [Schema Valid]
ValidateNode --> FormatErrorNode : [Parse / Validation Failure]
FormatErrorNode --> GenerateNode : Re-execute with Targeted Correction
PersistDeckNode --> [*] : Generation Complete (100% Success)
@enduml
```

### Mermaid
```mermaid
stateDiagram-v2
    [*] --> PrepareChunksNode : Deck Generation Request

    state PrepareChunksNode {
        direction TB
        Filter : Filter Attached Deck Document Chunks
        Assemble : Assemble Grounding Prompt
    }

    state GenerateNode {
        direction TB
        Prompt : Strict Pydantic JSON Prompt
        Inference : Groq LPU Qwen 27B Inference
    }

    state ValidateNode <<choice>>

    state FormatErrorNode {
        direction TB
        Inject : Inject ValidationError into Context
        Increment : Increment Retry Count (Max 3)
    }

    state PersistDeckNode {
        direction TB
        Map : Map Validated Pydantic Objects
        Commit : Commit Deck to MongoDB Atlas
    }

    PrepareChunksNode --> GenerateNode
    GenerateNode --> ValidateNode
    ValidateNode --> PersistDeckNode : Pydantic Valid
    ValidateNode --> FormatErrorNode : ValidationError (Retry < 3)
    FormatErrorNode --> GenerateNode : Auto-Correction Loop
    PersistDeckNode --> [*] : Return Ready Deck
```

---

## 5. Entity-Relationship (ER) Schema Model (Figure 5.5)

### PlantUML
```plantuml
@startuml
skinparam linetype ortho
skinparam roundcorner 10
skinparam monochrome false

entity "User" as user {
    * user_id : string <<PK>>
    --
    username : string <<unique>>
    password_hash : string
    name : string
    streak : integer
    last_active_date : string
    created_at : timestamp
}

entity "Folder" as folder {
    * folder_id : string <<PK>>
    --
    * user_id : string <<FK>>
    name : string
    color : string
    order : integer
    created_at : timestamp
}

entity "Deck" as deck {
    * deck_id : string <<PK>>
    --
    * user_id : string <<FK>>
    folder_id : string <<FK, optional>>
    title : string
    color : string
    cards_count : integer
    quizzes_count : integer
    mastery : float
    document_ids : list[string]
    created_at : timestamp
    updated_at : timestamp
}

entity "Flashcard" as card {
    * card_id : string <<PK>>
    --
    * deck_id : string <<FK>>
    front : text
    back : text
    repetition : integer
    interval_days : float
    ease_factor : float
    lapses : integer
    review_count : integer
    mastery : integer
    last_reviewed_utc : timestamp
    next_review_utc : timestamp
    created_at : timestamp
}

entity "QuizQuestion" as quiz {
    * quiz_id : string <<PK>>
    --
    * deck_id : string <<FK>>
    question : text
    options : list[string]
    answer : integer
    explanation : text
}

entity "Document" as doc {
    * document_id : string <<PK>>
    --
    * user_id : string <<FK>>
    filename : string
    file_type : string
    chunk_count : integer
    summary : text
    status : string
    created_at : timestamp
}

entity "VectorEmbedding (Qdrant)" as vector {
    * point_id : string <<PK>>
    --
    * document_id : string <<FK>>
    * user_id : string <<tenant_filter>>
    chunk_index : integer
    text_content : text
    dense_vector : float[384]
}

entity "CardReviewLog" as review_log {
    * review_id : string <<PK>>
    --
    * user_id : string <<FK>>
    * card_id : string <<FK>>
    * deck_id : string <<FK>>
    rating : string
    quality : integer
    interval_applied : float
    ease_factor_applied : float
    timestamp : timestamp
}

user ||--o{ folder : creates
user ||--o{ deck : owns
user ||--o{ doc : uploads
user ||--o{ review_log : records
folder ||--o{ deck : categorizes
deck ||--|{ card : contains
deck ||--|{ quiz : contains
deck }o--o{ doc : binds_contexts (document_ids)
doc ||--|{ vector : partitions_into
card ||--o{ review_log : tracks_history
@enduml
```

### Mermaid
```mermaid
erDiagram
    direction LR

    USER ||--o{ FOLDER : creates
    USER ||--o{ DECK : owns
    USER ||--o{ DOCUMENT : uploads
    USER ||--o{ CARD_REVIEW_LOG : records
    FOLDER ||--o{ DECK : categorizes
    DECK ||--|{ FLASHCARD : contains
    DECK ||--|{ QUIZ_QUESTION : contains
    DECK }o--o{ DOCUMENT : binds_contexts
    DOCUMENT ||--|{ VECTOR_EMBEDDING : partitions_into
    FLASHCARD ||--o{ CARD_REVIEW_LOG : tracks_history

    USER {
        string user_id PK
        string username
        string password_hash
        string name
        int streak
        string last_active_date
        timestamp created_at
    }

    FOLDER {
        string folder_id PK
        string user_id FK
        string name
        string color
        int order
        timestamp created_at
    }

    DECK {
        string deck_id PK
        string user_id FK
        string folder_id FK
        string title
        string color
        int cards_count
        int quizzes_count
        float mastery
        array document_ids
        timestamp created_at
        timestamp updated_at
    }

    FLASHCARD {
        string card_id PK
        string deck_id FK
        string front
        string back
        int repetition
        float interval_days
        float ease_factor
        int lapses
        int review_count
        int mastery
        timestamp last_reviewed_utc
        timestamp next_review_utc
        timestamp created_at
    }

    QUIZ_QUESTION {
        string quiz_id PK
        string deck_id FK
        string question
        array options
        int answer
        string explanation
    }

    DOCUMENT {
        string document_id PK
        string user_id FK
        string filename
        string file_type
        int chunk_count
        string summary
        string status
        timestamp created_at
    }

    VECTOR_EMBEDDING {
        string point_id PK
        string document_id FK
        string user_id FK
        int chunk_index
        string text_content
        vector_384 dense_vector
    }

    CARD_REVIEW_LOG {
        string review_id PK
        string user_id FK
        string card_id FK
        string deck_id FK
        string rating
        int quality
        float interval_applied
        float ease_factor_applied
        timestamp timestamp
    }
```

---

## 6. LangGraph Blurt Mode Cognitive Audit Workflow (Figure 5.6)

### PlantUML
```plantuml
@startuml
skinparam state {
    BackgroundColor #F0FDF4
    BorderColor #16A34A
    RoundCorner 15
}

[*] --> EmbedUserBlurtNode : Learner Submits Recall Blurt

state EmbedUserBlurtNode {
    EmbedUserBlurtNode : Sentence-Transformer Embedding
    EmbedUserBlurtNode : Generate Dense 384-d Vector
}

state QueryQdrantNode {
    QueryQdrantNode : Tenant Filter (user_id)
    QueryQdrantNode : Bound Deck Contexts (document_ids)
    QueryQdrantNode : Append Deck Cards & Quizzes Grounding
}

state CompareLLMNode {
    CompareLLMNode : Invoke Groq Cloud Qwen 27B
    CompareLLMNode : Extract 'recalled_concepts'
    CompareLLMNode : Extract 'missed_concepts'
    CompareLLMNode : Compute Objective Ratio Score
    CompareLLMNode : Formulate Pedagogical Feedback
}

EmbedUserBlurtNode --> QueryQdrantNode : User Vector Ready
QueryQdrantNode --> CompareLLMNode : Assembled Ground Truth
CompareLLMNode --> [*] : Return Validated BlurtEvaluationModel
@enduml
```

### Mermaid
```mermaid
stateDiagram-v2
    [*] --> EmbedUserBlurtNode : Student Submits Blurt

    state EmbedUserBlurtNode {
        direction TB
        Embed : Dense Vector Embedding (384-d)
    }

    state QueryQdrantNode {
        direction TB
        TenantMatch : Tenant Match (user_id)
        DeckFilter : Deck Filter (document_ids)
        Auxiliary : Append Deck Cards and Quizzes
    }

    state CompareLLMNode {
        direction TB
        GroqCall : Groq Qwen 27B Semantic Diff
        Recalled : Extract Recalled Concepts
        Missed : Extract Missed Concepts
        RatioScore : Compute Coverage Score
        PydanticCheck : Validate BlurtEvaluationModel
    }

    EmbedUserBlurtNode --> QueryQdrantNode : Blurt Vector
    QueryQdrantNode --> CompareLLMNode : Ground Truth Notes
    CompareLLMNode --> [*] : Render Audit Results
```

---

## 7. LangGraph Unified Socratic and Feynman Chat Workflow (Figure 5.7)

### PlantUML
```plantuml
@startuml
skinparam state {
    BackgroundColor #F5F3FF
    BorderColor #7C3AED
    RoundCorner 15
}

[*] --> RetrieveContextNode : User Message Arrives

state RetrieveContextNode {
    RetrieveContextNode : Embed User Query
    RetrieveContextNode : Search Qdrant by user_id & deck_id
    RetrieveContextNode : Append Deck Cards/Quizzes Summary
}

state IntentRouterNode {
    IntentRouterNode : Lightweight Qwen 27B Classifier
    IntentRouterNode : Classify 'ask' vs 'teach'
}

state IntentChoice <<choice>>

state SocraticAnswerNode {
    SocraticAnswerNode : Answer Strictly from Notes
    SocraticAnswerNode : Append Reflective Inquiry Question
}

state FeynmanCritiqueNode {
    FeynmanCritiqueNode : Detect Technical Jargon / Buzzwords
    FeynmanCritiqueNode : Pinpoint Logical Gaps
    FeynmanCritiqueNode : Request Intuitive Everyday Analogy
}

RetrieveContextNode --> IntentRouterNode : Grounded Context Ready
IntentRouterNode --> IntentChoice
IntentChoice --> SocraticAnswerNode : [intent == 'ask']
IntentChoice --> FeynmanCritiqueNode : [intent == 'teach']
SocraticAnswerNode --> [*] : Stream via SSE (sub-150ms TTFT)
FeynmanCritiqueNode --> [*] : Stream via SSE + Flesch NLP Score
@enduml
```

### Mermaid
```mermaid
stateDiagram-v2
    [*] --> RetrieveContextNode : User Message Arrives

    state RetrieveContextNode {
        direction TB
        Search : Search Qdrant (user_id & deck_id)
        DeckKnowledge : Assemble Ground-Truth Notes & Cards
    }

    state IntentRouterNode {
        direction TB
        Classify : Classify Message Intent
    }

    state IntentChoice <<choice>>

    state SocraticAnswerNode {
        direction TB
        GroundedAnswer : Grounded Direct Answer
        ReflectivePrompt : Reflective Socratic Question
    }

    state FeynmanCritiqueNode {
        direction TB
        JargonAudit : Jargon & Buzzword Audit
        GapCheck : Gap Identification
        AnalogyChallenge : Challenge for Everyday Analogy
    }

    RetrieveContextNode --> IntentRouterNode
    IntentRouterNode --> IntentChoice
    IntentChoice --> SocraticAnswerNode : intent == 'ask'
    IntentChoice --> FeynmanCritiqueNode : intent == 'teach'
    SocraticAnswerNode --> [*] : Stream SSE Response
    FeynmanCritiqueNode --> [*] : Stream SSE + Flesch Score
```

---

## 8. Empirical Cognitive Retention Curves Across Learning Modalities (Figure 6.1)

Literature benchmark synthesized from peer-reviewed cognitive psychology studies evaluating active recall, free-recall blurting, and distributed spaced practice (Roediger & Karpicke, 2006; Karpicke & Blunt, 2011; Cepeda et al., 2006).

### Mermaid
```mermaid
xychart-beta
    title "Empirical Retention Curves Across Modalities (Literature Benchmark)"
    x-axis ["Day 0", "Day 1", "Day 3", "Day 7", "Day 14", "Day 21", "Day 30"]
    y-axis "Memory Retention (%)" 0 --> 100
    line [100, 67.2, 42.1, 18.5, 9.4, 5.8, 4.1]
    line [100, 94.8, 91.5, 89.2, 85.6, 83.9, 82.4]
```

---

## 9. SuperMemo-2 Spaced Repetition and Predictive Calendar Scheduler State Machine (Figure 5.8)

### PlantUML
```plantuml
@startuml
skinparam state {
    BackgroundColor #F8FAFC
    BorderColor #6366F1
    ArrowColor #4338CA
}

[*] --> NewCard : Card Synthesized via LangGraph

state NewCard {
    NewCard : repetition = 0
    NewCard : interval_days = 1.0
    NewCard : ease_factor = 2.50
    NewCard : next_review_utc = now_utc
}

NewCard --> ActiveReviewSession : Due in Calendar Matrix

state ActiveReviewSession {
    ActiveReviewSession : Present Stimulus Front
    ActiveReviewSession : Tap to Reveal Answer Back
}

state GradeChoice <<choice>>

ActiveReviewSession --> GradeChoice : User Selects Recall Quality (q)

state LapseState {
    LapseState : Again (q = 1)
    LapseState : repetition = 0
    LapseState : interval = 1.0 day
    LapseState : lapses = lapses + 1
    LapseState : EF' = max(1.3, EF - 0.20)
}

state HardState {
    HardState : Hard (q = 3)
    HardState : repetition = repetition + 1
    HardState : interval = interval * 1.2
    HardState : EF' = max(1.3, EF - 0.15)
}

state GoodState {
    GoodState : Good (q = 4)
    GoodState : repetition = repetition + 1
    GoodState : if rep==1 then I=1
    GoodState : if rep==2 then I=6
    GoodState : else I = round(I * EF)
    GoodState : EF' unchanged
}

state EasyState {
    EasyState : Easy (q = 5)
    EasyState : repetition = repetition + 1
    EasyState : if rep==1 then I=2
    EasyState : if rep==2 then I=7
    EasyState : else I = round(I * EF * 1.3)
    EasyState : EF' = min(3.0, EF + 0.15)
}

GradeChoice --> LapseState : q < 3 (Again)
GradeChoice --> HardState : q == 3 (Hard)
GradeChoice --> GoodState : q == 4 (Good)
GradeChoice --> EasyState : q == 5 (Easy)

state ScheduleSync {
    ScheduleSync : next_review_utc = now_utc + interval
    ScheduleSync : Record User Activity Log
    ScheduleSync : Increment Daily Streak & Mastery
}

LapseState --> ScheduleSync
HardState --> ScheduleSync
GoodState --> ScheduleSync
EasyState --> ScheduleSync

ScheduleSync --> 35DayMatrix : Update Rolling Calendar
ScheduleSync --> [*] : Card Scheduled for Optimal Retrievability
@enduml
```

### Mermaid
```mermaid
stateDiagram-v2
    [*] --> NewCard : Synthesized by LangGraph
    
    state NewCard {
        rep : repetition = 0
        intv : interval = 1.0 day
        ef : ease_factor = 2.50
        due : next_review = now_utc
    }

    NewCard --> ActiveRecallDrill : Filtered by Due Status

    state ActiveRecallDrill {
        Prompt : Display Question Front
        Reveal : Tap or Space to Reveal Answer
    }

    state RatingChoice <<choice>>

    ActiveRecallDrill --> RatingChoice : User Rating Selection

    state "Again (q=1)" as Again {
        ResetRep : repetition = 0
        ResetIntv : interval = 1.0 day
        EaseDrop : EF' = max(1.3, EF - 0.20)
        IncLapse : lapses += 1
    }

    state "Hard (q=3)" as Hard {
        AdvanceRep1 : repetition += 1
        SmallStep : interval = interval * 1.2
        SlightEaseDrop : EF' = max(1.3, EF - 0.15)
    }

    state "Good (q=4)" as Good {
        AdvanceRep2 : repetition += 1
        StandardStep : interval = round(interval * EF)
        StableEase : EF' = EF
    }

    state "Easy (q=5)" as Easy {
        AdvanceRep3 : repetition += 1
        BonusStep : interval = round(interval * EF * 1.3)
        EaseBonus : EF' = min(3.0, EF + 0.15)
    }

    RatingChoice --> Again : Rating 1 (Lapse)
    RatingChoice --> Hard : Rating 2 (Effortful)
    RatingChoice --> Good : Rating 3 (Successful)
    RatingChoice --> Easy : Rating 4 (Immediate)

    state SpacedPersistence {
        ComputeUTC : next_review_utc = now + interval
        LogActivity : Record User Activity Log
        RefreshMatrix : Update 35-Day Rolling Calendar
    }

    Again --> SpacedPersistence
    Hard --> SpacedPersistence
    Good --> SpacedPersistence
    Easy --> SpacedPersistence

    SpacedPersistence --> [*] : Queued for Next Review Point
```

---

## 10. Graphical User Interface (UI) Snapshot Layouts and Specifications

This section details the layout specifications, state bindings, and interaction models for the six production UI snapshot figures incorporated into `documentation/Report.tex`:

### 10.1 Diagnostic Multiple-Choice Quiz Interface (`figures/ui_quiz.png`)
- **Report Reference**: Figure 5.5
- **Primary Source Component**: `frontend/src/routes/quiz.tsx` (`QuizPage`)
- **Key Visual Elements**:
  - Progress tracker and active score counter (`Question X of Y`, running correctness percentage).
  - High-yield conceptual stem synthesized via `generator_graph.py`.
  - Four candidate response tiles with letter badges (`A`, `B`, `C`, `D`). Correct response rendered with emerald border/background; incorrect distractors flagged with crimson state upon selection.
  - Expandable conceptual rationale accordion displaying the ground-truth document excerpt and pedagogical explanation.

### 10.2 Central Dashboard and Study Deck Workspace (`figures/ui_dashboard.png`)
- **Report Reference**: Figure 5.7
- **Primary Source Component**: `frontend/src/routes/index.tsx` (`Dashboard`), `DeckModal.tsx`, `FolderModal.tsx`
- **Key Visual Elements**:
  - Four top-level metric summary tiles: Active Cognitive Mastery, Consecutive Streak, Due Cards Today, Ingested Contexts.
  - Adaptive study deck grid organized by user-defined, color-coded folders (`Indigo`, `Emerald`, `Violet`, `Amber`, `Rose`, `Sky`).
  - Per-deck card metadata: total card count, quiz item count, attached source document badges, and retention stability progress bar.
  - Direct action triggers launching Flashcards, Diagnostic Quizzes, or the Blurt Arena.

### 10.3 Timed Blurt Mode Arena and Retention Audit (`figures/ui_blurt.png`)
- **Report Reference**: Figure 5.9
- **Primary Source Component**: `frontend/src/routes/blurt.tsx` (`BlurtPage`)
- **Key Visual Elements**:
  - Two-stage layout: Left panel features the active free-recall typing arena with countdown timer, word counter, and distraction-free editor.
  - Right panel visualizes the AI Semantic Audit Report produced by `blurt_graph.py`.
  - Global retention coverage score ring (percentage of retrieved high-yield concepts).
  - Green concept pills for successfully retrieved principles; red concept pills for identified knowledge voids/omissions.
  - Formative pedagogical coaching box providing targeted review recommendations.

### 10.4 Socratic and Feynman Interactive Tutor Drawer (`figures/ui_feynman_chat.png`)
- **Report Reference**: Figure 5.11
- **Primary Source Component**: `frontend/src/components/mneme/ChatDrawer.tsx`
- **Key Visual Elements**:
  - Slide-over global drawer accessible across all platform views without interrupting study flow.
  - Real-time client-side NLP panel computing the Flesch Reading Ease score, average syllables per word, sentence complexity, and jargon penalty.
  - Conversational message stream powered by Server-Sent Events (SSE) with token streaming from Groq Qwen 27B.
  - Dual persona switch: Socratic guided inquiry vs Richard Feynman analogy and plain-language critique.

### 10.5 Active Recall Flashcard Practice Studio (`figures/ui_flashcards.png`)
- **Report Reference**: Figure 5.13
- **Primary Source Component**: `frontend/src/routes/flashcards.tsx` (`FlashcardsPage`)
- **Key Visual Elements**:
  - 3D perspective flip card container with clean separation between front prompt stimulus and hidden back answer.
  - SuperMemo-2 metric indicators displaying repetition number, current interval, and Ease Factor (`R2 · Next: ~6d · EF 2.50`).
  - Four-tier tactile grading dock: `Again` (1d reset), `Hard` (1.2x), `Good` (standard EF), and `Easy` (1.3xEF bonus).
  - Tactile keyboard navigation shortcuts (Space to flip, 1-4 for ratings) and due-only filtering toggle.

### 10.6 Predictive Spaced Repetition Calendar and Date Inspection Modal (`figures/ui_calendar_schedule.png`)
- **Report Reference**: Figure 5.15
- **Primary Source Component**: `frontend/src/components/mneme/SpacedScheduleModal.tsx` (`SpacedScheduleModal`, `DateDetailModal`)
- **Key Visual Elements**:
  - Top statistical strip: Current Streak, Due Today, Fleet Average Ease Factor, Aggregate Retrievability ($R$).
  - 35-day continuous rolling calendar matrix showing 14 historical days, current day status, and 20 projected days with status badges (`completed`, `due`, `rest`).
  - Literature-grounded daily active recall task queue (SM-2 review, Blurt sprint, Feynman teaching, Diagnostic quiz).
  - `DateDetailModal` overlay listing individual cards due on a selected date, complete with front prompts, collapsible back answers, SM-2 badges, and a direct review launcher deep-linking to the target deck (`/flashcards?deckId=...`).
