const fs = require('fs');
const path = require('path');

const candidates = [
  path.join(process.cwd(), 'GrafikPracy_Final', 'App.js'),
  path.join(process.cwd(), 'App.js')
];
const file = candidates.find(p => fs.existsSync(p));
if (!file) process.exit(0);

let s = fs.readFileSync(file, 'utf8');

if (!s.includes('const changeRotation = k =>')) {
  const marker = "  const newWeek = () => {\n";
  const fn = `  const changeRotation = k => {\n    if (readOnly) return;\n    setRotation(k);\n    setWeeks(prev => {\n      const existing = prev[wkKey];\n      if (!existing) return {...prev,[wkKey]:generateWeek(k,warehouse)};\n      const next = cloneWeek(existing);\n      next.forEach(d => d.shifts.forEach(s => {\n        if (s.manual || s.locked || s.person === 'L') return;\n        if (s.person === 'P') s.person = 'M';\n        else if (s.person === 'M') s.person = 'P';\n      }));\n      return {...prev,[wkKey]:next};\n    });\n  };\n\n`;
  if (!s.includes(marker)) throw new Error('Rotation insertion marker not found');
  s = s.replace(marker, fn + marker, 1);
}

const old = "onPress={()=>setRotation(k)}";
const replacement = "onPress={()=>changeRotation(k)}";
if (s.includes(old)) {
  s = s.replace(old, replacement);
} else if (!s.includes(replacement)) {
  throw new Error('Rotation switch handler not found');
}

fs.writeFileSync(file, s);
console.log('rotation switch fix applied');
