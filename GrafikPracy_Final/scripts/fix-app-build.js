const fs = require('fs');
const path = require('path');
const candidates = [path.join(process.cwd(),'GrafikPracy_Final','App.js'),path.join(process.cwd(),'App.js')];
const file = candidates.find(p => fs.existsSync(p));
if (!file) process.exit(0);
let s = fs.readFileSync(file,'utf8');
const updateShiftRe = /\n  const updateShift = \(dayIndex,shiftIndex,patch\) => \{[\s\S]*?\n  \};\n/g;
let seen=false;
s=s.replace(updateShiftRe,m=>{if(!seen){seen=true;return m;}return '\n';});
s=s.replace(/\n\s*if \(readOnly \|\| dayHasPassed\(dayIndex\)\) return;\n\s*setWeek\(w => \{[\s\S]*?\n\s*\};\n/,'\n');
s=s.replace("      if (data.conditions) setConditions(data.conditions);\n      if (data.conditions) setConditions(data.conditions);","      if (data.conditions) setConditions(data.conditions);");
s=s.replace("setDoc(doc(db,'schedules','main'),payload,{merge:true}).catch(()=>setCloudError('Nie udało się zapisać grafiku online. Kod: ' + (e?.code || 'nieznany')));","setDoc(doc(db,'schedules','main'),payload,{merge:true}).catch(e=>setCloudError('Nie udało się zapisać grafiku online. Kod: ' + (e?.code || 'nieznany')));");
s=s.replace("const p = s.person && (personFilter==='all' || s.person===personFilter) ? PEOPLE[s.person] : null;","const p = s.person ? PEOPLE[s.person] : null;");
s=s.replace("onPress={regenerate}","onPress={()=>!readOnly && regenerate()}");
s=s.replace("<TouchableOpacity key={k} style={[S.chip,myPerson===k&&{backgroundColor:personColor(k)}]} onPress={async()=>{setMyPerson(k);","<TouchableOpacity key={k} disabled={readOnly} style={[S.chip,myPerson===k&&{backgroundColor:personColor(k)}]} onPress={async()=>{if(readOnly)return;setMyPerson(k);");
s=s.replace("onPress={()=>setRotation(k)}","onPress={()=>!readOnly && setRotation(k)}");
s=s.replace("onChangeText={v=>setTimes(t=>({...t,s1:v}))}","onChangeText={v=>!readOnly && setTimes(t=>({...t,s1:v}))}");
s=s.replace("onChangeText={v=>setTimes(t=>({...t,e1:v}))}","onChangeText={v=>!readOnly && setTimes(t=>({...t,e1:v}))}");
s=s.replace("onChangeText={v=>setTimes(t=>({...t,s2:v}))}","onChangeText={v=>!readOnly && setTimes(t=>({...t,s2:v}))}");
s=s.replace("onChangeText={v=>setTimes(t=>({...t,e2:v}))}","onChangeText={v=>!readOnly && setTimes(t=>({...t,e2:v}))}");
s=s.replace("!dayHasPassed(di) && s.person && (cloudRole==='admin' || s.person===myPerson)","!dayHasPassed(di) && s.person");

// Live dashboard helpers.
if(!s.includes('const liveShiftInfo = useMemo')){
  const code=`\n  const [dashboardNow,setDashboardNow] = useState(new Date());\n  useEffect(()=>{const id=setInterval(()=>setDashboardNow(new Date()),1000);return()=>clearInterval(id);},[]);\n  const parseShiftDate=(base,si)=>{const st=si===0?times.s1:times.s2,en=si===0?times.e1:times.e2;const [sh,sm]=String(st||'00:00').split(':').map(Number),[eh,em]=String(en||'00:00').split(':').map(Number);const start=new Date(base);start.setHours(sh||0,sm||0,0,0);const end=new Date(base);end.setHours(eh||0,em||0,0,0);if(end<=start)end.setDate(end.getDate()+1);return {start,end};};\n  const liveShiftInfo=useMemo(()=>{const all=[],base=monday(dashboardNow);[0,1].forEach(wo=>{const ws=addDays(base,wo*7),w=weeks[iso(ws)]||[];(w||[]).forEach((d,di)=>(d.shifts||[]).forEach((sh,si)=>{if(!sh.person)return;const dt=parseShiftDate(addDays(ws,di),si);all.push({person:sh.person,warehouse:sh.warehouse||d.warehouse||warehouse,start:dt.start,end:dt.end,day:di,date:addDays(ws,di),slot:si+1});}));});return {active:all.filter(x=>dashboardNow>=x.start&&dashboardNow<x.end).sort((a,b)=>a.end-b.end)[0]||null,next:all.filter(x=>x.start>dashboardNow).sort((a,b)=>a.start-b.start)[0]||null};},[weeks,warehouse,times,dashboardNow]);\n  const dashboardCountdown=end=>{if(!end)return '';const sec=Math.max(0,Math.floor((end.getTime()-dashboardNow.getTime())/1000));return String(Math.floor(sec/3600)).padStart(2,'0')+':'+String(Math.floor(sec%3600/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');};\n`;
  const r=s.indexOf('  return (');
  if(r>=0){s=s.slice(0,r)+code+s.slice(r);}
}

// Put the dashboard at the top of the main content. It is read-only and updates every second.
if(!s.includes('KTO TERAZ PRACUJE')){
  const card=`<View style={S.proposalCard}><Text style={S.section}>🟢 KTO TERAZ PRACUJE?</Text>{liveShiftInfo.active?<><Text style={S.title}>{PEOPLE[liveShiftInfo.active.person]?.name||liveShiftInfo.active.person}</Text><Text style={S.helpLine}>📦 Magazyn: {liveShiftInfo.active.warehouse}</Text><Text style={S.helpLine}>🕐 {liveShiftInfo.active.start.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} – {liveShiftInfo.active.end.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</Text><Text style={S.title}>⏳ {dashboardCountdown(liveShiftInfo.active.end)}</Text></>:<Text style={S.helpLine}>Nikt nie ma teraz aktywnej zmiany.</Text>}{liveShiftInfo.next&&<><Text style={[S.section,{marginTop:12}]}>⏭️ NASTĘPNA ZMIANA</Text><Text style={S.title}>{PEOPLE[liveShiftInfo.next.person]?.name||liveShiftInfo.next.person}</Text><Text style={S.helpLine}>📦 Magazyn: {liveShiftInfo.next.warehouse}</Text><Text style={S.helpLine}>📅 {DAYS[liveShiftInfo.next.day]}, {shortDate(liveShiftInfo.next.date)} · 🕐 {liveShiftInfo.next.start.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</Text></>}</View>`;
  const marker='<ScrollView';
  const p=s.indexOf(marker);
  if(p>=0){const gt=s.indexOf('>',p)+1;s=s.slice(0,gt)+card+s.slice(gt);}
}

fs.writeFileSync(file,s);
console.log('Grafik Pracy build patch applied');
