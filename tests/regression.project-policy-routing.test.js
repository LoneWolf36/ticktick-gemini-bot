import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveProjectCategoryFromPolicy } from '../services/project-policy.js';
import { PROJECT_POLICY } from '../services/user_context.example.js';

test('resolveProjectCategory matches exact project name', () => {
  const result = resolveProjectCategoryFromPolicy('Career & Job Search', PROJECT_POLICY);
  assert.ok(result);
  assert.equal(result.category, 'strategic');
});

test('resolveProjectCategory matches explicit alias', () => {
  const result = resolveProjectCategoryFromPolicy('career', PROJECT_POLICY);
  assert.ok(result);
  assert.equal(result.category, 'strategic');
});

test('resolveProjectCategory rejects substring-only match', () => {
  assert.equal(resolveProjectCategoryFromPolicy('Care', PROJECT_POLICY), null);
});
