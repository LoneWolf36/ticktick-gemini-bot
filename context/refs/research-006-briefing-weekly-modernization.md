# Research: 006 Briefing and Weekly Pipeline Modernization

## Scope

This research resolves how to modernize `/briefing` and `/weekly` into a shared structured summary surface while preserving product tone, keeping behavior within the clarified feature boundary, and making the feature easy to split into parallel work packages.

## Research Tasks

1. Determine the minimal module split that enables parallel implementation without overengineering.
2. Determine the stable summary contracts that fit the product direction and clarified spec.
3. Determine the formatter strategy that preserves current tone while making output deterministic.
4. Determine the weekly fallback and watchout boundary for sparse or missing history.
5. Determine the testing and observability strategy that supports parallel implementation safely.

## Findings

### 1. Use a small `services/summary-surfaces/` feature folder as the parallelization seam

Decision:
- Introduce one small feature-local folder under `services/` with `index.js`, `briefing-summary.js`, `weekly-summary.js`, and `summary-formatter.js`.
- Keep modules function-based and reuse existing `services/gemini.js`, `services/execution-prioritization.js`, `bot/utils.js`, and `services/store.js`.

Rationale:
- Current daily and weekly paths live in `services/gemini.js`, `bot/commands.js`, and `services/scheduler.js`, which would become merge hotspots for parallel agents.
- A four-file split is the minimum structure that separates daily logic, weekly logic, and deterministic formatting without introducing a new framework or package boundary.
- This stays aligned with the constitution's avoid-over-engineering rule while still giving later work packages clean ownership.

Alternatives considered:
- Leave all logic in `services/gemini.js`: rejected due to conflict hotspots and weak contract boundaries.
- Create a fully generic report engine or plugin system: rejected as overengineering for two summary surfaces.

### 2. Fix top-level section contracts and keep inner fields intentionally light

Decision:
- Preserve the clarified top-level contracts: `/briefing` -> `focus`, `priorities`, `why_now`, `start_now`, `notices`; `/weekly` -> `progress`, `carry_forward`, `next_focus`, `watchouts`, `notices`.
- Keep inner item shapes minimal and formatter-oriented rather than schema-heavy.

Rationale:
- The spec requires stable top-level sections for tests and deterministic formatting, but explicitly allows inner fields to evolve.
- Narrow inner shapes reduce rework risk when later specs refine ranking, state, or memory inputs.
- Tests can lock section presence and fallback behavior without freezing every nested field prematurely.

Alternatives considered:
- Lock every nested field now: rejected because `007`, `008`, and `009` still evolve adjacent policies.
- Use one generic shared envelope for both surfaces: rejected because it hides the product's daily vs weekly intent and weakens formatter clarity.

### 3. Preserve headers and tone through deterministic formatting rather than prompt mirroring

Decision:
- Move formatting responsibility into a deterministic renderer that reuses current header and urgent reminder helpers from `bot/utils.js`.
- Treat wording changes as regression-sensitive; keep copy close to current surfaces unless honesty or missing-data fallbacks require explicit notices.

Rationale:
- The user explicitly chose tone preservation, and the constitution emphasizes trust, clutter reduction, and predictable behavior.
- Formatter logic in code makes output reviewable and testable across manual and scheduled paths.
- Reusing the existing Telegram-safe helpers lowers risk and keeps the modernization focused on structure rather than voice redesign.

Alternatives considered:
- Keep prompt-generated final copy: rejected because it undermines deterministic formatting.
- Rewrite the full copy style during migration: rejected as scope creep.

### 4. Weekly fallback must stay honest and evidence-backed

Decision:
- When processed-task history is sparse or absent, `/weekly` should produce a reduced digest from current task data and include an explicit missing-history notice.
- `watchouts` should only include evidence-backed execution risks from current tasks or processed history, plus missing-data notices.

Rationale:
- The clarified spec explicitly rejects fabricated metrics, behavioral interpretation, and filler.
- This boundary prevents `006` from overlapping `009` behavioral-memory scope.
- It also yields a clear regression target: missing data changes what is emitted, not the contract shape.

Alternatives considered:
- Skip weekly output when history is missing: rejected because it breaks surface availability and scheduler predictability.
- Allow lightweight behavioral callouts in `watchouts`: rejected because it blurs feature boundaries and complicates tests.

### 5. Embedded TDD with one shared contract baseline is the safest regression strategy

Decision:
- Keep testing embedded within each implementation stream, but require the foundation step to freeze section contracts and formatter invariants before parallel work begins.
- Extend the relevant `tests/regression.*.test.js` domain suite with stream-owned coverage, and use `npm run test:regression` plus existing E2E harnesses as confidence checks.

Rationale:
- The user explicitly preferred embedded testing for TDD.
- The constitution prefers system correctness and regression coverage over heavy test infrastructure.
- Stream-owned tests let daily, weekly, and formatter work move independently once the shared contract is stable.

Alternatives considered:
- Centralize all tests in a final QA stream: rejected because it encourages late integration surprises.
- Add a new dedicated test harness for summaries: rejected because the split serial regression suite is sufficient.

### 6. Observability should compare summary composition across command and scheduler paths

Decision:
- Log source counts, degraded reasons, structured summary objects, formatting decisions, and delivery failures around both manual and scheduled runs.
- Keep field names shared so parity can be checked across `/briefing`, `/weekly`, and scheduler jobs.

Rationale:
- FR-006 and the constitution both emphasize inspectability and logging.
- Parity checks are easier when manual and scheduled surfaces emit the same summary-stage diagnostics.
- This keeps the modernization auditable without introducing a vendor-specific telemetry dependency.

Alternatives considered:
- Leave summary logs as raw final strings only: rejected because structured output would no longer be inspectable in practice.
- Add a new telemetry service: rejected because it exceeds feature scope.

## Conclusion

The implementation should modernize `/briefing` and `/weekly` around one lean shared summary surface inside `services/summary-surfaces/`, with fixed top-level section contracts, deterministic formatting, evidence-backed weekly watchouts, and embedded regression work per parallel stream. The design should optimize for low-overhead coordination, not for a generic reporting framework.
