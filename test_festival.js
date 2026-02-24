import { GeminiAnalyzer } from './services/gemini.js';
import fs from 'fs';

const analyzer = new GeminiAnalyzer("AIzaSyCRy8o1lzejLVmmNLzBkDXXH4Vamp9-BLk");

async function test() {
    console.log("Sending Festival Freeform Context...");
    const prompt = `I want to add this to my task list\n\nAttend The Festival of AI and AI for Business which is a round table networking event with employers will be taking place next Tuesday 3rd March, 12-1.30 pm.  Please see details below;  Date: Tuesday 3rd March  Time: 12-1.30 pm  Location: The Atrium, Main Campus NCI  Employers Confirmed: Management and Technology Consultancy | BearingPoint Ireland, ETH Dublin 2026, Skillwell, CeADAR | Ireland's Centre for AI, BNY | Global Financial Services - APAC Region, PFH Technology Group, Ireland's largest ICT and Managed Services Company. Please research the companies attending and please prepare questions to ask related to recruitment, technologies, how AI is driving business, tips on how to stand out as a fresher/graduate etc. Please register your attendance as it is first come first serve. Places will be limited.`;

    const projects = [{ id: "64bfabcd", name: "Career & Job Search" }];
    const tasks = Array.from({ length: 5 }, (_, i) => ({
        id: `mockId_${i}`,
        title: `Mock existing task number ${i} regarding standard life admin or coding tasks`,
        projectName: "Inbox"
    }));

    try {
        console.log("Passing 5 mocked tasks...");
        const response = await analyzer.handleFreeform(prompt, tasks, projects);
        fs.writeFileSync('test_output.json', JSON.stringify(response, null, 2), 'utf8');
        console.log("Written to test_output.json");
    } catch (e) {
        console.error("Test execution failed with error:", e);
    }
}

test();
