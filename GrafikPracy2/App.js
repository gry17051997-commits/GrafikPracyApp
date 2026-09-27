import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "./src/theme";
import { PEOPLE, WAREHOUSES } from "./src/data";
import { generateWeek, mondayOf, isoDate, summarize, shiftLabel } from "./src/scheduleEngine";
import { signIn } from "./src/backend/auth.js";

const STORAGE="@grafik_pracy_2_state";
const NAV=[["start","Start"],["grafik","Grafik"],["podsumowanie","Podsum."],["więcej","Więcej"]];

function Card({children,style}){return <View style={[styles.card,style]}>{children}</View>}
function Button({children,onPress,active=false,secondary=false}){return <Pressable onPress={onPress} style={({pressed})=>[styles.button,secondary&&styles.buttonSecondary,active&&styles.buttonActive,pressed&&styles.pressed]}><Text style={styles.buttonText}>{children}</Text></Pressable>}
function Pill({children,color=colors.surface2}){return <View style={[styles.pill,{backgroundColor:color}]}><Text style={styles.pillText}>{children}</Text></View>}

function Auth({onGuest,onLogin}){
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  return <SafeAreaView style={styles.safe}><View style={styles.auth}>
    <Text style={styles.brand}>GRAFIK <Text style={styles.brandBlue}>PRACY</Text></Text>
    <Text style={styles.heroTitle}>Planowanie zmian bez chaosu.</Text>
    <Text style={styles.muted}>Stabilna wersja 2.0 • tryb demonstracyjny działa offline</Text>
    <Card style={styles.authCard}><Text style={styles.sectionTitle}>Logowanie</Text>
      <TextInput value={email} onChangeText={setEmail} placeholder="E-mail" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none"/>
      <TextInput value={password} onChangeText={setPassword} placeholder="Hasło" placeholderTextColor={colors.muted} style={styles.input} secureTextEntry/>
      <Button onPress={async()=>{setError("");setBusy(true);try{const user=await signIn(email,password);onLogin(user)}catch(e){setError(e?.code==="auth/invalid-credential"?"Nieprawidłowy e-mail lub hasło.":(e?.message||"Logowanie nie powiodło się."))}finally{setBusy(false)}}}>{busy?"LOGOWANIE…":"ZALOGUJ SIĘ"}</Button>
      <Button secondary onPress={onGuest}>WEJDŹ JAKO GOŚĆ</Button>
      {!!error&&<Text style={styles.error}>{error}</Text>}
      <Text style={styles.hint}>Tryb gościa jest lokalny. Logowanie i synchronizacja online zostaną włączone dopiero po przejściu testów backendu.</Text>
    </Card>
  </View></SafeAreaView>
}

function Dashboard({week,onNavigate}){
  const first=week.shifts[0]?.entries[0]; const person=PEOPLE.find(p=>p.key===first?.person);
  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.kicker}>DZISIAJ</Text>
    <Card style={styles.heroCard}><View style={styles.rowBetween}><View><Text style={styles.heroName}>{person?.name||"Brak przypisania"}</Text><Text style={styles.muted}>PZ387WR • zmiana {first?.shift===0?1:2}</Text></View><Pill color={person?.color||colors.surface2}>{person?.key||"—"}</Pill></View>
      <Text style={styles.bigTime}>{first?shiftLabel(week.hours,first.shift):"Wolne"}</Text>
      <View style={styles.row}><Pill>📍 {first?.warehouse||week.warehouse}</Pill><Pill color={colors.surface2}>● LOKALNIE</Pill></View>
    </Card>
    <View style={styles.grid}><Card><Text style={styles.metricLabel}>SYSTEM</Text><Text style={styles.metric}>{week.hours} h</Text><Text style={styles.muted}>stawka {week.hours===10?300:360} PLN</Text></Card><Card><Text style={styles.metricLabel}>TYDZIEŃ</Text><Text style={styles.metric}>7 dni</Text><Text style={styles.muted}>{week.weekStart}</Text></Card></View>
    <Card><Text style={styles.sectionTitle}>Szybkie akcje</Text><View style={styles.rowWrap}><Button onPress={()=>onNavigate("grafik")}>OTWÓRZ GRAFIK</Button><Button secondary onPress={()=>onNavigate("podsumowanie")}>PODSUMOWANIE</Button></View></Card>
  </ScrollView>
}

