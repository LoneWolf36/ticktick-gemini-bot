import { SchemaType } from '@google/generative-ai';

export const analyzeSchema = {
    type: SchemaType.OBJECT,
    properties: {
        improved_title: { type: SchemaType.STRING, description: "Clear execution-ready title" },
        analysis: { type: SchemaType.STRING, description: "Detailed judgment of why it is prioritized this way." },
        description: { type: SchemaType.STRING, description: "Actionable summary of how to execute the task." },
        sub_steps: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Step-by-step breakdown. Leave explicitly null if the task takes less than 15 minutes.", nullable: true },
        resources: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "Verbatim extraction of any links, notes, or URLs from the original task context.", nullable: true },
        priority: { type: SchemaType.STRING, enum: ["career-critical", "important", "life-admin", "consider-dropping"] },
        priority_emoji: { type: SchemaType.STRING, enum: ["🔴", "🟡", "🟢", "⚪"], description: "Match exactly with priority: career-critical=🔴, important=🟡, life-admin=🟢, consider-dropping=⚪" },
        needle_mover: { type: SchemaType.BOOLEAN, description: "True if this task meaningfully advances career, DSA, or interview skills." },
        success_criteria: { type: SchemaType.STRING, description: "A clear definition of 'done' for this specific task." },
        callout: { type: SchemaType.STRING, description: "A direct, bold, confronting, yet encouraging push against procrastination. Telegram formatted with *asterisks*." },
        suggested_project: { type: SchemaType.STRING, nullable: true },
        suggested_schedule: { type: SchemaType.STRING, enum: ["today", "tomorrow", "this-week", "next-week", "someday"], nullable: true }
    },
    // We omit suggested_project and suggested_schedule from required to avoid API hallucination crashes on sparse tasks.
    required: ["improved_title", "analysis", "description", "sub_steps", "resources", "priority", "priority_emoji", "needle_mover", "success_criteria", "callout"]
};

export const converseSchema = {
    type: SchemaType.OBJECT,
    properties: {
        mode: { type: SchemaType.STRING, enum: ["action", "coach", "clarify"] },
        summary: { type: SchemaType.STRING, description: "Short summary of what was changed (Required if mode=action)", nullable: true },
        response: { type: SchemaType.STRING, description: "Direct, short Telegram-style coaching response using **asterisks** for bold. (Required if mode=coach or clarify)", nullable: true },
        actions: {
            type: SchemaType.ARRAY,
            description: "List of updates to make to TickTick. Leave empty if no action needed.",
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    type: { type: SchemaType.STRING, enum: ["update", "drop", "create", "complete"] },
                    taskId: { type: SchemaType.STRING, nullable: true },
                    changes: {
                        type: SchemaType.OBJECT,
                        properties: {
                            title: { type: SchemaType.STRING, nullable: true },
                            dueDate: { type: SchemaType.STRING, description: "YYYY-MM-DD", nullable: true },
                            projectId: { type: SchemaType.STRING, nullable: true },
                            priority: { type: SchemaType.INTEGER, description: "Must be exactly 0, 1, 3, or 5 if changing", nullable: true }
                        }
                    }
                },
                required: ["type"]
            },
            nullable: true
        }
    },
    required: ["mode"]
};
