# Claude Instructions

Start with `AGENTS.md`. If present, also read `.kittify/overrides/AGENTS.md` and `.kittify/constitution/constitution.md` before making changes.

## Distilled Reminders
- Follow the canonical behavioral rules in `AGENTS.md`.
- State assumptions, surface alternatives when ambiguity exists, and ask when uncertain.
- Keep changes surgical, style-matched, and limited to the requested scope.
- Do not improve adjacent code, comments, or formatting unless required.
- Do not refactor unrelated code.
- Keep TickTick writes on `services/pipeline.js` -> `services/normalizer.js` -> `services/ticktick-adapter.js`.

## TickTick Write-Pipeline Checklist
- Confirm the change belongs in the existing write flow.
- Preserve deterministic normalization and adapter-based API calls.
- Update the matching spec or workflow note if behavior changes.
- Define success criteria, then verify against them.
- For multi-step work, provide a brief numbered plan and a verification loop.
- Avoid creating runtime agent folders or committing secrets.
