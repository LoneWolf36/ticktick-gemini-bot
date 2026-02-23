import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

async function listModels() {
    let rawKeys = process.env.GEMINI_API_KEYS;
    if (!rawKeys && process.env.GEMINI_API_KEY) {
        rawKeys = process.env.GEMINI_API_KEY;
    }
    const apiKeys = rawKeys ? rawKeys.split(',').map(k => k.trim()).filter(Boolean) : [];
    if (apiKeys.length === 0) { console.error("No keys"); return; }

    console.log(`Using Key: ${apiKeys[0].slice(0, 4)}...`);
    const genAI = new GoogleGenerativeAI(apiKeys[0]);

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKeys[0]}`);
        const data = await response.json();
        console.log("AVAILABLE MODELS:");
        data.models.forEach(m => {
            if (m.name.includes('flash')) {
                console.log(`- ${m.name}`);
            }
        });
    } catch (err) {
        console.error("Failed", err);
    }
}
listModels();
