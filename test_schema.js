import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const apiKey = "AIzaSyAEm15k1hokuDnKqhCW6xjrRqRzRNRG6co";
const genAI = new GoogleGenerativeAI(apiKey);

const analyzeSchema = {
    type: SchemaType.OBJECT,
    properties: {
        improved_title: { type: SchemaType.STRING, description: "Clear execution-ready title" },
        analysis: { type: SchemaType.STRING, description: "1-2 sentence judgment" },
        priority: { type: SchemaType.STRING, enum: ["career-critical", "important", "life-admin", "consider-dropping"] },
        needle_mover: { type: SchemaType.BOOLEAN },
        suggested_project: { type: SchemaType.STRING, nullable: true }, // testing nullable
    },
    // Omitting suggested_project to ensure nullable functions correctly
    required: ["improved_title", "analysis", "priority", "needle_mover"]
};

async function test() {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: "You are a realistic task analyzer. Evaluate the task for a software engineer.",
        generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
            responseSchema: analyzeSchema,
        },
    });

    try {
        console.log("Sending request to standard model (no thinkingConfig)...");
        const result = await model.generateContent("Task: Do 15 puzzle problem in C++ to practice A* algorithm");
        console.log("SUCCESS:");
        console.log(result.response.text());

        console.log("\nTesting with thinkingConfig...");
        const thinkModel = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: "You are a realistic task analyzer. Evaluate the task for a software engineer.",
            generationConfig: {
                temperature: 0.3,
                responseMimeType: "application/json",
                responseSchema: analyzeSchema,
            },
            thinkingConfig: { thinkingBudget: 1024 }
        });

        const result2 = await thinkModel.generateContent("Task: Cancel my netflix subscription");
        console.log("SUCCESS (Thinking):");
        console.log(result2.response.text());

    } catch (e) {
        console.error("ERROR:", e);
    }
}

test();
