import React, {useEffect, useMemo, useState} from 'react';
import {SafeAreaView, View, Text, ScrollView, TouchableOpacity, StyleSheet} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY='grafik-pracy-core-v1';
const PEOPLE={P:{name:'Paweł',color:'#4f8cff'},M:{name:'Mateusz',color:'#8f6cff'},L:{name:'Łukasz',color:'#35c98a'}};
const WAREHOUSES=['PNT B','PNT C','UNICO','SP3','DC2','DC1','ECE','PNT A','GLP B','GLP C'];
const RATE={10:300,12:360};
const pad=n=>String(n).padStart(2,'0');
const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const monday=d=>{const x=new Date(d);const n=x.getDay();x.setDate(x.getDate()+(n===0?-6:1-n));x.setHours(0,0,0,0);return x;};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
const makeWeek=(rotation,warehouse)=>Array.from({length:7},(_,i)=>({date:dateKey(addDays(monday(new Date()),i)),warehouse,shifts:[
 {id:`${i}-1`,person:i%2===0?(rotation==='P'?'P':'M'):(rotation==='P'?'M':'P'),shift:1},
 {id:`${i}-2`,person:i%2===0?(rotation==='P'?'M':'P'):(rotation==='P'?'P':'M'),shift:2}
]}));

export default function App(){
 const [hours,setHours]=useState(10),[rotation,setRotation]=useState('P'),[warehouse,setWarehouse]=useState('PNT B');
 const [week,setWeek]=useState(()=>makeWeek('P','PNT B')),[loaded,setLoaded]=useState(false),[info,setInfo]=useState('');
 useEffect(()=>{(async()=>{try{const s=await AsyncStorage.getItem(KEY);if(s){const x=JSON.parse(s);setHours(x.hours||10);setRotation(x.rotation||'P');setWarehouse(x.warehouse||'PNT B');setWeek(x.week||makeWeek(x.rotation||'P',x.warehouse||'PNT B'));}}catch(e){}finally{setLoaded(true);}})()},[]);
 useEffect(()=>{if(loaded)AsyncStorage.setItem(KEY,JSON.stringify({hours,rotation,warehouse,week})).catch(()=>{});},[loaded,hours,rotation,warehouse,week]);
 const totals=useMemo(()=>Object.keys(PEOPLE).map(p=>({p,shifts:week.reduce((n,d)=>n+(d.shifts||[]).filter(s=>s.person===p).length,0)})),[week]);
 const regenerate=()=>{setWeek(makeWeek(rotation,warehouse));setInfo('Grafik wygenerowany');};
 const cycleWarehouse=i=>setWeek(w=>w.map((d,n)=>n===i?{...d,warehouse:WAREHOUSES[(WAREHOUSES.indexOf(d.warehouse)+1)%WAREHOUSES.length]}:d));
 const swap=i=>setWeek(w=>w.map((d,n)=>n===i?{...d,shifts:d.shifts.map(s=>({...s,person:s.person==='P'?'M':s.person==='M'?'L':'P'}))}:d));
 if(!loaded)return <SafeAreaView style={s.root}><Text style={s.title}>GRAFIK PRACY</Text><Text style={s.muted}>Uruchamianie...</Text></SafeAreaView>;
 return <SafeAreaView style={s.root}>
  <ScrollView contentContainerStyle={s.content}>
   <Text style={s.title}>GRAFIK PRACY</Text><Text style={s.subtitle}>Stabilny tryb podstawowy</Text>
   <View style={s.panel}><Text style={s.label}>System zmian</Text><View style={s.row}>{[10,12].map(h=><TouchableOpacity key={h} onPress={()=>setHours(h)} style={[s.btn,hours===h&&s.active]}><Text style={s.btnText}>{h} h • {RATE[h]} zł</Text></TouchableOpacity>)}</View>
   <Text style={s.label}>Rotacja</Text><View style={s.row}>{['P','M'].map(r=><TouchableOpacity key={r} onPress={()=>setRotation(r)} style={[s.small,rotation===r&&s.active]}><Text style={s.btnText}>{r} start</Text></TouchableOpacity>)}</View>
   <Text style={s.label}>Magazyn: {warehouse}</Text><View style={s.row}>{WAREHOUSES.slice(0,5).map(w=><TouchableOpacity key={w} onPress={()=>setWarehouse(w)} style={[s.small,warehouse===w&&s.active]}><Text style={s.btnText}>{w}</Text></TouchableOpacity>)}</View>
   <TouchableOpacity onPress={regenerate} style={s.generate}><Text style={s.generateText}>GENERUJ TEN TYDZIEŃ</Text></TouchableOpacity></View>
   {week.map((d,i)=><View key={d.date} style={s.day}><View style={s.dayHead}><Text style={s.dayTitle}>{['Pon','Wt','Śr','Czw','Pt','Sob','Nd'][i]} {d.date.slice(8)}.{d.date.slice(5,7)}</Text><TouchableOpacity onPress={()=>cycleWarehouse(i)}><Text style={s.warehouse}>{d.warehouse} ↻</Text></TouchableOpacity></View>
    {d.shifts.map(sh=><View key={sh.id} style={s.shift}><Text style={s.shiftName}>{sh.shift===1?'I':'II'} zmiana</Text><View style={[s.person,{backgroundColor:PEOPLE[sh.person].color}]}><Text style={s.personText}>{PEOPLE[sh.person].name}</Text></View><Text style={s.time}>{hours===10?(sh.shift===1?'06:00–16:00':'16:00–02:00'):(sh.shift===1?'06:00–18:00':'18:00–06:00')}</Text></View>)}
    <TouchableOpacity onPress={()=>swap(i)}><Text style={s.swap}>ZAMIEŃ OBSADĘ</Text></TouchableOpacity>
   </View>)}
   <View style={s.panel}><Text style={s.section}>Podsumowanie tygodnia</Text>{totals.map(x=><Text key={x.p} style={s.total}>{PEOPLE[x.p].name}: {x.shifts} zmian • {x.shifts*RATE[hours]} zł</Text>)}{!!info&&<Text style={s.ok}>{info}</Text>}</View>
  </ScrollView>
 </SafeAreaView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#0f172a'},content:{padding:14,paddingBottom:40},title:{color:'#fff',fontSize:28,fontWeight:'900',textAlign:'center',marginTop:12},subtitle:{color:'#94a3b8',textAlign:'center',marginBottom:14},panel:{backgroundColor:'#172033',borderRadius:16,padding:14,marginBottom:12},label:{color:'#cbd5e1',fontWeight:'800',marginTop:8,marginBottom:7},row:{flexDirection:'row',flexWrap:'wrap',gap:7},btn:{backgroundColor:'#293548',padding:10,borderRadius:10},small:{backgroundColor:'#293548',padding:8,borderRadius:9},active:{backgroundColor:'#2563eb'},btnText:{color:'#fff',fontWeight:'800',fontSize:12},generate:{backgroundColor:'#16a34a',padding:13,borderRadius:11,alignItems:'center',marginTop:14},generateText:{color:'#fff',fontWeight:'900'},day:{backgroundColor:'#172033',borderRadius:16,padding:12,marginBottom:10},dayHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8},dayTitle:{color:'#fff',fontWeight:'900',fontSize:16},warehouse:{color:'#60a5fa',fontWeight:'800'},shift:{backgroundColor:'#202b3d',borderRadius:11,padding:9,marginBottom:6,flexDirection:'row',alignItems:'center',gap:8},shiftName:{color:'#cbd5e1',width:60,fontWeight:'800'},person:{borderRadius:8,paddingVertical:6,paddingHorizontal:9},personText:{color:'#fff',fontWeight:'900'},time:{color:'#94a3b8',marginLeft:'auto',fontSize:11},swap:{color:'#60a5fa',fontWeight:'900',textAlign:'center',padding:6},section:{color:'#fff',fontSize:18,fontWeight:'900',marginBottom:8},total:{color:'#dbeafe',paddingVertical:3},ok:{color:'#86efac',marginTop:8},muted:{color:'#94a3b8',textAlign:'center',marginTop:10}});
