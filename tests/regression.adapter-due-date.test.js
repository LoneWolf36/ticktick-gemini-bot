import test from 'node:test';
import assert from 'node:assert/strict';

import { areEquivalentDueDates } from '../services/date-utils.js';

test('areEquivalentDueDates date-only vs same-day datetime returns true', () => {
    assert.equal(areEquivalentDueDates('2026-05-05', '2026-05-05T23:00:00.000+0000'), true);
});

test('areEquivalentDueDates date-only vs different-day datetime returns false', () => {
    assert.equal(areEquivalentDueDates('2026-05-05', '2026-05-06T00:00:00.000+0000'), false);
});

test('areEquivalentDueDates date-only startDate vs same-day datetime returns true', () => {
    assert.equal(areEquivalentDueDates('2026-05-05', '2026-05-05T23:00:00.000+0000'), true);
});

test('areEquivalentDueDates exact same datetime returns true', () => {
    assert.equal(
        areEquivalentDueDates('2026-05-05T12:00:00.000+0000', '2026-05-05T12:00:00.000+0000'),
        true
    );
});

test('areEquivalentDueDates different datetimes returns false', () => {
    assert.equal(
        areEquivalentDueDates('2026-05-05T12:00:00.000+0000', '2026-05-05T13:00:00.000+0000'),
        false
    );
});

test('areEquivalentDueDates both null returns true', () => {
    assert.equal(areEquivalentDueDates(null, null), true);
});

test('areEquivalentDueDates expected null actual undefined returns true', () => {
    assert.equal(areEquivalentDueDates(null, undefined), true);
});

test('areEquivalentDueDates one null one value returns false', () => {
    assert.equal(areEquivalentDueDates(null, '2026-05-05'), false);
});

test('areEquivalentDueDates both date-only same day returns true', () => {
    assert.equal(areEquivalentDueDates('2026-05-05', '2026-05-05'), true);
});

test('areEquivalentDueDates both date-only different day returns false', () => {
    assert.equal(areEquivalentDueDates('2026-05-05', '2026-05-06'), false);
});
