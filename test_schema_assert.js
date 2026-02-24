import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

const apiKey = "AIzaSyAEm15k1hokuDnKqhCW6xjrRqRzRNRG6co";
const genAI = new GoogleGenerativeAI(apiKey);

const analyzeSchema = {
    type: SchemaType.OBJECT,
    properties: {
        improved_title: { type: SchemaType.STRING },
        priority: { type: SchemaType.STRING, enum: ["career-critical", "important", "life-admin", "consider-dropping"] },
        suggested_project: { type: SchemaType.STRING, nullable: true }, // testing nullable
    },
    // Omitting suggested_project to ensure nullable functions correctly
    required: ["improved_title", "priority"]
};

async function test() {
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: "You are a realistic task analyzer.",
        generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
            responseSchema: analyzeSchema,
        },
    });

    try {
        console.log("Testing Standard Model...");
        const result = await model.generateContent("Task: Cancel my netflix subscription.");
        const text = result.response.text();
        const data = JSON.parse(text);

        console.log("Standard JSON valid:", !!data);
        console.log("Nullable property returned exactly as null:", data.suggested_project === null || data.suggested_project === "null");

        console.log("\nTesting Thinking Model...");
        const thinkModel = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction: "You are a realistic task analyzer.",
            generationConfig: {
                temperature: 0.3,
                responseMimeType: "application/json",
                responseSchema: analyzeSchema,
            },
            thinkingConfig: { thinkingBudget: 1024 }
        });

        const result2 = await thinkModel.generateContent("Task: Do Leetcode");
        const text2 = result2.response.text();
        const data2 = JSON.parse(text2);

        console.log("Thinking JSON valid:", !!data2);
        console.log("Thinking parsed data:", JSON.stringify(data2));

    } catch (e) {
        console.error("ERROR:", e.message);
    }
}

test();