function Schedule({week,setWeek}){
  const [seed,setSeed]=useState("P");
  const regenerate=(nextSeed=seed)=>setWeek(generateWeek(week.weekStart,week.hours,week.warehouse,nextSeed));
  const updateEntry=(dayIndex,shift,patch)=>setWeek(prev=>({...prev,shifts:prev.shifts.map((d,i)=>i!==dayIndex?d:{...d,entries:d.entries.map((e,j)=>j!==shift?e:{...e,...patch})})}));
  return <ScrollView contentContainerStyle={styles.content}>
    <View style={styles.rowBetween}><View><Text style={styles.kicker}>TYDZIEŃ</Text><Text style={styles.pageTitle}>{week.weekStart}</Text></View><Pill>{week.hours} h</Pill></View>
    <Card><View style={styles.rowWrap}><Button active={week.hours===10} onPress={()=>setWeek({...week,hours:10})}>10 H</Button><Button active={week.hours===12} onPress={()=>setWeek({...week,hours:12})}>12 H</Button>{WAREHOUSES.map((warehouse)=><Button key={warehouse} secondary active={week.warehouse===warehouse} onPress={()=>setWeek({...week,warehouse})}>MAG: {warehouse}</Button>)}</View>
      <View style={styles.rowWrap}><Button secondary onPress={()=>{setSeed("P");regenerate("P")}}>ROTACJA P</Button><Button secondary onPress={()=>{setSeed("M");regenerate("M")}}>ROTACJA M</Button><Button onPress={()=>regenerate()}>GENERUJ</Button></View>
    </Card>
    {week.shifts.map(day=><Card key={day.date}><View style={styles.rowBetween}><Text style={styles.day}>{day.name}</Text><Text style={styles.muted}>{day.date}</Text></View>
      {day.entries.map((e,i)=><View key={e.id} style={styles.shiftRow}><View style={styles.shiftTime}><Text style={styles.shiftTitle}>Zmiana {i+1}</Text><Text style={styles.muted}>{shiftLabel(week.hours,i)}</Text></View>
        <View style={styles.personButtons}>{PEOPLE.map(p=><Pressable key={p.key} onPress={()=>updateEntry(day.dayIndex,i,{person:p.key,manual:true})} style={[styles.personButton,e.person===p.key&&{borderColor:p.color,backgroundColor:p.color+"33"}]}><View style={[styles.dot,{backgroundColor:p.color}]}/><Text style={styles.personText}>{p.name}</Text></Pressable>)}</View>
      </View>)}
    </Card>)}
  </ScrollView>
}

function Summary({week}){
  const s=useMemo(()=>summarize(week,PEOPLE),[week]);
  return <ScrollView contentContainerStyle={styles.content}><Text style={styles.kicker}>PODSUMOWANIE</Text><Text style={styles.pageTitle}>Rozliczenie tygodnia</Text>
    <View style={styles.grid}><Card><Text style={styles.metricLabel}>ZMIANY</Text><Text style={styles.metric}>{s.totalShifts}</Text></Card><Card><Text style={styles.metricLabel}>GODZINY</Text><Text style={styles.metric}>{s.totalHours}</Text></Card><Card style={{width:"100%"}}><Text style={styles.metricLabel}>WYNAGRODZENIE</Text><Text style={styles.pay}>{s.totalPay} PLN</Text></Card></View>
    {s.people.map(p=><Card key={p.key}><View style={styles.rowBetween}><View style={styles.row}><View style={[styles.dot,{backgroundColor:p.color}]}/><Text style={styles.workerName}>{p.name}</Text></View><Text style={styles.paySmall}>{p.pay} PLN</Text></View><Text style={styles.muted}>{p.shifts} zmian • {p.hours} h</Text></Card>)}
  </ScrollView>
}

function More({onReset}){
  return <ScrollView contentContainerStyle={styles.content}><Text style={styles.kicker}>SYSTEM</Text><Text style={styles.pageTitle}>Więcej</Text>
    <Card><Text style={styles.sectionTitle}>Grafik Pracy 2.0</Text><Text style={styles.muted}>Rdzeń aplikacji jest lokalny i odporny na brak internetu. Moduły backend, GPS, raporty, czat i widgety będą dokładane dopiero po przejściu testów bazowych.</Text></Card>
    <Card><Text style={styles.sectionTitle}>Dane demonstracyjne</Text><Button secondary onPress={onReset}>RESET GRAFIKU</Button></Card>
  </ScrollView>
}

export default function App(){
  const [boot,setBoot]=useState(true); const [session,setSession]=useState(null); const [tab,setTab]=useState("start"); const [week,setWeek]=useState(null); const {width}=useWindowDimensions();
  useEffect(()=>{(async()=>{try{const raw=await AsyncStorage.getItem(STORAGE);if(raw)setWeek(JSON.parse(raw));}catch{}finally{setBoot(false)}})()},[]);
  useEffect(()=>{if(week)AsyncStorage.setItem(STORAGE,JSON.stringify(week)).catch(()=>{})},[week]);
  if(boot)return <View style={styles.boot}><ActivityIndicator color={colors.brand}/><Text style={styles.muted}>Uruchamianie…</Text></View>;
  if(!session)return <Auth onLogin={user=>{setSession({type:"user",user});setWeek(prev=>prev||generateWeek(isoDate(mondayOf()),10,"PNT B","P"))}} onGuest={()=>{setSession({type:"guest"});setWeek(prev=>prev||generateWeek(isoDate(mondayOf()),10,"PNT B","P"))}}/>;
  if(!week)return null;
  const body=tab==="grafik"?<Schedule week={week} setWeek={setWeek}/>:tab==="podsumowanie"?<Summary week={week}/>:tab==="więcej"?<More onReset={()=>setWeek(generateWeek(isoDate(mondayOf()),10,"PNT B","P"))}/>:<Dashboard week={week} onNavigate={setTab}/>;
  return <SafeAreaView style={styles.safe}><View style={[styles.shell,width<700&&styles.shellMobile]}><View style={styles.top}><Text style={styles.appTitle}>Grafik Pracy <Text style={styles.appVersion}>2.0</Text></Text><Pill>{session?.type==="user"?"ONLINE":"GOŚĆ"}</Pill></View>{body}<View style={styles.nav}>{NAV.map(([key,label])=><Pressable key={key} onPress={()=>setTab(key)} style={[styles.navItem,tab===key&&styles.navActive]}><Text style={[styles.navText,tab===key&&styles.navTextActive]}>{label}</Text></Pressable>)}</View></View></SafeAreaView>
}

