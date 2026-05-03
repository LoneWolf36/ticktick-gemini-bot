import test from 'node:test';
import assert from 'node:assert/strict';

import { TickTickAdapter } from '../services/ticktick-adapter.js';
import { TickTickClient } from '../services/ticktick.js';


test('TickTickAdapter _verifyUpdate accepts equivalent repeat flags with reordered RRULE parts', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-verify',
    projectId: 'project-repeat',
    repeatFlag: 'RRULE:INTERVAL=2;FREQ=DAILY',
  });

  const adapter = new TickTickAdapter(client);
  const result = await adapter._verifyUpdate('task-repeat-verify', 'project-repeat', {
    repeatFlag: 'FREQ=DAILY;INTERVAL=2',
  });

  assert.equal(result.verified, true);
});

test('TickTickAdapter _verifyUpdate still rejects non-equivalent repeat flags', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-mismatch',
    projectId: 'project-repeat',
    repeatFlag: 'FREQ=WEEKLY;BYDAY=MO,WE',
  });

  const adapter = new TickTickAdapter(client);
  const result = await adapter._verifyUpdate('task-repeat-mismatch', 'project-repeat', {
    repeatFlag: 'FREQ=WEEKLY;BYDAY=TU,TH',
  });

  assert.equal(result.verified, false);
  assert.match(result.verificationNote, /repeatFlag mismatch/);
});

test('TickTickAdapter _verifyUpdate treats repeatFlag RRULE canonical forms as equivalent', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-canonical',
    projectId: 'project-repeat',
    repeatFlag: 'RRULE:freq=weekly;byday=WE,MO',
  });

  const adapter = new TickTickAdapter(client);
  const result = await adapter._verifyUpdate('task-repeat-canonical', 'project-repeat', {
    repeatFlag: 'FREQ=weekly;BYDAY=MO,WE;INTERVAL=1',
  });

  assert.equal(result.verified, true);
});

test('TickTickAdapter _verifyUpdate rejects invalid repeatFlag strings even when both fail parse', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-invalid',
    projectId: 'project-repeat',
    repeatFlag: 'nonsense-one',
  });

  const adapter = new TickTickAdapter(client);
  const result = await adapter._verifyUpdate('task-repeat-invalid', 'project-repeat', {
    repeatFlag: 'nonsense-two',
  });

  assert.equal(result.verified, false);
  assert.match(result.verificationNote, /repeatFlag mismatch/);
});

test('TickTickAdapter _verifyUpdate treats empty repeatFlag values as equivalent only when both empty', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-empty',
    projectId: 'project-repeat',
    repeatFlag: '',
  });

  const adapter = new TickTickAdapter(client);
  const result = await adapter._verifyUpdate('task-repeat-empty', 'project-repeat', {
    repeatFlag: null,
  });

  assert.equal(result.verified, true);
});

test('TickTickAdapter _verifyUpdate rejects clearing repeat when TickTick keeps invalid repeatFlag', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-clear-mismatch',
    projectId: 'project-repeat',
    repeatFlag: 'nonsense-repeat',
  });

  const adapter = new TickTickAdapter(client);
  const result = await adapter._verifyUpdate('task-repeat-clear-mismatch', 'project-repeat', {
    repeatFlag: null,
  });

  assert.equal(result.verified, false);
  assert.match(result.verificationNote, /repeatFlag mismatch/);
});

test('TickTickAdapter _verifyUpdate rejects semantically invalid repeatFlag values even when structurally similar', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-invalid-semantics',
    projectId: 'project-repeat',
    repeatFlag: 'INTERVAL=1;FREQ=NOPE;BYDAY=XX,YY',
  });

  const adapter = new TickTickAdapter(client);
  const result = await adapter._verifyUpdate('task-repeat-invalid-semantics', 'project-repeat', {
    repeatFlag: 'FREQ=NOPE;BYDAY=YY,XX',
  });

  assert.equal(result.verified, false);
  assert.match(result.verificationNote, /repeatFlag mismatch/);
});

test('TickTickAdapter _verifyUpdate rejects identical semantically invalid repeatFlag values', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-identical-invalid',
    projectId: 'project-repeat',
    repeatFlag: 'FREQ=NOPE;BYDAY=YY,XX',
  });

  const adapter = new TickTickAdapter(client);
  const result = await adapter._verifyUpdate('task-repeat-identical-invalid', 'project-repeat', {
    repeatFlag: 'FREQ=NOPE;BYDAY=YY,XX',
  });

  assert.equal(result.verified, false);
  assert.match(result.verificationNote, /repeatFlag mismatch/);
});

