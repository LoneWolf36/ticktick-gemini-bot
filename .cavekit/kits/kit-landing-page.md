---
created: "2026-04-01T11:50:00Z"
last_edited: "2026-04-01T11:50:00Z"
---

# Cavekit: Marketing Landing Page

## Scope

A single-file (`index.html`) premium marketing landing page for the Cavekit Claude Code plugin, deployed to the `gh-pages` branch. Replaces the current site at `juliusbrussee.github.io/cavekit/`. Zero dependencies, zero build step. The page communicates what Cavekit does, why it matters, and how to install it through 8 scroll-driven sections with a "neon cavekit evolved" visual identity.

## Requirements

### R1: Visual Identity System
**Description:** The page must establish a cohesive "neon cavekit evolved" design language used consistently across all sections.
**Acceptance Criteria:**
- [ ] CSS custom properties define the full color palette: near-black background (`~#0a0e1a`), neon-blue primary accent, red diagnostic, green pass, muted text colors, glassmorphism surface values
- [ ] Background uses a subtle noise texture + very faint grid (grid line opacity ~0.03-0.04)
- [ ] A distinctive display font is used for headings (loaded via Google Fonts or self-hosted), with monospace for annotations/code and system sans-serif for body text
- [ ] `-webkit-font-smoothing: antialiased` is applied to the root
- [ ] All interactive elements (buttons, links, copy actions) have glassmorphism surface treatment: `backdrop-filter: blur()`, semi-transparent rgba background, subtle border
- [ ] Glow effects use `text-shadow` and `box-shadow` with accent color at low opacity — never harsh or garish

### R2: Hero Section
**Description:** Full-viewport hero section that immediately communicates what Cavekit is and provides the install command.
**Acceptance Criteria:**
- [ ] Section fills 100vh, content is centered vertically and horizontally
- [ ] Contains, top to bottom: version badge pill (`v2.1.0`), title ("Cavekit" in display font ~72px desktop), subtitle, Hunt pipeline SVG diagram, install terminal block, two links (GitHub + Docs)
- [ ] Hunt pipeline SVG shows the full flow: YOU → DRAFT → ARCHITECT → fan-out to 3 agents → MERGE → main
- [ ] Pipeline SVG boxes have glassmorphism fills
- [ ] A glowing particle traces the pipeline path on page load using SVG `<animateMotion>` with glow `drop-shadow` filter
- [ ] Install terminal block has glassmorphism surface, monospace text showing the two install commands, and a copy button
- [ ] Copy button copies both commands to clipboard and morphs text to "COPIED" with green color change, reverting after 2s
- [ ] Hero loads with a staggered animation sequence: badge → title → subtitle → pipeline → install → links, with 50-100ms stagger delays

### R3: Problem Section
**Description:** Communicates the 4 pain points Cavekit solves using diagnostic-styled cards.
**Acceptance Criteria:**
- [ ] Section label in monospace: "THE PROBLEM"
- [ ] Headline text: "AI coding agents are powerful. They fail in predictable ways."
- [ ] 2x2 grid of cards (1-column on mobile) for: Context Lost, No Validation, Single Agent, No Iteration
- [ ] Each card has: glassmorphism surface with red-tinted border, monospace title in neon-red with glow, one-line description, horizontal severity bar
- [ ] Severity bars fill from 0% to target width on scroll-trigger, using `ease-out` timing over 800ms
- [ ] Cards stagger in on scroll with 80ms delay between each, using `translateY(12px)` entrance

### R4: How It Works Section (Hunt Phases)
**Description:** Explains the 4-phase workflow with visual phase cards.
**Acceptance Criteria:**
- [ ] Section label: "HOW IT WORKS"
- [ ] 4 phase cards in horizontal row (vertical stack on mobile): Draft, Architect, Build, Inspect
- [ ] Each card shows: large phase letter (48px, blue glow), phase name, command in monospace pill, one-line description
- [ ] Cards connected by animated glow lines with a subtle pulse traveling along them
- [ ] Below cards: paragraph explaining the cavekit-as-source-of-truth concept
- [ ] Cards stagger from left to right on scroll (100ms delay between each)

