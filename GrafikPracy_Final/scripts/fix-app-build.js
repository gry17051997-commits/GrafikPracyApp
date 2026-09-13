const fs = require('fs');
const path = require('path');
const candidates = [path.join(process.cwd(),'GrafikPracy_Final','App.js'),path.join(process.cwd(),'App.js')];
const file = candidates.find(p => fs.existsSync(p));
if (!file) process.exit(0);
let s = fs.readFileSync(file,'utf8');

const updateShiftRe = /\n  const updateShift = \(dayIndex,shiftIndex,patch\) => \{[\s\S]*?\n  \};\n/g;
let seen=false;
s=s.replace(updateShiftRe,m=>{if(!seen){seen=true;return m;}return '\n';});
const orphanUpdateTail = /\n\s*if \(readOnly \|\| dayHasPassed\(dayIndex\)\) return;\n\s*setWeek\(w => \{\n\s*w\[dayIndex\]\.shifts\[shiftIndex\] = \{\n\s*\.\.\.w\[dayIndex\]\.shifts\[shiftIndex\],\n\s*\.\.\.patch,\n\s*manual:true\n\s*\};\n\s*return w;\n\s*\}\);\n\s*\};\n/;
s=s.replace(orphanUpdateTail,'\n');
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
s=s.replace("!dayHasPassed(di) && s.person && (cloudRole==='admin' || s.person===myPerson)","!dayHasPassed(di) && s.person && cloudUser");
s=s.replace("fromPerson:swapModal.person || myPerson,","fromPerson:swapModal.person || null,");

if(!s.includes("const [guestMode,setGuestMode]")) s=s.replace("  const [myPerson,setMyPerson] = useState('P');","  const [myPerson,setMyPerson] = useState('P');\n  const [guestMode,setGuestMode] = useState(false);\n  const [dashboardNow,setDashboardNow] = useState(new Date());");
if(!s.includes("const liveShiftInfo=useMemo")){
  const code=`\n  useEffect(()=>{const id=setInterval(()=>setDashboardNow(new Date()),1000);return()=>clearInterval(id);},[]);\n  const parseShiftDate=(base,si)=>{const st=si===0?times.s1:times.s2,en=si===0?times.e1:times.e2;const [sh,sm]=String(st||'00:00').split(':').map(Number),[eh,em]=String(en||'00:00').split(':').map(Number);const start=new Date(base);start.setHours(sh||0,sm||0,0,0);const end=new Date(base);end.setHours(eh||0,em||0,0,0);if(end<=start)end.setDate(end.getDate()+1);return {start,end};};\n  const liveShiftInfo=useMemo(()=>{const all=[],base=monday(dashboardNow);[0,1].forEach(wo=>{const ws=addDays(base,wo*7),w=weeks[iso(ws)]||generateWeek(rotation,warehouse);(w||[]).forEach((d,di)=>(d.shifts||[]).forEach((sh,si)=>{if(!sh.person)return;const dt=parseShiftDate(addDays(ws,di),si);all.push({person:sh.person,warehouse:sh.warehouse||d.warehouse||warehouse,start:dt.start,end:dt.end,day:di,date:addDays(ws,di),slot:si+1});}));});return {active:all.filter(x=>dashboardNow>=x.start&&dashboardNow<x.end).sort((a,b)=>a.end-b.end)[0]||null,next:all.filter(x=>x.start>dashboardNow).sort((a,b)=>a.start-b.start)[0]||null};},[weeks,rotation,warehouse,times,dashboardNow]);\n  const dashboardCountdown=end=>{const sec=Math.max(0,Math.floor((end.getTime()-dashboardNow.getTime())/1000));return String(Math.floor(sec/3600)).padStart(2,'0')+':'+String(Math.floor(sec%3600/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')};\n`;
  const r=s.indexOf('  return ('); if(r>=0)s=s.slice(0,r)+code+s.slice(r);
}

