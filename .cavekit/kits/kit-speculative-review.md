---
created: "2026-03-31T00:00:00Z"
last_edited: "2026-03-31T00:00:00Z"
---

# Cavekit: Speculative Pre-Build Review

## Scope
Run Codex adversarial review of the previous tier in the background while Claude builds the current tier. By the time the current tier finishes, the review of the previous tier is already complete, cutting tier gate latency to near-zero.

## Requirements

### R1: Background Review Dispatch
Launch Codex review asynchronously at tier transitions.
- [ ] When a tier completes and the build loop advances to the next tier, dispatch a Codex adversarial review of the just-completed tier's diff in the background
- [ ] Use the Codex plugin's `--background` flag so the build loop does not wait
- [ ] Track the background job ID for later retrieval
- [ ] First tier (Tier 0) has no previous tier — no speculative review is dispatched, only the normal tier gate if enabled

### R2: Result Retrieval at Tier Boundary
Collect the speculative review results before advancing past the next tier.
- [ ] Before the tier gate runs for Tier N, check if the speculative review of Tier N-1 has completed
- [ ] If the speculative review is done, consume its findings immediately — skip running a redundant tier gate review for Tier N-1
- [ ] If the speculative review is still running, wait for it (bounded by a configurable timeout)
- [ ] If the speculative review timed out or failed, fall back to running the tier gate synchronously

### R3: Finding Reconciliation
Merge speculative review findings with the tier gate flow.
- [ ] Speculative review findings are processed through the same severity-based gating logic as the tier gate (P0/P1 block, P2/P3 deferred)
- [ ] If P0/P1 findings from the speculative review arrive while Tier N is still building, do NOT interrupt Tier N — queue the findings for processing after Tier N completes
- [ ] After Tier N completes, process any queued P0/P1 findings before starting Tier N+1
- [ ] Findings tagged with `source: codex-speculative` to distinguish from synchronous tier gate findings

### R4: Pipeline Overlap Tracking
Visibility into the speculative review pipeline state.
- [ ] Build loop status output shows whether a speculative review is running, pending, or complete
- [ ] Log the time saved by speculative vs synchronous review (actual review duration that overlapped with build time)
- [ ] Track in impl tracking which tiers had speculative review and which fell back to synchronous

### R5: Configuration
Settings to control speculative review behavior.
- [ ] Setting `speculative_review` with values `"on" | "off"` (default: `"on"` when Codex is available and tier gate is not `"off"`)
- [ ] Setting `speculative_review_timeout` in seconds (default: 300) — max wait time at tier boundary for a pending speculative review
- [ ] Speculative review is automatically disabled if `tier_gate_mode = "off"`

## Out of Scope
- Speculative building (starting Tier N+1 before Tier N's review is resolved) — too risky, findings could invalidate Tier N+1's work
- Reviewing multiple tiers ahead — only one tier of overlap
- Modifying the Codex plugin's background job mechanism

## Cross-References
- See also: cavekit-tier-gate.md (speculative review feeds into tier gate gating logic)
- See also: cavekit-codex-bridge.md (R1 for detection, R3 for review invocation)
- Pattern reference: skills/speculative-pipeline/SKILL.md (same staggered-start principle applied to review)

## Changelog
- 2026-03-31: Initial draft
