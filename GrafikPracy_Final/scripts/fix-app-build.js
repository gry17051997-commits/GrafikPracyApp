const fs=require('fs');
const path=require('path');
const candidates=[path.join(process.cwd(),'GrafikPracy_Final','App.js'),path.join(process.cwd(),'App.js')];
const file=candidates.find(p=>fs.existsSync(p));
if(!file)process.exit(0);
let s=fs.readFileSync(file,'utf8');
const once=(a,b)=>{if(s.includes(b))return;s=s.replace(a,b);};
// Fix report parsing in generated build. Keep these replacements idempotent.
s=s.replace("match(/^(\\\\d{1,2}):(\\\\d{2})$/)","match(/^(\\d{1,2}):(\\d{2})$/)");
s=s.replace("replace(/\\\\s+/g,'')","replace(/\\s+/g,'')");

const re=/\n  const updateShift = \(dayIndex,shiftIndex,patch\) => \{[\s\S]*?\n  \};\n/g;let first=true;s=s.replace(re,m=>first?(first=false,m):'\n');
s=s.replace(/\n\s*if \(readOnly \|\| dayHasPassed\(dayIndex\)\) return;[\s\S]*?\n\s*\};\n\n  const openOff/,'\n\n  const openOff');
s=s.replace("if (data.conditions) setConditions(data.conditions);\n      if (data.conditions) setConditions(data.conditions);","if (data.conditions) setConditions(data.conditions);");
s=s.replace("setDoc(doc(db,'schedules','main'),payload,{merge:true}).catch(e=>setCloudError('Nie udało się zapisać grafiku online. Kod: ' + (e?.code || 'nieznany')));","setDoc(doc(db,'schedules','main'),payload,{merge:true}).catch(e=>setCloudError('Nie udało się zapisać grafiku online. Kod: ' + (e?.code || 'nieznany')));");
s=s.replace("const p = s.person && (personFilter==='all' || s.person===personFilter) ? PEOPLE[s.person] : null;","const p = s.person ? PEOPLE[s.person] : null;");
s=s.replace("const sh=d.shifts[si]; return <TouchableOpacity key={si} disabled={forExport || dayHasPassed(i)} onPress={()=>!readOnly && !dayHasPassed(i) && setEdit({dayIndex:i,shiftIndex:si})} style={[S.tableCell,S.tableShiftCell,S.tableShift,sh.person===personFilter||personFilter==='all'?{backgroundColor:personColor(sh.person)}:{}]}","const sh=d.shifts[si]; const p=(sh.person && (personFilter==='all'||sh.person===personFilter)) ? PEOPLE[sh.person] : null; return <TouchableOpacity key={si} disabled={forExport || dayHasPassed(i)} onPress={()=>!readOnly && !dayHasPassed(i) && setEdit({dayIndex:i,shiftIndex:si})} style={[S.tableCell,S.tableShiftCell,S.tableShift,p?{backgroundColor:personColor(sh.person)}:{}]}");
s=s.replace("!dayHasPassed(di) && s.person && (cloudRole==='admin' || s.person===myPerson)","!dayHasPassed(di) && s.person && cloudUser");
s=s.replace("fromPerson:swapModal.person || myPerson,","fromPerson:swapModal.person || null,");
s=s.replace("PERSON_KEYS.filter(k=>k!==myPerson)","PERSON_KEYS.filter(k=>k!==swapModal?.person)");
const appImport="import GuestPreview from './GuestPreview';\nimport Dashboard from './Dashboard';\n";
once("import {doc, setDoc, onSnapshot, serverTimestamp, collection, addDoc, query, where, updateDoc} from 'firebase/firestore';\n","import {doc, setDoc, onSnapshot, serverTimestamp, collection, addDoc, query, where, updateDoc} from 'firebase/firestore';\n"+appImport);
once("  const [myPerson,setMyPerson] = useState('P');\n","  const [myPerson,setMyPerson] = useState('P');\n  const [guestMode,setGuestMode] = useState(false);\n");
s=s.replace("setCloudUser(user || null);\n      setCloudError('');","setCloudUser(user || null);\n      if (user) setGuestMode(false);\n      setCloudError('');");
s=s.replace("if (!FIREBASE_ENABLED || !db || !cloudUser) return;\n    const unsub = onSnapshot(doc(db,'schedules','main')","if (!FIREBASE_ENABLED || !db || (!cloudUser && !guestMode)) return;\n    const unsub = onSnapshot(doc(db,'schedules','main')",1);
s=s.replace("  },[cloudUser]);\n\n  useEffect(() => {\n    if (!FIREBASE_ENABLED || !db || !cloudUser) return;","  },[cloudUser,guestMode]);\n\n  useEffect(() => {\n    if (!FIREBASE_ENABLED || !db || !cloudUser) return;",1);
s=s.replace("if (FIREBASE_ENABLED && (!cloudUser || !cloudReady)) {","if (FIREBASE_ENABLED && (!cloudUser || !cloudReady) && !guestMode) {");
once("<TouchableOpacity style={[S.btn,{marginTop:8}]} disabled={authBusy} onPress={cloudRegister}><Text style={S.btnText}>UTWÓRZ KONTO PRACOWNIKA</Text></TouchableOpacity>","<TouchableOpacity style={[S.btn,{marginTop:8}]} disabled={authBusy} onPress={cloudRegister}><Text style={S.btnText}>UTWÓRZ KONTO PRACOWNIKA</Text></TouchableOpacity><TouchableOpacity style={[S.btn,{marginTop:8}]} onPress={()=>{setGuestMode(true);setTab('teraz')}}><Text style={S.btnText}>👻 KONTYNUUJ JAKO GOŚĆ</Text></TouchableOpacity>");
s=s.replace("{tab==='grafik' ? schedule : tab==='summary' ? summary : settings}","{tab==='teraz' ? <ScrollView style={S.content} contentContainerStyle={{paddingBottom:110}}>{header}{guestMode&&<View style={S.proposalCard}><Text style={S.optionText}>👻 TRYB GOŚCIA</Text><Text style={S.helpLine}>Podgląd bieżącego grafiku bez logowania. Zaloguj się, aby korzystać z pełnych funkcji.</Text></View>}<Dashboard weeks={weeks} rotation={rotation} warehouse={warehouse} times={times}/></ScrollView> : tab==='grafik' ? (guestMode ? <GuestPreview weeks={weeks} rotation={rotation} warehouse={warehouse} times={times}/> : <><View style={{paddingHorizontal:12,paddingTop:8}}><TouchableOpacity disabled={readOnly} style={[S.btn,{borderWidth:1,borderColor:'#ef4444'}]} onPress={clearCurrentWeek}><Text style={S.btnText}>🗑️ WYCZYŚĆ CAŁY TYDZIEŃ</Text></TouchableOpacity></View>{schedule}</>) : tab==='summary' ? summary : settings}");
if (!s.includes("tab==='teraz'&&S.navActive")) once("<TouchableOpacity style={[S.navBtn,tab==='grafik'&&S.navActive]} onPress={()=>setTab('grafik')}>","<TouchableOpacity style={[S.navBtn,tab==='teraz'&&S.navActive]} onPress={()=>setTab('teraz')}><Text style={S.navIcon}>🟢</Text><Text style={S.navText}>Teraz</Text></TouchableOpacity><TouchableOpacity style={[S.navBtn,tab==='grafik'&&S.navActive]} onPress={()=>setTab('grafik')}>");
// Keep the summary navigation item structurally intact. Role-based visibility is handled by the app itself.
// Navigation JSX is intentionally left untouched here.


fs.writeFileSync(file,s);
console.log('final integration patch ready');
