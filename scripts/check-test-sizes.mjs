import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const TEST_ROOT = new URL('../tests/', import.meta.url);
const MAX_LINES = Number(process.env.MAX_TEST_FILE_LINES || 1500);

async function collectTestFiles(dirUrl, files = []) {
    const entries = await readdir(dirUrl, { withFileTypes: true });

    for (const entry of entries) {
        const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl);
        if (entry.isDirectory()) {
            await collectTestFiles(entryUrl, files);
            continue;
        }

        if (/\.test\.(js|mjs)$/.test(entry.name)) {
            files.push(entryUrl);
        }
    }

    return files;
}

async function countLines(fileUrl) {
    const content = await readFile(fileUrl, 'utf8');
    return content.split(/\n/).length;
}

const testFiles = await collectTestFiles(TEST_ROOT);
const offenders = [];

for (const fileUrl of testFiles) {
    const lineCount = await countLines(fileUrl);
    if (lineCount > MAX_LINES) {
        offenders.push({
            file: path.relative(process.cwd(), fileUrl.pathname),
            lineCount,
        });
    }
}

if (offenders.length > 0) {
    console.error(`Test size guard failed. Max allowed lines per test file: ${MAX_LINES}.`);
    for (const offender of offenders) {
        console.error(`- ${offender.file}: ${offender.lineCount} lines`);
    }
    process.exit(1);
}

console.log(`Test size guard passed. ${testFiles.length} files checked (max ${MAX_LINES} lines).`);
