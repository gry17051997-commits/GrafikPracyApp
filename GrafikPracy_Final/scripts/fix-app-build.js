const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'GrafikPracy_Final', 'App.js');
if (!fs.existsSync(file)) process.exit(0);

let s = fs.readFileSync(file, 'utf8');

const stray = `
    if (readOnly || dayHasPassed(dayIndex)) return;
    setWeek(w => {
      w[dayIndex].shifts[shiftIndex] = {
        ...w[dayIndex].shifts[shiftIndex],
        ...patch,
        manual:true
      };
      return w;
    });
  };
`;
if (s.includes(stray)) s = s.replace(stray, '\n');

const oldTable = `const sh=d.shifts[si]; return <TouchableOpacity key={si} disabled={forExport || dayHasPassed(i)} onPress={()=>!readOnly && !dayHasPassed(i) && setEdit({dayIndex:i,shiftIndex:si})} style={[S.tableCell,S.tableShiftCell,S.tableShift,sh.person===personFilter||personFilter==='all'?{backgroundColor:personColor(sh.person)}:{}]}>
            <Text style={[S.tablePerson,p&&{color:contrastText(personColor(sh.person))}]}>{p ? p.name : 'WOLNA'}</Text>
            <Text style={[S.tableMeta,p&&{color:contrastText(personColor(sh.person)),opacity:0.78}]}>{p ? (sh.warehouse || d.warehouse || warehouse) : ''}</Text>
            <Text style={[S.tableMeta,p&&{color:contrastText(personColor(sh.person)),opacity:0.78}]}>{p ? shiftTime(times,si+1) : ''}</Text>`;
const newTable = `const sh=d.shifts[si]; const p=sh.person ? PEOPLE[sh.person] : null; return <TouchableOpacity key={si} disabled={forExport || dayHasPassed(i)} onPress={()=>!readOnly && !dayHasPassed(i) && setEdit({dayIndex:i,shiftIndex:si})} style={[S.tableCell,S.tableShiftCell,S.tableShift,p?{backgroundColor:personColor(sh.person)}:{}]}>
            <Text style={[S.tablePerson,p&&{color:contrastText(personColor(sh.person))}]}>{p ? p.name : 'WOLNA'}</Text>
            <Text style={[S.tableMeta,p&&{color:contrastText(personColor(sh.person)),opacity:0.78}]}>{p ? (sh.warehouse || d.warehouse || warehouse) : ''}</Text>
            <Text style={[S.tableMeta,p&&{color:contrastText(personColor(sh.person)),opacity:0.78}]}>{p ? shiftTime(times,si+1) : ''}</Text>`;
if (s.includes(oldTable)) s = s.replace(oldTable, newTable);

const oldCard = `const p = s.person && (personFilter==='all' || s.person===personFilter) ? PEOPLE[s.person] : null;`;
const newCard = `const p = s.person ? PEOPLE[s.person] : null;`;
if (s.includes(oldCard)) s = s.replace(oldCard, newCard);

s = s.replace(
  "setDoc(doc(db,'schedules','main'),payload,{merge:true}).catch(()=>setCloudError('Nie udało się zapisać grafiku online. Kod: ' + (e?.code || 'nieznany')));",
  "setDoc(doc(db,'schedules','main'),payload,{merge:true}).catch(e=>setCloudError('Nie udało się zapisać grafiku online. Kod: ' + (e?.code || 'nieznany')));"
);

s = s.replace("      if (data.conditions) setConditions(data.conditions);\n      if (data.conditions) setConditions(data.conditions);", "      if (data.conditions) setConditions(data.conditions);");

// Generator remains disabled for employees; changing table/card view and opening export remain allowed.
s = s.replace("onPress={regenerate}", "onPress={()=>!readOnly && regenerate()}");

// PDF export: apply configured employee colors to occupied cells.
s = s.replace(
  "return `<td><b>${escapeHtml(name)}</b><br><span>${escapeHtml(wh)}</span><br><span>${visible?escapeHtml(shiftTime(times,si+1)):''}</span></td>`;",
  "const bg=visible?personColor(s.person):'#fff'; const fg=visible?contrastText(bg):'#111'; return `<td style=\"background:${bg};color:${fg}\"><b>${escapeHtml(name)}</b><br><span style=\"color:${fg};opacity:.78\">${escapeHtml(wh)}</span><br><span style=\"color:${fg};opacity:.78\">${visible?escapeHtml(shiftTime(times,si+1)):''}</span></td>`;"
);

fs.writeFileSync(file, s);
console.log('Grafik Pracy build patch applied');
