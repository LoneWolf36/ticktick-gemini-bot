import { SchemaType } from '@google/generative-ai';


export const reorgSchema = {
    type: SchemaType.OBJECT,
    properties: {
        summary: { type: SchemaType.STRING, description: "Brief explanation of what was reorganized and why." },
        questions: {
            type: SchemaType.ARRAY,
            items: { type: SchemaType.STRING },
            description: "Clarifying questions for ambiguous/high-risk tasks.",
            nullable: true
        },
        actions: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    type: { type: SchemaType.STRING, enum: ["update", "drop", "create", "complete"] },
                    taskId: { type: SchemaType.STRING, nullable: true },
                    changes: {
                        type: SchemaType.OBJECT,
                        properties: {
                            title: { type: SchemaType.STRING, nullable: true },
                            content: { type: SchemaType.STRING, nullable: true },
                            dueDate: { type: SchemaType.STRING, nullable: true },
                            scheduleBucket: { type: SchemaType.STRING, enum: ["today", "tomorrow", "this-week", "next-week", "someday"], nullable: true },
                            projectId: { type: SchemaType.STRING, nullable: true },
                            priority: { type: SchemaType.INTEGER, nullable: true }
                        }
                    }
                },
                required: ["type", "changes"]
            }
        }
    },
    required: ["summary", "actions"]
};
