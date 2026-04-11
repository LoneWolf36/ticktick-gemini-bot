# Duplicate Code Detection

This project uses automated tools to detect and prevent code duplication.

## Tools

- **JSCPD**: JavaScript/TypeScript duplicate detection
- **Pylint**: Python similarity detection

## Running Checks

```bash
# Run all duplicate checks
npm run check:duplicates

# Run only JavaScript check
npm run check:jscpd

# Run only Python similarity check
npm run check:python-similarity
```

## Thresholds

- **JSCPD**: 5% duplication threshold for CI, 10% for pre-commit hooks
- **Pylint**: Minimum 5 similar lines to trigger warning (R0801)

## Pre-commit Hook

The pre-commit hook runs JSCPD with a 10% threshold to catch only major duplications. This allows small duplications during development but prevents major code copies from being committed.

To enable the hook locally:

```bash
git config core.hooksPath .githooks
```

## CI/CD Integration

Duplicate detection runs automatically:

1. **Pre-commit**: Blocks commits with >10% duplication
2. **Docker build**: Runs `npm run check:duplicates` before production build
3. **Render deploy**: Fails deployment if duplicate check doesn't pass

## Ignored Directories

The following directories are excluded from duplicate detection:

- `kitty-specs/` - Spec files (intentionally similar)
- `.agent/`, `.agents/`, `.claude/`, `.codex/`, `.opencode/` - Agent skill files (intentionally mirrored)
- `.kittify/` - Tooling scripts
- `node_modules/`, `coverage/`, `dist/`, `build/` - Generated/built files

## Configuration

See `.jscpd.json` for full JSCPD configuration:

- **threshold**: 5% (CI mode)
- **minTokens**: 50 (minimum token sequence to consider duplicate)
- **minLines**: 10 (minimum line count for detection)
- **config**: ci (enables CI-friendly reporting)

## Baseline Reports

- HTML Report: `docs/jscpd-baseline.html/`
- JSON Report: `docs/jscpd-baseline.json`

These are generated automatically on each run and can be used to track duplication trends over time.

## Refactoring Guidelines

When duplicates are detected:

1. **Extract common logic** into shared functions or modules
2. **Use composition** instead of copying code blocks
3. **Parameterize** similar functions with different behaviors
4. **Consider design patterns** (Strategy, Template Method) for structural similarities

Remember: Some duplication is acceptable when it serves clarity. Don't over-abstract.
