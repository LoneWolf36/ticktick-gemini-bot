# Development Workflow Guide

This project uses **Cavekit** for spec-driven development. The legacy Archon + Spec Kitty quality gate workflow has been retired and replaced with Cavekit's built-in validation.

## Cavekit Workflow

### Commands

| Command | Purpose |
|---------|---------|
| `/ck:sketch` | Decompose into domains with R-numbered requirements |
| `/ck:map` | Generate tiered build plan |
| `/ck:make` | Autonomous build loop |
| `/ck:check` | Gap analysis and peer review |
| `/ck:ship "feature"` | All 4 steps in one shot (small features) |

### Domain Kits

All requirements live in `context/kits/`. See `context/kits/cavekit-overview.md` for:
- Domain index (8 kits, 93 requirements, 325 acceptance criteria)
- Cross-reference map
- Dependency graph

### Reference Materials

Research briefs, data models, OpenAPI specs, and schemas are in `context/refs/`.

## Verification

```bash
# Run regression tests
node tests/run-regression-tests.mjs

# Review kits
cat context/kits/cavekit-overview.md
```

## Migration History

- **2026-04-18**: Migrated from Spec Kitty (kitty-specs/) to Cavekit (context/kits/).
- Original specs archived in `kitty-specs.archived/` for reference.
- Legacy Archon workflows (`spec-kitty-quality-gate.yaml`) were removed.