test('TickTickAdapter updateTask sends full preserved payload for repeat updates', async () => {
  let updatePayload = null;
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-full',
    projectId: 'proj-repeat',
    title: 'Existing title',
    content: 'Existing content',
    desc: 'Existing desc',
    isAllDay: false,
    startDate: '2026-03-01T09:00:00.000+0000',
    dueDate: '2026-03-01T10:00:00.000+0000',
    timeZone: 'Europe/Dublin',
    reminders: [{ minutes: 15 }],
    priority: 3,
    sortOrder: 2,
    items: [{ title: 'Subtask', status: 0 }],
    status: 0,
  });
  client.updateTask = async (_taskId, payload) => {
    updatePayload = payload;
    return { id: 'task-repeat-full', ...payload };
  };

  const adapter = new TickTickAdapter(client);
  await adapter.updateTask('task-repeat-full', {
    originalProjectId: 'proj-repeat',
    repeatFlag: 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE',
  });

  assert.equal(updatePayload.id, 'task-repeat-full');
  assert.equal(updatePayload.projectId, 'proj-repeat');
  assert.equal(updatePayload.title, 'Existing title');
  assert.equal(updatePayload.content, 'Existing content');
  assert.equal(updatePayload.desc, 'Existing desc');
  assert.equal(updatePayload.isAllDay, false);
  assert.equal(updatePayload.startDate, '2026-03-01T09:00:00.000+0000');
  assert.equal(updatePayload.dueDate, '2026-03-01T10:00:00.000+0000');
  assert.equal(updatePayload.timeZone, 'Europe/Dublin');
  assert.deepEqual(updatePayload.reminders, [{ minutes: 15 }]);
  assert.equal(updatePayload.priority, 3);
  assert.equal(updatePayload.sortOrder, 2);
  assert.deepEqual(updatePayload.items, [{ title: 'Subtask', status: 0 }]);
  assert.equal(updatePayload.repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE');
});

test('TickTickAdapter updateTask omits content when existing repeat task content is empty', async () => {
  let updatePayload = null;
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-empty-content',
    projectId: 'proj-repeat',
    title: 'Existing title',
    content: '',
    status: 0,
  });
  client.updateTask = async (_taskId, payload) => {
    updatePayload = payload;
    return { id: 'task-repeat-empty-content', ...payload };
  };

  const adapter = new TickTickAdapter(client);
  await adapter.updateTask('task-repeat-empty-content', {
    originalProjectId: 'proj-repeat',
    repeatFlag: 'RRULE:FREQ=WEEKLY;BYDAY=SU',
  });

  assert.equal(Object.hasOwn(updatePayload, 'content'), false);
});

test('TickTickAdapter updateTask infers a Sunday repeat anchor when no anchor exists', async () => {
  let updatePayload = null;
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-anchor',
    projectId: 'proj-repeat',
    title: 'Anchor task',
    content: '',
    status: 0,
  });
  client.updateTask = async (_taskId, payload) => {
    updatePayload = payload;
    return { id: 'task-repeat-anchor', ...payload };
  };

  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) return new RealDate('2026-03-07T10:00:00.000Z');
      return new RealDate(...args);
    }
    static now() {
      return new RealDate('2026-03-07T10:00:00.000Z').getTime();
    }
    static parse(value) { return RealDate.parse(value); }
    static UTC(...args) { return RealDate.UTC(...args); }
  };

  try {
    const adapter = new TickTickAdapter(client);
    await adapter.updateTask('task-repeat-anchor', {
      originalProjectId: 'proj-repeat',
      repeatFlag: 'RRULE:FREQ=WEEKLY;BYDAY=SU',
    });
  } finally {
    global.Date = RealDate;
  }

  assert.equal(updatePayload.isAllDay, true);
  assert.equal(updatePayload.timeZone, 'Europe/Dublin');
  assert.equal(updatePayload.startDate, '2026-03-08T00:00:00.000+0000');
  assert.equal(updatePayload.dueDate, '2026-03-08T00:00:00.000+0000');
});

test('TickTickAdapter updateTask infers nearest BYDAY anchor for multi-day repeat', async () => {
  let updatePayload = null;
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-nearest-anchor',
    projectId: 'proj-repeat',
    title: 'Nearest anchor task',
    content: '',
    status: 0,
  });
  client.updateTask = async (_taskId, payload) => {
    updatePayload = payload;
    return { id: 'task-repeat-nearest-anchor', ...payload };
  };

  const RealDate = Date;
  global.Date = class extends RealDate {
    constructor(...args) {
      if (args.length === 0) return new RealDate('2026-03-07T10:00:00.000Z');
      return new RealDate(...args);
    }
    static now() {
      return new RealDate('2026-03-07T10:00:00.000Z').getTime();
    }
    static parse(value) { return RealDate.parse(value); }
    static UTC(...args) { return RealDate.UTC(...args); }
  };

  try {
    const adapter = new TickTickAdapter(client);
    await adapter.updateTask('task-repeat-nearest-anchor', {
      originalProjectId: 'proj-repeat',
      repeatFlag: 'RRULE:FREQ=WEEKLY;BYDAY=MO,SU',
    });
  } finally {
    global.Date = RealDate;
  }

  assert.equal(updatePayload.startDate, '2026-03-08T00:00:00.000+0000');
  assert.equal(updatePayload.dueDate, '2026-03-08T00:00:00.000+0000');
});

