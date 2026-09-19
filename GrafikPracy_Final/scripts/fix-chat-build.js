const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(process.cwd(), 'GrafikPracy_Final', 'App.js'),
  path.join(process.cwd(), 'App.js')
];
const file = candidates.find(p => fs.existsSync(p));
if (!file) process.exit(0);

let s = fs.readFileSync(file, 'utf8');

// The chat JSX block was previously committed with literal "\\n" sequences.
// Convert only that block so legitimate "\\n" inside JavaScript strings are untouched.
const chatStart = s.indexOf('  const chat = (\\n');
const chatEnd = s.indexOf('  const summary = (', chatStart);
if (chatStart >= 0 && chatEnd > chatStart) {
  const block = s.slice(chatStart, chatEnd).replace(/\\n/g, '\n');
  s = s.slice(0, chatStart) + block + s.slice(chatEnd);
}

// Keep the StyleSheet object syntactically valid.
s = s.replace(
  "reportCard:{backgroundColor:'rgba(25,29,38,0.94)',borderRadius:14,padding:12,marginBottom:8,borderWidth:1,borderColor:'#2b3240'}\\n  overlay:",
  "reportCard:{backgroundColor:'rgba(25,29,38,0.94)',borderRadius:14,padding:12,marginBottom:8,borderWidth:1,borderColor:'#2b3240'},\\n  overlay:"
);

fs.writeFileSync(file, s);
console.log('Chat build fixes applied');