const styles=StyleSheet.create({
safe:{flex:1,backgroundColor:colors.bg},shell:{flex:1,width:"100%",maxWidth:1100,alignSelf:"center",backgroundColor:colors.bg},shellMobile:{maxWidth:700},
boot:{flex:1,backgroundColor:colors.bg,alignItems:"center",justifyContent:"center",gap:12},content:{padding:16,paddingBottom:100,gap:12},top:{height:62,paddingHorizontal:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderBottomWidth:1,borderBottomColor:colors.border},
appTitle:{color:colors.text,fontSize:20,fontWeight:"900"},appVersion:{color:colors.brand},kicker:{color:colors.brand,fontSize:12,fontWeight:"900",letterSpacing:1.5},pageTitle:{color:colors.text,fontSize:28,fontWeight:"900"},brand:{color:colors.text,fontSize:36,fontWeight:"900"},brandBlue:{color:colors.brand},heroTitle:{color:colors.text,fontSize:30,fontWeight:"900",marginTop:20},muted:{color:colors.muted,fontSize:14,lineHeight:20},
auth:{flex:1,padding:24,justifyContent:"center",maxWidth:620,width:"100%",alignSelf:"center"},authCard:{marginTop:24},card:{backgroundColor:colors.surface,borderRadius:12,borderWidth:1,borderColor:colors.border,padding:14,gap:10},heroCard:{padding:20},sectionTitle:{color:colors.text,fontSize:18,fontWeight:"800"},heroName:{color:colors.text,fontSize:26,fontWeight:"900"},bigTime:{color:colors.text,fontSize:34,fontWeight:"900",marginVertical:16},
row:{flexDirection:"row",alignItems:"center",gap:8},rowBetween:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12},rowWrap:{flexDirection:"row",flexWrap:"wrap",gap:8},grid:{flexDirection:"row",flexWrap:"wrap",gap:12},
metricLabel:{color:colors.muted,fontSize:11,fontWeight:"800",letterSpacing:1},metric:{color:colors.text,fontSize:30,fontWeight:"900"},pay:{color:colors.success,fontSize:32,fontWeight:"900"},workerName:{color:colors.text,fontSize:18,fontWeight:"800"},paySmall:{color:colors.success,fontSize:18,fontWeight:"900"},
pill:{paddingHorizontal:10,paddingVertical:6,borderRadius:999,alignSelf:"flex-start"},pillText:{color:colors.text,fontSize:12,fontWeight:"800"},button:{backgroundColor:colors.brand,paddingHorizontal:14,paddingVertical:12,borderRadius:8,minHeight:44,justifyContent:"center"},buttonSecondary:{backgroundColor:colors.surface2},buttonActive:{borderWidth:2,borderColor:colors.text},buttonText:{color:"#fff",fontWeight:"900",fontSize:12},pressed:{opacity:.75},
input:{backgroundColor:colors.surface2,color:colors.text,borderRadius:8,paddingHorizontal:14,paddingVertical:13,fontSize:16},error:{color:colors.danger,fontSize:13,lineHeight:18},hint:{color:colors.muted,fontSize:12,lineHeight:18},shiftRow:{borderTopWidth:1,borderTopColor:colors.border,paddingTop:10,gap:10},shiftTime:{flexDirection:"row",justifyContent:"space-between"},shiftTitle:{color:colors.text,fontWeight:"800"},personButtons:{flexDirection:"row",gap:6,flexWrap:"wrap"},personButton:{borderWidth:1,borderColor:colors.border,borderRadius:8,padding:8,flexDirection:"row",alignItems:"center",gap:6},personText:{color:colors.text,fontSize:12},dot:{width:10,height:10,borderRadius:5},day:{color:colors.text,fontSize:17,fontWeight:"900"},
nav:{position:"absolute",bottom:0,left:0,right:0,height:64,backgroundColor:colors.surface,borderTopWidth:1,borderTopColor:colors.border,flexDirection:"row"},navItem:{flex:1,alignItems:"center",justifyContent:"center"},navActive:{backgroundColor:colors.surface2},navText:{color:colors.muted,fontSize:12,fontWeight:"700"},navTextActive:{color:colors.text}
});