s=s.replace("if (!FIREBASE_ENABLED || !db || !cloudUser) return;\n    const unsub = onSnapshot(doc(db,'schedules','main')","if (!FIREBASE_ENABLED || !db || (!cloudUser && !guestMode)) return;\n    const unsub = onSnapshot(doc(db,'schedules','main')");
s=s.replace("  },[cloudUser]);\n\n  useEffect(() => {\n    if (!FIREBASE_ENABLED || !db || !cloudUser) return;\n    const q", "  },[cloudUser,guestMode]);\n\n  useEffect(() => {\n    if (!FIREBASE_ENABLED || !db || !cloudUser) return;\n    const q",1);
s=s.replace("if (FIREBASE_ENABLED && (!cloudUser || !cloudReady)) {","if (FIREBASE_ENABLED && (!cloudUser || !cloudReady) && !guestMode) {");
s=s.replace("<TouchableOpacity style={[S.btn,{marginTop:8}]} disabled={authBusy} onPress={cloudRegister}><Text style={S.btnText}>UTWÓRZ KONTO PRACOWNIKA</Text></TouchableOpacity>","<TouchableOpacity style={[S.btn,{marginTop:8}]} disabled={authBusy} onPress={cloudRegister}><Text style={S.btnText}>UTWÓRZ KONTO PRACOWNIKA</Text></TouchableOpacity><TouchableOpacity style={[S.btn,{marginTop:8}]} onPress={()=>setGuestMode(true)}><Text style={S.btnText}>👻 KONTYNUUJ JAKO GOŚĆ</Text></TouchableOpacity>");

let guestPreview = null;
if(!s.includes("tab==='teraz' ? dashboardView")){
  const marker="  const selectedSummaryKeys = summaryPerson === 'all' ? PERSON_KEYS : [summaryPerson];";
  const dashboardView=`  const dashboardView=(<ScrollView style={S.content} contentContainerStyle={{paddingBottom:110}}>{header}{guestMode&&<View style={S.proposalCard}><Text style={S.optionText}>👻 TRYB GOŚCIA</Text><Text style={S.helpLine}>Podgląd bez logowania. Pełny dostęp wymaga zalogowania.</Text><TouchableOpacity style={S.closeBtn} onPress={()=>setGuestMode(false)}><Text style={S.btnText}>🔑 ZALOGUJ SIĘ</Text></TouchableOpacity></View>}<View style={S.total}><Text style={S.totalSmall}>🟢 KTO TERAZ PRACUJE?</Text>{liveShiftInfo.active?<><Text style={S.totalBig}>{PEOPLE[liveShiftInfo.active.person]?.name||liveShiftInfo.active.person}</Text><Text style={S.totalInfo}>📦 {liveShiftInfo.active.warehouse}</Text><Text style={S.totalInfo}>🕐 {liveShiftInfo.active.start.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} – {liveShiftInfo.active.end.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</Text><Text style={S.totalMoney}>⏳ {dashboardCountdown(liveShiftInfo.active.end)}</Text></>:<Text style={S.totalBig}>Nikt</Text>}</View><View style={S.employee}><Text style={S.employeeName}>⏭️ NASTĘPNA ZMIANA</Text>{liveShiftInfo.next?<><Text style={S.stat}>{PEOPLE[liveShiftInfo.next.person]?.name||liveShiftInfo.next.person}</Text><Text style={S.stat}>📦 {liveShiftInfo.next.warehouse}</Text><Text style={S.stat}>📅 {DAYS[liveShiftInfo.next.day]} · {shortDate(liveShiftInfo.next.date)}</Text><Text style={S.stat}>🕐 {liveShiftInfo.next.start.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</Text></>:<Text style={S.stat}>Brak zaplanowanej kolejnej zmiany.</Text>}</View></ScrollView>);\n`;
  guestPreview=`<ScrollView style={S.content} contentContainerStyle={{paddingBottom:110}}>{header}<View style={S.proposalCard}><Text style={S.optionText}>👻 TRYB GOŚCIA</Text><Text style={S.helpLine}>Podgląd tylko bieżącego i następnego tygodnia. Bez edycji, podsumowań i zamian.</Text><TouchableOpacity style={S.closeBtn} onPress={()=>setGuestMode(false)}><Text style={S.btnText}>🔑 ZALOGUJ SIĘ</Text></TouchableOpacity></View>{[0,1].map(wo=>{const ws=addDays(monday(dashboardNow),wo*7),w=weeks[iso(ws)]||generateWeek(rotation,warehouse);return <View key={wo} style={S.day}><Text style={S.dayTitle}>{wo===0?'Bieżący tydzień':'Następny tydzień'} · {fullDate(ws)}</Text>{w.map((d,di)=><View key={di} style={S.shift}><Text style={S.shiftTitle}>{DAYS[di]} · {shortDate(addDays(ws,di))}</Text>{d.shifts.map((sh,si)=><View key={si} style={S.shiftRow}><Text style={S.optionText}>Zm. {si+1} · {shiftTime(times,si+1)}</Text><Text style={S.helpLine}>{sh.person?(PEOPLE[sh.person]?.name||sh.person)+' · '+(sh.warehouse||d.warehouse||warehouse):'Wolna'}</Text></View>)}</View>)}</View>})}</ScrollView>`;
  s=s.replace(marker,dashboardView+'\n'+marker);
  s=s.replace("{tab==='grafik' ? schedule : tab==='summary' ? summary : settings}","{tab==='teraz' ? dashboardView : tab==='grafik' ? (guestMode ? guestPreview : schedule) : tab==='summary' ? summary : settings}");
}

