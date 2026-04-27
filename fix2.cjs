const fs = require('fs');
let code = fs.readFileSync('bot/commands.js', 'utf8');

const commands = [
    'cmdScan', 'cmdPending', 'cmdReview', 'cmdBriefing', 'cmdDailyClose',
    'cmdWeekly', 'cmdReorg', 'cmdStatus', 'cmdUrgent', 'cmdFocus', 'cmdNormal'
];

for (const cmd of commands) {
    code = code.replace(`const ${cmd} = async (ctx) => {`, `async function ${cmd}(ctx) {`);
}

fs.writeFileSync('bot/commands.js', code);
