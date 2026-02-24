import dotenv from 'dotenv';
dotenv.config();

import { GeminiAnalyzer } from './services/gemini.js';

async function run() {
    const analyzer = new GeminiAnalyzer();
    try {
        console.log('Testing handleFreeform...');
        const res = await analyzer.handleFreeform('I am overwhelmed, what should I do?');
        console.log('Success, Output Type:', typeof res);
        console.log(res);
    } catch (e) {
        console.error('Failed:', e);
    }
}

run();