s=s.replace("<TouchableOpacity style={[S.navBtn,tab==='grafik'&&S.navActive]} onPress={()=>setTab('grafik')}>","<TouchableOpacity style={[S.navBtn,tab==='teraz'&&S.navActive]} onPress={()=>setTab('teraz')}><Text style={S.navIcon}>🟢</Text><Text style={S.navText}>Teraz</Text></TouchableOpacity><TouchableOpacity style={[S.navBtn,tab==='grafik'&&S.navActive]} onPress={()=>setTab('grafik')}>");
s=s.replace("            <TouchableOpacity style={[S.navBtn,tab==='summary'&&S.navActive]} onPress={()=>setTab('summary')}>","            {(!FIREBASE_ENABLED || cloudRole==='admin') && <TouchableOpacity style={[S.navBtn,tab==='summary'&&S.navActive]} onPress={()=>setTab('summary')}>");
s=s.replace("            <TouchableOpacity style={[S.navBtn,tab==='ustawienia'&&S.navActive]} onPress={()=>setTab('ustawienia')}>","            {!guestMode && <TouchableOpacity style={[S.navBtn,tab==='ustawienia'&&S.navActive]} onPress={()=>setTab('ustawienia')}>");
s=s.replace("<Text style={S.navText}>Ustawienia</Text>\n            </TouchableOpacity>\n          </View>","<Text style={S.navText}>Ustawienia</Text>\n            </TouchableOpacity>}\n          </View>");
s=s.replace("      <Text style={S.section}>⚡ Warunki generatora</Text>","      {cloudRole==='admin' && <><Text style={S.section}>⚡ Warunki generatora</Text>");
s=s.replace("      {FIREBASE_ENABLED && cloudRole==='admin' && <>","      </>}{FIREBASE_ENABLED && cloudRole==='admin' && <>");
s=s.replace("      <Text style={S.section}>Kolory pracowników</Text>","      {cloudRole==='admin' && <><Text style={S.section}>Kolory pracowników</Text>");
s=s.replace("      {FIREBASE_ENABLED && cloudUser && <>","      </>}{FIREBASE_ENABLED && cloudUser && <>");
s=s.replace("  proposalCard:{","  shiftRow:{backgroundColor:'#222732',borderRadius:12,padding:10,marginTop:7},\n  proposalCard:{");
fs.writeFileSync(file,s);
console.log('Grafik Pracy final patch applied');
