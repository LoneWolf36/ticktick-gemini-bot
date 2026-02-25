import { SchemaType } from '@google/generative-ai';

export const analyzeSchema = {
    type: SchemaType.OBJECT,
    properties: {
        improved_title: { type: SchemaType.STRING, description: "Clear execution-ready title. Must be verb-first and concise." },
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
        mode: { type: SchemaType.STRING, enum: ["action", "coach", "clarify"], description: "CRITICAL: If the user specifically asks to 'add to task list', 'create', or 'remind me', you MUST select 'action' mode, even if they also ask for advice or tips." },
        summary: { type: SchemaType.STRING, description: "A simple 1-line technical confirmation of execution (e.g. 'Parsed 3 tasks.'). Do NOT provide coaching or advice here.", nullable: true },
        response: { type: SchemaType.STRING, description: "Direct, short Telegram-style response without repetition. MAX 3 SENTENCES. DO NOT output stringified JSON or task arrays here. (Required if mode=coach or clarify)", nullable: true },
        actions: {
            type: SchemaType.ARRAY,
            description: "List of commands. If the user asks for multiple completely different tasks, output multiple distinct 'create' actions. CRITICAL rules: For any individual task you create, you MUST populate the 'content' field with all verbose details! Do not bypass the 'content' field. NEVER try to update a task you just created.",
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    type: { type: SchemaType.STRING, enum: ["update", "drop", "create", "complete"] },
                    taskId: { type: SchemaType.STRING, nullable: true },
                    changes: {
                        type: SchemaType.OBJECT,
                        properties: {
                            title: { type: SchemaType.STRING, description: "Concise action title (Max 10 words). Extract clear task names even from shorthand (e.g. 'uber'). Do not include extraneous context or notes.", nullable: true },
                            content: { type: SchemaType.STRING, description: "Detailed task context, URLs, dates, locations, notes, or long-form coaching reasoning.", nullable: true },
                            dueDate: { type: SchemaType.STRING, description: "YYYY-MM-DD string, inferred strictly relative to the Current Date context provided. Null if no date is implied.", nullable: true },
                            projectId: { type: SchemaType.STRING, description: "The exact 24-character ID hash of the project from the provided list. Do NOT use the project name.", nullable: true },
                            priority: { type: SchemaType.INTEGER, description: "Must be exactly 0, 1, 3, or 5 if changing", nullable: true }
                        }
                    }
                },
                required: ["type", "changes"]
            },
            nullable: true
        }
    },
    required: ["mode"]
};
