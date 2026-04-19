# Claude Instructions

Start with `AGENTS.md` before making changes.
Read `.codex/skills/karpathy-guardrails/SKILL.md` for behavioral guardrails.

## Karpathy Guardrails (Distilled)
1. **Think Before Coding** — State assumptions. If uncertain, ask. If simpler exists, push back.
2. **Simplicity First** — No speculative features, no single-use abstractions, no unasked "flexibility".
3. **Surgical Changes** — Match existing style. Don't improve adjacent code. Every diff line traces to a requirement.
4. **Verify Your Work** — Define success criteria. Test beyond happy path. Re-read your diff before finishing.

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
- Update the matching cavekit requirement in `context/kits/` if behavior changes.
- Define success criteria, then verify against them.
- For multi-step work, provide a brief numbered plan and a verification loop.
- Avoid creating runtime agent folders or committing secrets.
