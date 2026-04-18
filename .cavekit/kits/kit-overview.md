---
created: "2026-04-01T11:50:00Z"
last_edited: "2026-04-01T11:50:00Z"
---

# Cavekit Overview

## Project
Premium GitHub Pages website for the Cavekit Claude Code plugin. Two static HTML files deployed to the `gh-pages` branch: a marketing landing page and a single-page documentation reference. "Neon cavekit evolved" visual identity — dark backgrounds, glassmorphism surfaces, neon-blue accents, scroll-driven animations. Zero dependencies, zero build step.

## Domain Index
| Domain | Cavekit File | Requirements | Status | Description |
|--------|-----------|-------------|--------|-------------|
| Marketing Landing Page | cavekit-landing-page.md | 13 | DRAFT | 8-section scroll experience: hero, problem, Hunt phases, Codex review, Ralph Loop, parallel execution, install, footer |
| Documentation Page | cavekit-docs-page.md | 16 | DRAFT | Single-page docs with sidebar nav: overview, quick start, commands, methodology, Codex integration, skills, configuration |

## Cross-Reference Map
| Domain A | Interacts With | Interaction Type |
|----------|---------------|-----------------|
| Marketing Landing Page | Documentation Page | Navigation links (hero + Get Started link to docs.html) |
| Documentation Page | Marketing Landing Page | Navigation link (top bar logo + "Back to Home" link to index.html) |
| Marketing Landing Page | Documentation Page | Shared visual identity (CSS custom properties, font stack, glassmorphism treatment) |

## Dependency Graph
1. Marketing Landing Page — no dependencies (can be implemented first; establishes the visual identity system that docs page inherits)
2. Documentation Page — soft dependency on Landing Page R1 (shared visual identity); can be implemented in parallel if design tokens are agreed upfront
