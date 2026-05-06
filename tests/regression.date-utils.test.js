import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

test('formatTickTickISO stays stable across process TZ for Dublin calendar date', () => {
    const script = `
        import { formatTickTickISO } from './services/date-utils.js';
        const value = formatTickTickISO(new Date(2026, 4, 2), 'Europe/Dublin');
        process.stdout.write(value);
    `;

    const run = (tz) =>
        spawnSync(process.execPath, ['--input-type=module', '-e', script], {
            cwd: repoRoot,
            env: { ...process.env, TZ: tz },
            encoding: 'utf8'
        });

    const dublin = run('Europe/Dublin');
    const utc = run('UTC');

    assert.equal(dublin.status, 0);
    assert.equal(utc.status, 0);
    assert.match(dublin.stdout.trim(), /^2026-05-02T00:00:00\.000\+0100$/);
    assert.equal(dublin.stdout.trim(), utc.stdout.trim());
});
