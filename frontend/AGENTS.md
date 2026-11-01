# Mneme Frontend Architecture & Guidelines

- **Services**: Real backend API integration hooks reside in `src/services/mneme.ts`.
- **Routing**: Each study view has its own route wrapped in `AppShell` (`src/components/mneme/AppShell.tsx`):
  - `/` - Main Dashboard & PDF ingestion
  - `/flashcards` - 3D Active recall swipe cards
  - `/quiz` - Multiple-choice diagnostic quiz
  - `/blurt` - Blurt mode recall auditing
- **Chat Drawer**: The Feynman Tutor is implemented as an interactive drawer inside `AppShell`, accessible across all routes.
- **Styling**: Tailwind CSS with custom design tokens defined in `src/styles.css`.
