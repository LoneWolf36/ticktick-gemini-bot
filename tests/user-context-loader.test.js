import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { loadUserContextModule, getModuleExport } from '../services/user-context-loader.js';

// ─── Helpers ──────────────────────────────────────────────────

function withTempModule(exportCode, fn) {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'user-ctx-test-'));
    const modulePath = path.join(tmpDir, 'user_context.js');
    try {
        writeFileSync(modulePath, exportCode, 'utf-8');
        return fn(modulePath, tmpDir);
    } finally {
        try { unlinkSync(modulePath); } catch { /* cleanup best-effort */ }
        try { rmdirSync(tmpDir); } catch { /* cleanup best-effort */ }
    }
}

async function withTempModuleAsync(exportCode, fn) {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'user-ctx-test-'));
    const modulePath = path.join(tmpDir, 'user_context.js');
    try {
        writeFileSync(modulePath, exportCode, 'utf-8');
        return await fn(modulePath, tmpDir);
    } finally {
        try { unlinkSync(modulePath); } catch { /* cleanup best-effort */ }
        try { rmdirSync(tmpDir); } catch { /* cleanup best-effort */ }
    }
}

// ============================================================
// L001: Load from first path in search order
// ============================================================

test('L001: loadUserContextModule returns module from first path when it exists', async () => {
    await withTempModuleAsync(
        'export const USER_TIMEZONE = "Pacific/Auckland";',
        async (modulePath) => {
            const result = await loadUserContextModule([modulePath]);
            assert.ok(result.mod, 'mod should be non-null');
            assert.equal(result.source, 'user_context');
            assert.equal(result.path, modulePath);
            assert.equal(getModuleExport(result.mod, 'USER_TIMEZONE'), 'Pacific/Auckland');
        }
    );
});

test('L001: loadUserContextModule skips missing first path, loads from second', async () => {
    await withTempModuleAsync(
        'export const USER_CONTEXT = "second file ctx";',
        async (modulePath) => {
            const missingPath = '/tmp/nonexistent-xxxxx-user-context.js';
            const result = await loadUserContextModule([missingPath, modulePath]);
            assert.ok(result.mod, 'mod should be non-null (loaded from second path)');
            assert.equal(result.source, 'user_context');
            assert.equal(result.path, modulePath);
            assert.equal(getModuleExport(result.mod, 'USER_CONTEXT'), 'second file ctx');
        }
    );
});

test('L001: loadUserContextModule returns null when no paths exist', async () => {
    const result = await loadUserContextModule([
        '/tmp/nonexistent-aaaa-user-context.js',
        '/tmp/nonexistent-bbbb-user-context.js',
    ]);
    assert.equal(result.mod, null);
    assert.equal(result.source, null);
    assert.equal(result.path, null);
});

// ============================================================
// L002: Safe failure on invalid module (syntax error)
// ============================================================

test('L002: loadUserContextModule logs and continues on syntax error', async () => {
    await withTempModuleAsync(
        'export const INVALID = ;;;;',
        async (modulePath) => {
            const fallbackPath = path.join(path.dirname(modulePath), 'fallback.js');
            writeFileSync(fallbackPath, 'export const VALUE = 42;', 'utf-8');
            try {
                const result = await loadUserContextModule([modulePath, fallbackPath]);
                assert.ok(result.mod, 'should fall through to valid path');
                assert.equal(getModuleExport(result.mod, 'VALUE'), 42);
            } finally {
                try { unlinkSync(fallbackPath); } catch { /* best-effort */ }
            }
        }
    );
});

// ============================================================
// L003: getModuleExport helper
// ============================================================

test('L003: getModuleExport returns value for existing key', () => {
    const mod = { GREETING: 'hello', COUNT: 7 };
    assert.equal(getModuleExport(mod, 'GREETING'), 'hello');
    assert.equal(getModuleExport(mod, 'COUNT'), 7);
});

