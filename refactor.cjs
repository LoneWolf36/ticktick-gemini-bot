const fs = require('fs');
let code = fs.readFileSync('bot/commands.js', 'utf8');

const commandsToExtract = [
    'scan', 'pending', 'review', 'briefing', 'daily_close', 
    'weekly', 'reorg', 'status', 'urgent', 'focus', 'normal'
];

for (const cmd of commandsToExtract) {
    const fnName = 'cmd' + cmd.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    code = code.replace(`bot.command('${cmd}', async (ctx) => {`, `const ${fnName} = async (ctx) => {`);
}

// Now add the bot.command bindings right before the callbackQuery
const bindings = commandsToExtract.map(cmd => {
    const fnName = 'cmd' + cmd.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    return `    bot.command('${cmd}', ${fnName});`;
}).join('\n');

const handlerMapCode = `
    const handlers = {
        scan: cmdScan,
        pending: cmdPending,
        review: cmdReview,
        briefing: cmdBriefing,
        daily_close: cmdDailyClose,
        weekly: cmdWeekly,
        reorg: cmdReorg,
        status: cmdStatus,
        urgent: cmdUrgent,
        focus: cmdFocus,
        normal: cmdNormal,
    };
`;

code = code.replace(/bot\.callbackQuery\(\/\^menu:\(\.\+\)\$\/, async \(ctx\) => \{\n.*?const typed = map\[cmd\];\n\s+if \(\!typed\) return;\n\s+await ctx\.reply\(typed\);\n\s+\}\);/s, 
`${bindings}
${handlerMapCode}
    bot.callbackQuery(/^menu:(.+)$/, async (ctx) => {
        if (!isAuthorized(ctx)) {
            await ctx.answerCallbackQuery({ text: '🔒 Unauthorized' });
            return;
        }
        const cmd = ctx.match[1];
        await ctx.answerCallbackQuery();
        
        if (handlers[cmd]) {
            await handlers[cmd](ctx);
        }
    });`);

fs.writeFileSync('bot/commands.js', code);
