import assert from 'assert';
import fs from 'fs';

// 1. Truncation Boundary Unit Test
async function testTruncation() {
    const { truncateMessage } = await import('./bot/utils.js');
    console.log("== Testing Boundary Truncation ==");
    let massiveString = "A".repeat(5000);
    let truncated = truncateMessage(massiveString, 4000);
    assert.strictEqual(truncated.length <= 4000 + "\n\n... (truncated)".length, true, "String exceeded maximum API limits");
    console.log("✅ Truncation passed.");
}

// 2. Action Parser Fallback Unit Test
async function testActionParserFallback() {
    const { executeActions } = await import('./bot/commands.js');
    console.log("== Testing Action Parser Update Fallback ==");
    let capturedChanges = null;
    const mockTickTick = {
        updateTask: async (id, changes) => {
            capturedChanges = changes;
            return { id };
        }
    };

    // Malformed Gemini JSON (dueDate on root, no .changes object)
    const request = [{
        type: 'update',
        taskId: 't1',
        dueDate: '2026-03-01'
    }];
    const currentTasks = [{ id: 't1', title: 'Test Task', projectId: 'p1' }];

    await executeActions(request, mockTickTick, currentTasks);
    assert.ok(capturedChanges && capturedChanges.dueDate.includes("2026-03-01"), "Update fallback failed to capture flat-mapped dueDate.");
    console.log("✅ Update parser passed.");
}

// 3. E2E Round-Robin Gemini Call
async function testFullGeminiLoop() {
    console.log("== Testing E2E Gemini Round-Robin with 5 keys ==");

    process.env.GEMINI_API_KEYS = "AIzaSyDUah3NePWUzb9_2ZlAz5SvUzAsthPbIFo,AIzaSyCRy8o1lzejLVmmNLzBkDXXH4Vamp9-BLk,AIzaSyA-R64QRHBEjbBE4QIzMPY3cpXIT2MjDfw,AIzaSyCo-ctOr-wjfpWb1l06Y4frPoD-NNbusBk,AIzaSyA48Vnl6rtb4vxrj_rP545Eq7oRjnqwguA";
    process.env.GEMINI_API_KEY = "";
    process.env.USER_TIMEZONE = "Europe/Dublin";

    const keysList = process.env.GEMINI_API_KEYS.split(',');
    const { GeminiAnalyzer } = await import('./services/gemini.js');
    const gemini = new GeminiAnalyzer(keysList);

    // Inject mock tasks where the "imminent" task is buried at index 60 out of 80 to verify context sorting brings it into scope
    const mockTasks = [];
    for (let i = 0; i < 80; i++) {
        mockTasks.push({ id: `id_${i}`, title: `Garbage Task ${i}` });
    }
    // We expect February 25th to be identified natively as "Tomorrow" if today is Feb 24th UTC (which is practically what the app sees locally). Let's use exact language.
    mockTasks[60] = { id: `id_target`, title: `Critical Core Meeting`, dueDate: `2026-02-25T10:00:00.000` };

    // We send a summarization request. Gemini should see "Critical Core Meeting" in its slice context.
    const result = await gemini.handleFreeform("Summarize my tasks due on 2026-02-25 explicitly! Provide a 5-10 word overview.", mockTasks, []);

    console.log("Gemini Output Mode:", result.mode);
    console.log("Gemini Summary:", result.summary || result.response);

    // It should talk about the meeting
    const responseText = (result.summary || result.response || "").toLowerCase();
    assert.ok(responseText.includes("meeting") || responseText.includes("critical") || responseText.includes("core"), "Gemini did not mention the target object, suggesting it was truncated out of the context entirely due to array sorting failure.");
    console.log("✅ E2E Context Pipeline passed.");
}


async function runAll() {
    let log = "";
    const originalLog = console.log;
    console.log = (...args) => { log += args.join(' ') + '\n'; originalLog(...args); };
    const originalError = console.error;
    console.error = (...args) => { log += args.join(' ') + '\n'; originalError(...args); };

    try {
        await testTruncation();
        await testActionParserFallback();
        await testFullGeminiLoop();
        console.log("🎉 ALL REGRESSION TESTS PASSED!");
    } catch (e) {
        console.error("❌ REGRESSION FAILED:", e.message);
    }
    fs.writeFileSync('regression_log.txt', log);
}

runAll();