### R5: Dual-Model Advantage Section
**Description:** Showcases the Codex adversarial review system — Cavekit's key differentiator.
**Acceptance Criteria:**
- [ ] Section label: "ADVERSARIAL REVIEW"
- [ ] Headline: "Two models. Different blind spots. Higher confidence."
- [ ] Subheadline explaining Claude + Codex dual-model approach
- [ ] Three full-width cards stacked vertically:
  - Design Challenge (badge: PRE-BUILD): diagram showing Claude drafts → Reviewer approves → Codex challenges → User reviews
  - Tier Gate (badge: BUILD-TIME): severity table with P0-P3 levels and colored indicators
  - Command Safety (badge: RUNTIME): flow diagram command → fast-path → Codex classifies → verdict
- [ ] Each card has glassmorphism surface and a colored badge
- [ ] Below cards: note that all Codex features are additive and Cavekit works without Codex
- [ ] Cards stagger in vertically on scroll (100ms between each)
- [ ] Mini diagrams inside cards draw themselves after card is visible (+300ms)

### R6: Ralph Loop Section
**Description:** Animated visualization of the build iteration loop.
**Acceptance Criteria:**
- [ ] Section label: "THE BUILD LOOP"
- [ ] Contained in a glassmorphism panel with subtle scanline overlay
- [ ] Elliptical loop SVG with 5 nodes: READ, IMPLEMENT, VALIDATE, COMMIT, NEXT TASK
- [ ] Glowing particle continuously orbits the loop path via SVG `<animateMotion>` with `drop-shadow` glow filter
- [ ] VALIDATE node has a branching FAIL path in red
- [ ] COMMIT node pulses green as particle passes
- [ ] Metrics readout bar below SVG: Iterations (animated counter 1→18), Tasks (34), Pass Rate (100%), Status (COMPLETE)
- [ ] Iteration counter animates on scroll trigger, loops every 3s
- [ ] Elliptical path draws itself on scroll (stroke-dashoffset, 2s)

### R7: Parallel Execution Section
**Description:** Visualizes the wave-based parallel build system.
**Acceptance Criteria:**
- [ ] Section label: "PARALLEL EXECUTION"
- [ ] Headline: "Independent tasks run simultaneously. Wave by wave."
- [ ] Animated wave visualization showing Wave 1 (3 task cards: Schema, Auth, Config) → dependency arrows → Wave 2 (2 task cards: Users, Health)
- [ ] Task cards are glassmorphism with monospace content showing task ID, name, and agent assignment
- [ ] Wave 1 cards stagger in (80ms between), pause 400ms, dependency arrows draw, Wave 2 cards stagger in
- [ ] "BUILD COMPLETE" badge fades in at bottom with green glow after wave animation completes
- [ ] Below: note about circuit breakers and failure handling

### R8: Get Started Section
**Description:** The conversion section — makes installing Cavekit unmissable.
**Acceptance Criteria:**
- [ ] Section label: "GET STARTED"
- [ ] Headline: "Two commands. You're building from kits."
- [ ] Large glassmorphism terminal block (max-width ~700px) with fake terminal chrome (three dots + title bar)
- [ ] Typewriter animation types both install commands at ~40ms/char with random jitter
- [ ] Blinking cursor follows insertion point during typewriter
- [ ] Copy button in terminal: "COPY" → "COPIED ✓" with green glow, `scale(0.97)` on `:active`
- [ ] Requirements line: "Requires Claude Code, git, macOS/Linux."
- [ ] Optional line: "Recommended: Codex for adversarial review, tmux for parallel agents."
- [ ] Two CTA buttons: "View on GitHub →" (primary, blue glow) and "Read the Docs →" (secondary, links to docs.html)
- [ ] `<noscript>` fallback shows full commands without typewriter