test('L003: getModuleExport returns undefined for missing key', () => {
    const mod = { A: 1 };
    assert.equal(getModuleExport(mod, 'B'), undefined);
});

test('L003: getModuleExport returns undefined for null mod', () => {
    assert.equal(getModuleExport(null, 'ANY'), undefined);
});

test('L003: getModuleExport returns undefined for non-object mod', () => {
    assert.equal(getModuleExport('string', 'ANY'), undefined);
    assert.equal(getModuleExport(42, 'ANY'), undefined);
});

// ============================================================
// L004: Load module with multiple exports (realistic scenario)
// ============================================================

test('L004: loadUserContextModule loads module with all expected exports', async () => {
    await withTempModuleAsync(
        `export const USER_CONTEXT = 'You are my accountability partner.';
export const PROJECT_POLICY = { projects: [], categories: {} };
export const KEYWORDS = { urgent: ['today'], stopWords: ['the'] };
export const VERB_LIST = 'build|create';
export const SCORING = { telemetryThrottleMs: 30000 };
export const USER_TIMEZONE = 'America/New_York';`,
        async (modulePath) => {
            const result = await loadUserContextModule([modulePath]);
            assert.ok(result.mod);
            assert.equal(getModuleExport(result.mod, 'USER_CONTEXT'), 'You are my accountability partner.');
            assert.deepEqual(getModuleExport(result.mod, 'PROJECT_POLICY'), { projects: [], categories: {} });
            assert.deepEqual(getModuleExport(result.mod, 'KEYWORDS'), { urgent: ['today'], stopWords: ['the'] });
            assert.equal(getModuleExport(result.mod, 'VERB_LIST'), 'build|create');
            assert.deepEqual(getModuleExport(result.mod, 'SCORING'), { telemetryThrottleMs: 30000 });
            assert.equal(getModuleExport(result.mod, 'USER_TIMEZONE'), 'America/New_York');
        }
    );
});

// ============================================================
// L005: Load from /etc/secrets/ path simulation
// ============================================================

test('L005: loadUserContextModule loads from subdirectory path (simulating /etc/secrets/)', async () => {
    const tmpDir = mkdtempSync(path.join(tmpdir(), 'user-ctx-secrets-'));
    const secretsDir = path.join(tmpDir, 'etc', 'secrets');
    const { mkdirSync } = await import('fs');
    mkdirSync(secretsDir, { recursive: true });
    const secretsPath = path.join(secretsDir, 'user_context.js');
    try {
        writeFileSync(secretsPath, 'export const USER_TIMEZONE = "Europe/London";', 'utf-8');

        // First check that local/root are missing, secrets is found
        const result = await loadUserContextModule([
            '/tmp/definitely-missing-1111-user_context.js',
            '/tmp/definitely-missing-2222-user_context.js',
            secretsPath,
        ]);
        assert.ok(result.mod, 'should load from secrets path');
        assert.equal(result.path, secretsPath);
        assert.equal(getModuleExport(result.mod, 'USER_TIMEZONE'), 'Europe/London');
    } finally {
        try { unlinkSync(secretsPath); } catch { /* best-effort */ }
        try { rmdirSync(secretsDir); } catch { /* best-effort */ }
        try { rmdirSync(tmpDir); } catch { /* best-effort */ }
    }
});

// ============================================================
// L006: Minimal module (no relevant exports) loads but returns undefined
// ============================================================

test('L006: loadUserContextModule loads minimal module, getModuleExport returns undefined for missing keys', async () => {
    await withTempModuleAsync(
        'export const UNRELATED = true;',
        async (modulePath) => {
            const result = await loadUserContextModule([modulePath]);
            assert.ok(result.mod, 'mod should load even without expected exports');
            assert.equal(getModuleExport(result.mod, 'USER_TIMEZONE'), undefined);
            assert.equal(getModuleExport(result.mod, 'PROJECT_POLICY'), undefined);
            assert.equal(getModuleExport(result.mod, 'USER_CONTEXT'), undefined);
        }
    );
});
