# TickTick AI Accountability Partner

An AI-powered Telegram bot that connects to TickTick and acts as a proactive accountability partner using Gemini AI to analyze, reorganize, and manage tasks.

## Project Overview

*   **Technologies:** Node.js (ESM), Express, Grammy (Telegram Bot Framework), Gemini AI (via `@google/generative-ai` and `@ax-llm/ax`), Redis (ioredis), node-cron.
*   **Core Purpose:** Automates task management by parsing natural language intents from Telegram, normalizing them into structured TickTick operations, and applying them via a dedicated adapter.
*   **Architecture:**
    *   **Bot Layer:** Handles Telegram commands (`/scan`, `/briefing`, `/reorg`, etc.) and free-form messages.
    *   **Pipeline Layer:** Orchestrates `Intent Extraction (AX)` -> `Normalization` -> `Execution (Adapter)`.
    *   **Service Layer:** Interfaces with Gemini AI, TickTick API, and persistence (Redis/File).

## Building and Running

### Prerequisites
*   Node.js 18+
*   TickTick Developer App credentials
*   Gemini API Key
*   Telegram Bot Token

### Setup
```bash
npm install
cp .env.example .env
cp services/user_context.example.js services/user_context.js
```

### Running
*   **Development:** `npm run dev` (uses `--watch`)
*   **Production:** `npm start`
*   **Authorization:** Visit `http://localhost:8080` after starting to link your TickTick account via OAuth.

## Development Conventions

### Custom Framework: Spec Kitty
The project uses a custom agent-driven development framework located in `.kittify/` and `kitty-specs/`.

*   **Mandatory Rules:**
    1.  **Path Reference Rule:** Always use absolute paths or paths relative to the project root (e.g., `kitty-specs/001-feature/spec.md`).
    2.  **UTF-8 Encoding Rule:** Use ONLY UTF-8 compatible characters. Avoid Windows-1252 smart quotes, en/em dashes, and special symbols (use `->` for arrows, `+/-` for plus-minus).
    3.  **Context Management:** Read `plan.md` and `tasks.md` in `kitty-specs/` before starting feature work.
    4.  **Git Discipline:** Never commit agent directories (`.claude/`, `.gemini/`, `.codex/`) or secrets.

### Implementation Patterns
*   **Deterministic Normalization:** All AI outputs from `ax-intent.js` MUST pass through `normalizer.js` to ensure clean titles, suppressed noise, and resolved project IDs.
*   **Adapter Pattern:** All TickTick API calls MUST flow through `services/ticktick-adapter.js`. Do not call the low-level client directly in bot commands or other services.
*   **Error Handling:** Use the `QuotaExhaustedError` for AI key rotation and ensure the pipeline handles TickTick API unavailability gracefully (FR-016).

## Project Structure
*   `server.js`: Main entry point and Express server.
*   `bot/`: Telegram bot logic, command registration, and callback handlers.
*   `services/`: Core business logic (AI, TickTick, Persistence, Pipeline).
*   `kitty-specs/`: Feature specifications, implementation plans, and task breakdowns.
*   `.kittify/`: Configuration and templates for the Spec Kitty agent framework.
*   `tests/`: Regression and E2E tests.