### R9: Footer
**Description:** Minimal branded footer.
**Acceptance Criteria:**
- [ ] Single centered line in monospace, muted: "Cavekit — MIT License · Built by Julius Brussee"
- [ ] "Julius Brussee" links to GitHub profile
- [ ] Faint horizontal accent line above footer text

### R10: Animation Infrastructure
**Description:** Scroll-triggered animation system and motion design standards.
**Acceptance Criteria:**
- [ ] All section animations triggered by `IntersectionObserver` with `threshold: 0.15`
- [ ] Sections receive a `.visible` class when triggered; observer unobserves after triggering
- [ ] All entrance animations use custom `ease-out` curve: `cubic-bezier(0.23, 1, 0.32, 1)`
- [ ] UI animation durations stay under 300ms (except SVG path draws and particle traces)
- [ ] SVG path animations use `stroke-dasharray`/`stroke-dashoffset` technique
- [ ] `@media (prefers-reduced-motion: reduce)` disables all motion, shows all content immediately with full opacity
- [ ] No animation libraries — pure CSS + minimal JS (IntersectionObserver + typewriter + counter)
- [ ] All animations use `transform` and `opacity` only (GPU-composited) except stroke-dashoffset

### R11: Responsive Design
**Description:** The page must work across all viewport sizes.
**Acceptance Criteria:**
- [ ] Breakpoints: mobile (<768px), desktop (>=768px)
- [ ] Mobile: all grids collapse to single column, horizontal card rows become vertical stacks
- [ ] Pipeline SVG in hero: horizontally scrollable container on mobile with `overflow-x: auto`
- [ ] Terminal blocks use `overflow-x: auto` on mobile for long commands
- [ ] Body text minimum 16px (avoids iOS auto-zoom)
- [ ] `viewport` meta tag: `width=device-width, initial-scale=1`
- [ ] No horizontal scrollbar on the page body at any viewport width
- [ ] Touch targets meet 44x44px minimum

### R12: Accessibility
**Description:** The page must be accessible to all users.
**Acceptance Criteria:**
- [ ] All SVG diagrams have `role="img"` and descriptive `aria-label`
- [ ] Semantic HTML: `<header>`, `<section>`, `<footer>` with `aria-labelledby` on sections
- [ ] All text meets WCAG AA contrast ratio (4.5:1) against the background — decorative elements exempt
- [ ] Keyboard-navigable: all links and buttons reachable via Tab with visible focus indicators (2px solid accent, 2px offset)
- [ ] Copy button is a real `<button>` element with `aria-label`
- [ ] Typewriter text has `<noscript>` fallback
- [ ] `prefers-reduced-motion` fully supported (R10)
- [ ] Heading hierarchy: sequential h1→h2→h3, no level skips
- [ ] Skip-to-content link for keyboard users

### R13: Performance
**Description:** The page must load fast with no external dependencies beyond fonts.
**Acceptance Criteria:**
- [ ] Single `index.html` file — all CSS inline in `<style>`, all JS inline in `<script>`
- [ ] Total file size under 60KB (uncompressed)
- [ ] No external dependencies except optional Google Fonts (loaded with `font-display: swap`)
- [ ] Font preload via `<link rel="preload">` for the display font
- [ ] No images — all visuals are CSS or inline SVG
- [ ] JS is minimal: IntersectionObserver setup, typewriter function, counter function, copy function

## Out of Scope
- No JavaScript framework or build system
- No analytics or tracking
- No dark/light mode toggle (inherently dark)
- No interactive elements beyond links and the copy button
- No blog, search, or dynamic content
- No custom domain setup (just `gh-pages` branch deployment)

## Cross-References
- See also: cavekit-docs-page.md (linked from hero and Get Started sections)
- Docs page shares the same visual identity system (R1)

## Changelog
