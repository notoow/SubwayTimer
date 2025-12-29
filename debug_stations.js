const fs = require('fs');
const content = fs.readFileSync('stations.js', 'utf8');

// Mock DOM elements/functions if needed, but stations.js is mostly data.
// It uses `const`. We can eval it in global scope.
try {
    eval(content + "\n;global.STATIONS = STATIONS; global.LINE_COLORS = LINE_COLORS; global.LINE_NAMES = LINE_NAMES;");

    console.log("=== Yeonsinnae Search Check ===");
    const matches = global.STATIONS.filter(s => s.name === '연신내');
    console.log(JSON.stringify(matches, null, 2));

    console.log("\n=== Line Colors Check ===");
    matches.forEach(m => {
        const color = global.LINE_COLORS[m.line];
        const name = global.LINE_NAMES[m.line] || m.line;
        console.log(`Line: ${m.line}, Color: ${color}, Name: ${name}`);
    });

} catch (e) {
    console.error(e);
}
