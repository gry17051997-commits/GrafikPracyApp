const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'GrafikPracy_Final', 'App.js');
if (!fs.existsSync(file)) process.exit(0);

let s = fs.readFileSync(file, 'utf8');

// Keep only the first updateShift declaration. Repeated copies make Babel
// see later returns as being outside App().
const updateShiftRe = /\n  const updateShift = \(dayIndex,shiftIndex,patch\) => \{[\s\S]*?\n  \};\n/g;
let updateShiftSeen = false;
s = s.replace(updateShiftRe, match => {
  if (!updateShiftSeen) {
    updateShiftSeen = true;
    return match;
  }
  return '\n';
});

// Remove duplicate condition synchronization.
s = s.replace(
  "      if (data.conditions) setConditions(data.conditions);\n      if (data.conditions) setConditions(data.conditions);",
  "      if (data.conditions) setConditions(data.conditions);"
);

// Fix cloud save error handler using an undefined e variable.
s = s.replace(
  "setDoc(doc(db,'schedules','main'),payload,{merge:true}).catch(()=>setCloudError('Nie udało się zapisać grafiku online. Kod: ' + (e?.code || 'nieznany')));",
  "setDoc(doc(db,'schedules','main'),payload,{merge:true}).catch(e=>setCloudError('Nie udało się zapisać grafiku online. Kod: ' + (e?.code || 'nieznany')));"
);

// Fix the table cell variable and employee filtering in the main card view.
s = s.replace(
  "const p = s.person && (personFilter==='all' || s.person===personFilter) ? PEOPLE[s.person] : null;",
  "const p = s.person ? PEOPLE[s.person] : null;"
);

// Fix the compact table cell so p is always defined.
s = s.replace(
  "const sh=d.shifts[si]; return <TouchableOpacity key={si} disabled={forExport || dayHasPassed(i)} onPress={()=>!readOnly && !dayHasPassed(i) && setEdit({dayIndex:i,shiftIndex:si})} style={[S.tableCell,S.tableShiftCell,S.tableShift,sh.person===personFilter||personFilter==='all'?{backgroundColor:personColor(sh.person)}:{}]}",
  "const sh=d.shifts[si]; const p=sh.person && (personFilter==='all' || sh.person===personFilter) ? PEOPLE[sh.person] : null; return <TouchableOpacity key={si} disabled={forExport || dayHasPassed(i)} onPress={()=>!readOnly && !dayHasPassed(i) && setEdit({dayIndex:i,shiftIndex:si})} style={[S.tableCell,S.tableShiftCell,S.tableShift,p?{backgroundColor:personColor(sh.person)}:{}]}"
);

// Employees may not regenerate or change their profile identity.
s = s.replace("onPress={regenerate}", "onPress={()=>!readOnly && regenerate()}");
s = s.replace(
  "<TouchableOpacity key={k} style={[S.chip,myPerson===k&&{backgroundColor:personColor(k)}]} onPress={async()=>{setMyPerson(k);",
  "<TouchableOpacity key={k} disabled={readOnly} style={[S.chip,myPerson===k&&{backgroundColor:personColor(k)}]} onPress={async()=>{if(readOnly)return;setMyPerson(k);"
);

// Give employees an explicit swap entry point.
const swapAnchor = `      <TouchableOpacity style={S.swapBtn} onPress={()=>setTab('ustawienia')}>
        <Text style={S.btnText}>🔄 Zamiana i edycja zmian</Text>
      </TouchableOpacity>`;
const swapPanel = `      <TouchableOpacity style={S.swapBtn} onPress={()=>setTab('ustawienia')}>
        <Text style={S.btnText}>{cloudRole==='admin'?'🔄 Zamiana i edycja zmian':'🔄 ZGŁOŚ ZAMIANĘ'}</Text>
      </TouchableOpacity>
      {FIREBASE_ENABLED && cloudRole!=='admin' && <Text style={S.helpLine}>Aby zgłosić zamianę, wybierz swoją zmianę poniżej i naciśnij „🔄 Zaproponuj zamianę”.</Text>}`;
if (s.includes(swapAnchor)) s = s.replace(swapAnchor, swapPanel);

// PDF export: apply configured employee colors to occupied cells.
s = s.replace(
  "return `<td><b>${escapeHtml(name)}</b><br><span>${escapeHtml(wh)}</span><br><span>${visible?escapeHtml(shiftTime(times,si+1)):''}</span></td>`;",
  "const bg=visible?personColor(s.person):'#fff'; const fg=visible?contrastText(bg):'#111'; return `<td style=\"background:${bg};color:${fg}\"><b>${escapeHtml(name)}</b><br><span style=\"color:${fg};opacity:.78\">${escapeHtml(wh)}</span><br><span style=\"color:${fg};opacity:.78\">${visible?escapeHtml(shiftTime(times,si+1)):''}</span></td>`;"
);

fs.writeFileSync(file, s);
console.log('Grafik Pracy build patch applied');
