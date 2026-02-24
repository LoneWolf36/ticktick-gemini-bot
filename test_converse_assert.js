import { GoogleGenerativeAI } from '@google/generative-ai';
import { converseSchema } from './services/schemas.js';

const apiKey = "AIzaSyAEm15k1hokuDnKqhCW6xjrRqRzRNRG6co";
const genAI = new GoogleGenerativeAI(apiKey);

async function test() {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: "Classify user intent. Ask clarifying questions if unclear. Output ONLY JSON.",
        generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
            responseSchema: converseSchema,
        },
    });

    try {
        console.log("Testing Action Mode...");
        const result = await model.generateContent("Create a task to buy milk later today");
        console.log(result.response.text());

        console.log("\nTesting Clarify Mode...");
        const result2 = await model.generateContent("Update that thing for me");
        console.log(result2.response.text());

    } catch (e) {
        console.error("ERROR:", e.message);
    }
}

test();
