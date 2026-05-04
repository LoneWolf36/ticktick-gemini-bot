import test from 'node:test';
import assert from 'node:assert/strict';
import cron from 'node-cron';

import * as store from '../services/store.js';

async function runCapturedPoll({ pipeline }) {
    await store.resetAll();
    await store.setChatId('scheduler-poll-privacy');

    const scheduled = [];
    const originalSchedule = cron.schedule;
    cron.schedule = (expression, callback) => {
        scheduled.push({ expression, callback });
        return { stop: () => {} };
    };

    try {
        const { startScheduler } = await import('../services/scheduler.js');
        const sensitiveTitle = 'Secret title should never appear';
        const sensitiveContent = 'Sensitive content should never appear';
        await startScheduler(
            { api: { sendMessage: async () => {} } },
            { isAuthenticated: () => true, getAuthUrl: () => 'https://auth.example.test' },
            {
                isQuotaExhausted: () => false,
                quotaResumeTime: () => null,
                generateDailyBriefingSummary: async () => ({ formattedText: 'daily' }),
                generateWeeklyDigestSummary: async () => ({ formattedText: 'weekly' })
            },
            {
                listActiveTasks: async () => [
                    {
                        id: 'poll-secret-task',
                        title: sensitiveTitle,
                        content: sensitiveContent,
                        projectId: 'inbox'
                    }
                ],
                listProjects: async () => []
            },
            pipeline,
            {
                pollMinutes: 5,
                autoApplyLifeAdmin: true,
                graceWindowMinutes: 0
            }
        );

        const poll = scheduled.find((item) => item.expression.startsWith('*/'));
        assert.ok(poll, 'poll callback should be scheduled');
        await poll.callback();
    } finally {
        cron.schedule = originalSchedule;
    }
}

test('scheduler poll redacts task text when pipeline returns an error result', async () => {
    const logs = [];
    const originalError = console.error;
    console.error = (...args) => logs.push(args.join(' '));
    try {
        await runCapturedPoll({
            pipeline: {
                processMessageWithContext: async () => ({
                    type: 'error',
                    failure: {
                        class: 'validation',
                        summary: 'Secret title should never appear'
                    }
                })
            }
        });
    } finally {
        console.error = originalError;
    }

    const output = logs.join('\n');
    assert.match(output, /Scheduler poll task failed: taskId=poll-secret-task reason=pipeline_validation/);
    assert.doesNotMatch(output, /Secret title should never appear/);
    assert.doesNotMatch(output, /Sensitive content should never appear/);
});

test('scheduler poll redacts thrown error messages', async () => {
    const logs = [];
    const originalError = console.error;
    console.error = (...args) => logs.push(args.join(' '));
    try {
        await runCapturedPoll({
            pipeline: {
                processMessageWithContext: async () => {
                    throw new Error('Sensitive thrown scheduler error');
                }
            }
        });
    } finally {
        console.error = originalError;
    }

    const output = logs.join('\n');
    assert.match(output, /Scheduler poll task failed: taskId=poll-secret-task error=Error/);
    assert.doesNotMatch(output, /Sensitive thrown scheduler error/);
    assert.doesNotMatch(output, /Secret title should never appear/);
});
