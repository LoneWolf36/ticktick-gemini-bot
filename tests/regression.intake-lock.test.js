import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getIntakeLockStatus,
    releaseIntakeLock,
    tryAcquireIntakeLock,
} from '../services/store.js';

test('intake lock exposes owner metadata and blocks concurrent acquisition', () => {
    releaseIntakeLock();

    assert.equal(tryAcquireIntakeLock({ owner: 'test:first', ttlMs: 1000, now: 1000 }), true);
    assert.deepEqual(getIntakeLockStatus({ now: 1001 }), {
        locked: true,
        owner: 'test:first',
        acquiredAt: 1000,
        expiresAt: 2000,
    });

    assert.equal(tryAcquireIntakeLock({ owner: 'test:second', ttlMs: 1000, now: 1500 }), false);

    releaseIntakeLock();
});

test('intake lock self-heals after ttl expiry', () => {
    releaseIntakeLock();

    assert.equal(tryAcquireIntakeLock({ owner: 'test:expired', ttlMs: 1000, now: 1000 }), true);
    assert.deepEqual(getIntakeLockStatus({ now: 2000 }), { locked: false });

    assert.equal(tryAcquireIntakeLock({ owner: 'test:new', ttlMs: 1000, now: 2001 }), true);
    assert.equal(getIntakeLockStatus({ now: 2002 }).owner, 'test:new');

    releaseIntakeLock();
});
