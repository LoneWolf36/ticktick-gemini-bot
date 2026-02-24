import { GeminiAnalyzer } from './services/gemini.js';

async function testContextSorting() {
    let capturedPrompt = "";

    // Instantiate analyzer
    const gemini = new GeminiAnalyzer();

    // Mock the chart model to capture the final LLM prompt string instead of hitting Google
    gemini.chatModel = {
        generateContent: async (prompt) => {
            capturedPrompt = prompt;
            return {
                response: { text: () => "{}" }
            };
        }
    };

    // Create 55 tasks. Task #55 has a due date.
    const tasks = [];
    for (let i = 0; i < 55; i++) {
        tasks.push({
            id: `task${i}`,
            title: `Task ${i}`,
            dueDate: i === 54 ? '2026-02-24T23:59:00.000+0000' : null
        });
    }

    try {
        await gemini.handleFreeform("What is due today?", tasks, []);
    } catch (e) {
        // Ignore JSON parse errors since we mock return {}
    }

    console.log("Captured Prompt length:", capturedPrompt.length);

    if (!capturedPrompt.includes('2026-02-24')) {
        throw new Error("TDD-RED: Data loss occurred! The due date string was missing entirely, verifying Gemini is blind.");
    }
    if (!capturedPrompt.includes('Task 54')) {
        throw new Error("TDD-RED: Data loss occurred! Task 54 (which had a due date) was pushed out of the slice limit before it could reach the LLM.");
    }
}

async function runAll() {
    try {
        console.log("== TDD Phase: RED (Executing Summarize Context Test) ==");
        await testContextSorting();
        console.log("TEST PASSED!");
    } catch (e) {
        console.error(e.message);
    }
}

runAll();
