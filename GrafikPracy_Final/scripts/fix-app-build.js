const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'GrafikPracy_Final', 'App.js');
if (!fs.existsSync(file)) process.exit(0);

let s = fs.readFileSync(file, 'utf8');

// Remove an accidental duplicate updateShift block that was left outside the function.
const stray = `\n    if (readOnly || dayHasPassed(dayIndex)) return;\n    setWeek(w => {\n      w[dayIndex].shifts[shiftIndex] = {\n        ...w[dayIndex].shifts[shiftIndex],\n        ...patch,\n        manual:true\n      };\n      return w;\n    });\n  };\n`;
if (s.includes(stray)) s = s.replace(stray, '\n');

// The table renderer must define the employee variable locally.
const oldTable = `const sh=d.shifts[si]; return <TouchableOpacity key={si} disabled={forExport || dayHasPassed(i)} onPress={()=>!readOnly && !dayHasPassed(i) && setEdit({dayIndex:i,shiftIndex:si})} style={[S.tableCell,S.tableShiftCell,S.tableShift,sh.person===personFilter||personFilter==='all'?{backgroundColor:personColor(sh.person)}:{}]}>\n            <Text style={[S.tablePerson,p&&{color:contrastText(personColor(sh.person))}]}>{p ? p.name : 'WOLNA'}</Text>\n            <Text style={[S.tableMeta,p&&{color:contrastText(personColor(sh.person)),opacity:0.78}]}>{p ? (sh.warehouse || d.warehouse || warehouse) : ''}</Text>\n            <Text style={[S.tableMeta,p&&{color:contrastText(personColor(sh.person)),opacity:0.78}]}>{p ? shiftTime(times,si+1) : ''}</Text>`;
const newTable = `const sh=d.shifts[si]; const p=sh.person && (personFilter==='all' || sh.person===personFilter) ? PEOPLE[sh.person] : null; return <TouchableOpacity key={si} disabled={forExport || dayHasPassed(i)} onPress={()=>!readOnly && !dayHasPassed(i) && setEdit({dayIndex:i,shiftIndex:si})} style={[S.tableCell,S.tableShiftCell,S.tableShift,p?{backgroundColor:personColor(sh.person)}:{}]}>\n            <Text style={[S.tablePerson,p&&{color:contrastText(personColor(sh.person))}]}>{p ? p.name : 'WOLNA'}</Text>\n            <Text style={[S.tableMeta,p&&{color:contrastText(personColor(sh.person)),opacity:0.78}]}>{p ? (sh.warehouse || d.warehouse || warehouse) : ''}</Text>\n            <Text style={[S.tableMeta,p&&{color:contrastText(personColor(sh.person)),opacity:0.78}]}>{p ? shiftTime(times,si+1) : ''}</Text>`;
if (s.includes(oldTable)) s = s.replace(oldTable, newTable);

// Preserve the actual Firestore error code instead of referencing an undefined variable.
s = s.replace(
  "setDoc(doc(db,'schedules','main'),payload,{merge:true}).catch(()=>setCloudError('Nie udało się zapisać grafiku online. Kod: ' + (e?.code || 'nieznany')));",
  "setDoc(doc(db,'schedules','main'),payload,{merge:true}).catch(e=>setCloudError('Nie udało się zapisać grafiku online. Kod: ' + (e?.code || 'nieznany')));"
);

fs.writeFileSync(file, s);
console.log('Grafik Pracy build patch applied');