test('TickTickAdapter updateTask rejects no-anchor daily repeat updates', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-daily-no-anchor',
    projectId: 'proj-repeat',
    title: 'Anchorless task',
    content: '',
    status: 0,
  });
  client.updateTask = async () => ({ id: 'task-repeat-daily-no-anchor' });

  const adapter = new TickTickAdapter(client);

  await assert.rejects(
    () => adapter.updateTask('task-repeat-daily-no-anchor', {
      originalProjectId: 'proj-repeat',
      repeatFlag: 'RRULE:FREQ=DAILY;INTERVAL=1',
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('TickTickAdapter updateTask rejects invalid repeatFlag strings', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-invalid-update',
    projectId: 'proj-repeat',
    title: 'Existing title',
    content: '',
    dueDate: '2026-03-01T09:00:00.000+0000',
    status: 0,
  });
  client.updateTask = async () => ({ id: 'task-repeat-invalid-update' });

  const adapter = new TickTickAdapter(client);

  await assert.rejects(
    () => adapter.updateTask('task-repeat-invalid-update', {
      originalProjectId: 'proj-repeat',
      repeatFlag: 'RRULE:FREQ=NOPE',
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('TickTickAdapter updateTask rejects malformed UNTIL in repeatFlag', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-until-bad',
    projectId: 'proj-repeat',
    title: 'Existing title',
    content: '',
    dueDate: '2026-03-01T09:00:00.000+0000',
    status: 0,
  });
  client.updateTask = async () => ({ id: 'task-repeat-until-bad' });

  const adapter = new TickTickAdapter(client);

  await assert.rejects(
    () => adapter.updateTask('task-repeat-until-bad', {
      originalProjectId: 'proj-repeat',
      repeatFlag: 'RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=2026-03-01',
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('TickTickAdapter updateTask rejects unknown RRULE keys in repeatFlag', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-unknown-key',
    projectId: 'proj-repeat',
    title: 'Existing title',
    content: '',
    dueDate: '2026-03-01T09:00:00.000+0000',
    status: 0,
  });
  client.updateTask = async () => ({ id: 'task-repeat-unknown-key' });

  const adapter = new TickTickAdapter(client);

  await assert.rejects(
    () => adapter.updateTask('task-repeat-unknown-key', {
      originalProjectId: 'proj-repeat',
      repeatFlag: 'RRULE:FREQ=WEEKLY;BYDAY=SU;X-FOO=BAR',
    }),
    (error) => error.code === 'VALIDATION_ERROR',
  );
});

test('TickTickAdapter updateTask accepts valid UNTIL in repeatFlag', async () => {
  let updatePayload = null;
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async () => ({
    id: 'task-repeat-until-good',
    projectId: 'proj-repeat',
    title: 'Existing title',
    content: 'Existing content',
    dueDate: '2026-03-01T09:00:00.000+0000',
    status: 0,
  });
  client.updateTask = async (_taskId, payload) => {
    updatePayload = payload;
    return { id: 'task-repeat-until-good', ...payload };
  };

  const adapter = new TickTickAdapter(client);
  await adapter.updateTask('task-repeat-until-good', {
    originalProjectId: 'proj-repeat',
    repeatFlag: 'RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20260401T235959Z',
  });

  assert.equal(updatePayload.repeatFlag, 'RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=20260401T235959Z');
  assert.equal(updatePayload.title, 'Existing title');
});

test('TickTickAdapter updateTask verifyAfterWrite checks repeat anchor fields', async () => {
  const client = Object.create(TickTickClient.prototype);
  client.getTask = async (_projectId, taskId) => ({
    id: taskId,
    projectId: 'proj-repeat',
    title: 'Existing title',
    content: '',
    dueDate: '2026-03-08T00:00:00.000+0000',
    startDate: '2026-03-08T00:00:00.000+0000',
    isAllDay: true,
    timeZone: 'Europe/Dublin',
    repeatFlag: 'RRULE:FREQ=WEEKLY;BYDAY=SU',
    status: 0,
  });
  client.updateTask = async (_taskId, payload) => ({ id: 'task-repeat-verify-anchor', ...payload });

  const adapter = new TickTickAdapter(client);
  const result = await adapter.updateTask('task-repeat-verify-anchor', {
    originalProjectId: 'proj-repeat',
    repeatFlag: 'RRULE:FREQ=WEEKLY;BYDAY=SU',
    dueDate: '2026-03-08T00:00:00.000+0000',
  }, { verifyAfterWrite: true });

  assert.equal(result.verified, true);
  assert.equal(result.verificationNote, 'Verified against TickTick API');
});
