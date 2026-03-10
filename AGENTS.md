# Repository Guidelines

## Project Structure & Module Organization
- `server.js` boots Express, the Telegram bot, the scheduler, and TickTick/Gemini clients.
- `bot/` contains Telegram-facing behavior: `commands.js`, `callbacks.js`, and formatting helpers in `utils.js`.
- `services/` contains core logic and integrations. Keep task execution in `ticktick-adapter.js`, normalization in `normalizer.js`, and orchestration in `pipeline.js`.
- `tests/` holds regression and end-to-end scripts. `kitty-specs/001-task-operations-pipeline/` stores the active spec, plan, and work-package notes.
- Deployment files live at the root: `Dockerfile` and `render.yaml`. Local context starts from `services/user_context.example.js`.

## Build, Test, and Development Commands
- `npm install` installs dependencies from `package-lock.json`.
- `npm start` runs the production entrypoint with `node server.js`.
- `npm run dev` starts watch mode for local iteration.
- `node tests/run-regression-tests.mjs` runs the lightweight regression suite used in this repo today.
- `node --test tests/regression.test.js` runs the Node test file when your environment allows spawned subprocesses.
- `docker build -t ticktick-gemini .` builds the same container shape used for Render.

## Coding Style & Naming Conventions
- Use ESM only: `import`/`export`, not CommonJS.
- Follow the existing style: 4-space indentation, semicolons, camelCase for variables/functions, PascalCase for classes.
- Keep files single-purpose: Telegram interaction in `bot/`, integrations and orchestration in `services/`.
- Prefer named exports for helpers and service factories.
- New task-writing flows must stay on the existing path: `AX intent -> normalizer -> ticktick-adapter`. Do not call the low-level TickTick client directly from bot handlers.

## Testing Guidelines
- Add or update regression coverage for behavior changes in `tests/regression.test.js` or `tests/run-regression-tests.mjs`.
- Name tests by behavior, for example: `executeActions accepts suggested_schedule update alias`.
- Mock TickTick and Gemini integrations in automated tests; keep live API calls in opt-in scripts only.

## Commit & Pull Request Guidelines
- Match the existing Conventional Commit pattern from history: `feat: ...`, `chore: ...`, `feat(scope): ...`.
- Keep each commit focused to one behavior change or one work package.
- PRs should include a short behavior summary, any new env vars, linked issue or `kitty-specs/...` reference, and sample Telegram output or screenshots when message formatting changes.

## Security & Configuration Tips
- Never commit `.env`, `services/user_context.js`, OAuth tokens, Telegram chat IDs, or Redis credentials.
- Start local setup from `.env.example` and `services/user_context.example.js`.
- When adding a required environment variable, update both `README.md` and `render.yaml`.
