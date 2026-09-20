import React, {useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';

const PEOPLE={P:'Paweł',M:'Mateusz',L:'Łukasz'};
const DAYS=['Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota','Niedziela'];

const monday=d=>{const x=new Date(d),n=x.getDay();x.setDate(x.getDate()+(n===0?-6:1-n));x.setHours(0,0,0,0);return x;};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parseTime=v=>{const m=String(v||'00:00').match(/^(\d{1,2}):(\d{2})$/);return m?[Number(m[1]),Number(m[2])]:[0,0];};
const dateTime=(base,v)=>{const x=new Date(base),[h,m]=parseTime(v);x.setHours(h,m,0,0);return x;};
const fallbackWeek=(rotation,warehouse)=>{const a=rotation==='P'?'P':'M',b=a==='P'?'M':'P';return DAYS.map((_,i)=>({warehouse,shifts:[{person:i===6?'L':i%2?a:b},{person:i===6?'L':i%2?b:a}]}));};
const fmt=d=>d.toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'});
const countdown=end=>{const sec=Math.max(0,Math.floor((end-Date.now())/1000));return `${String(Math.floor(sec/3600)).padStart(2,'0')}:${String(Math.floor(sec%3600/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;};
const dateLabel=d=>d.toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'});

export default function NowDashboard({weeks,rotation,warehouse,times,personColors,weekConfigs}) {
 const [,tick]=useState(0);
 useEffect(()=>{const id=setInterval(()=>tick(v=>v+1),1000);return()=>clearInterval(id);},[]);

 const info=useMemo(()=>{
   const now=new Date(),base=monday(now),all=[];
   for(let wo=0;wo<3;wo++){
     const ws=addDays(base,wo*7),key=iso(ws),w=weeks?.[key]||[],cfg=weekConfigs?.[key]||{};
     (w||[]).forEach((d,di)=>(d.shifts||[]).forEach((s,si)=>{
       if(!s.person)return;
       const day=addDays(ws,di);
       const wt=cfg.times||times||{}; const start=dateTime(day,si===0?wt.s1:wt.s2);
       const end=dateTime(day,si===0?wt.e1:wt.e2);
       if(end<=start)end.setDate(end.getDate()+1);
       all.push({person:s.person,warehouse:s.warehouse||d.warehouse||warehouse,start,end,day,dayIndex:di,shift:si+1});
     }));
   }
   const active=all.filter(x=>now>=x.start&&now<x.end).sort((a,b)=>a.end-b.end)[0]||null;
   const upcoming=all.filter(x=>x.start>now).sort((a,b)=>a.start-b.start);
   return {active,next:upcoming[0]||null,later:upcoming.slice(1,4)};
 },[weeks,rotation,warehouse,times,weekConfigs]);

 const {active,next,later}=info;
 const color=k=>personColors?.[k]||'#467ff1';

 return <ScrollView style={S.scroll} contentContainerStyle={S.content}>
   <View style={S.hero}>
     <View style={S.liveRow}><View style={S.liveDot}/><Text style={S.eyebrow}>TERAZ</Text></View>
     {active ? <>
       <Text style={S.heroName}>{PEOPLE[active.person]||active.person||'Nieznany pracownik'}</Text>
       <Text style={S.heroMeta}>📦 {active.warehouse}  ·  Zmiana {active.shift}</Text>
       <Text style={S.heroTime}>{fmt(active.start)} – {fmt(active.end)}</Text>
       <View style={S.timer}><Text style={S.timerLabel}>DO KOŃCA ZMIANY</Text><Text style={S.timerValue}>{countdown(active.end)}</Text></View>
     </> : <>
       <Text style={S.heroName}>Nikt teraz nie pracuje</Text>
       <Text style={S.heroMeta}>Brak aktywnej zmiany w tej chwili.</Text>
     </>}
   </View>

   <View style={S.sectionHeader}><Text style={S.sectionTitle}>⏭️ Następna zmiana</Text></View>
   {next ? <View style={[S.nextCard,{borderLeftColor:color(next.person)}]}>
      <View style={S.nextTop}><Text style={S.nextName}>{PEOPLE[next.person]||next.person||'Nieznany pracownik'}</Text><Text style={[S.personDot,{color:color(next.person)}]}>●</Text></View>
      <Text style={S.nextMeta}>📅 {DAYS[next.dayIndex]}, {dateLabel(next.day)}</Text>
      <Text style={S.nextMeta}>🕐 {fmt(next.start)} – {fmt(next.end)}</Text>
      <Text style={S.nextMeta}>📦 {next.warehouse}  ·  Zmiana {next.shift}</Text>
      <Text style={S.startsIn}>Start za {countdown(next.start)}</Text>
   </View> : <View style={S.empty}><Text style={S.emptyText}>Brak zaplanowanej kolejnej zmiany.</Text></View>}

   {later.length>0 && <>
     <View style={S.sectionHeader}><Text style={S.sectionTitle}>📋 Kolejne</Text></View>
     {later.map((x,i)=><View key={x.start.toISOString()+i} style={S.smallCard}>
       <View style={{flex:1}}><Text style={S.smallName}>{PEOPLE[x.person]}</Text><Text style={S.smallMeta}>{DAYS[x.dayIndex]}, {dateLabel(x.day)} · {fmt(x.start)} · {x.warehouse}</Text></View>
       <Text style={S.smallShift}>ZM. {x.shift}</Text>
     </View>)}
   </>}
 </ScrollView>;
}

const S=StyleSheet.create({
 scroll:{flex:1},content:{padding:14,paddingBottom:110},
 hero:{backgroundColor:'#467ff1',borderRadius:24,padding:20,marginBottom:14},
 liveRow:{flexDirection:'row',alignItems:'center',gap:8},liveDot:{width:9,height:9,borderRadius:5,backgroundColor:'#fff'},eyebrow:{color:'#eaf0ff',fontSize:13,fontWeight:'900',letterSpacing:1},
 heroName:{color:'#fff',fontSize:30,fontWeight:'900',marginTop:7},heroMeta:{color:'#e5edff',fontSize:14,marginTop:6},heroTime:{color:'#fff',fontSize:18,fontWeight:'800',marginTop:4},
 timer:{backgroundColor:'rgba(0,0,0,.16)',borderRadius:16,padding:13,marginTop:14,alignItems:'center'},timerLabel:{color:'#dce7ff',fontSize:11,fontWeight:'900',letterSpacing:1},timerValue:{color:'#fff',fontSize:30,fontWeight:'900',marginTop:2,letterSpacing:1},
 sectionHeader:{marginTop:4,marginBottom:8},sectionTitle:{color:'#fff',fontSize:18,fontWeight:'900'},
 nextCard:{backgroundColor:'rgba(25,29,38,.97)',borderRadius:18,padding:16,borderWidth:1,borderColor:'#2b313d',borderLeftWidth:5,marginBottom:12},
 nextTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},nextName:{color:'#fff',fontSize:23,fontWeight:'900'},personDot:{fontSize:20},
 nextMeta:{color:'#c7cfdd',fontSize:14,marginTop:6},startsIn:{color:'#8fb0ff',fontSize:14,fontWeight:'900',marginTop:12},
 smallCard:{backgroundColor:'rgba(25,29,38,.94)',borderRadius:14,padding:13,marginBottom:8,borderWidth:1,borderColor:'#2b313d',flexDirection:'row',alignItems:'center'},smallName:{color:'#fff',fontSize:16,fontWeight:'900'},smallMeta:{color:'#9fa8b8',fontSize:12,marginTop:4},smallShift:{color:'#8fb0ff',fontSize:11,fontWeight:'900'},
 empty:{backgroundColor:'rgba(25,29,38,.94)',borderRadius:16,padding:18,borderWidth:1,borderColor:'#2b313d'},emptyText:{color:'#aeb6c4',fontSize:14}
});