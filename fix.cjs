const fs = require('fs');
let lines = fs.readFileSync('bot/commands.js', 'utf8').split('\n');

const commands = [
    'cmdScan', 'cmdPending', 'cmdReview', 'cmdBriefing', 'cmdDailyClose',
    'cmdWeekly', 'cmdReorg', 'cmdStatus', 'cmdUrgent', 'cmdFocus', 'cmdNormal'
];

let inCmd = null;

for (let i = 0; i < lines.length; i++) {
    for (const cmd of commands) {
        if (lines[i].includes(`const ${cmd} = async (ctx) => {`)) {
            inCmd = cmd;
            break;
        }
    }
    
    // If we're inside an extracted command block and we see the closing "    });", replace it with "    };"
    if (inCmd && lines[i] === '    });') {
        // Double check it's the right closing block - usually preceded by some logic
        lines[i] = '    };';
        inCmd = null; // we closed the block
    }
}

fs.writeFileSync('bot/commands.js', lines.join('\n'));
