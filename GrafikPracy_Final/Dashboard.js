import React,{useEffect,useMemo,useState} from 'react';
import {View,Text,StyleSheet} from 'react-native';

const PEOPLE={P:'Paweł',M:'Mateusz',L:'Łukasz'};
const DAYS=['Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota','Niedziela'];
const monday=d=>{const x=new Date(d),n=x.getDay();x.setDate(x.getDate()+(n===0?-6:1-n));x.setHours(0,0,0,0);return x;};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;};
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parseTime=v=>{const [h,m]=String(v||'00:00').split(':').map(Number);return [Number.isFinite(h)?h:0,Number.isFinite(m)?m:0];};
const dateTime=(base,v)=>{const x=new Date(base),[h,m]=parseTime(v);x.setHours(h,m,0,0);return x;};
const fallbackWeek=(rotation,warehouse)=>{const a=rotation==='P'?'P':'M',b=a==='P'?'M':'P';return DAYS.map((_,i)=>({warehouse,shifts:[{person:i===6?'L':i%2?a:b},{person:i===6?'L':i%2?b:a}]}));};
const fmt=d=>d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
const countdown=end=>{const sec=Math.max(0,Math.floor((end-Date.now())/1000));return `${String(Math.floor(sec/3600)).padStart(2,'0')}:${String(Math.floor(sec%3600/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;};

export default function Dashboard({weeks,rotation,warehouse,times,now=new Date()}){
 const [,tick]=useState(0);
 useEffect(()=>{const id=setInterval(()=>tick(x=>x+1),1000);return()=>clearInterval(id);},[]);
 const info=useMemo(()=>{
  const base=monday(now),all=[];
  [0,1].forEach(wo=>{const ws=addDays(base,wo*7),w=weeks?.[iso(ws)]||fallbackWeek(rotation,warehouse);(w||[]).forEach((d,di)=>(d.shifts||[]).forEach((s,si)=>{if(!s.person)return;const start=dateTime(addDays(ws,di),si===0?times?.s1:times?.s2),end=dateTime(addDays(ws,di),si===0?times?.e1:times?.e2);if(end<=start)end.setDate(end.getDate()+1);all.push({person:s.person,warehouse:s.warehouse||d.warehouse||warehouse,start,end,day:di,date:addDays(ws,di),shift:si+1});}));});
  return {active:all.filter(x=>now>=x.start&&now<x.end).sort((a,b)=>a.end-b.end)[0]||null,next:all.filter(x=>x.start>now).sort((a,b)=>a.start-b.start)[0]||null};
 },[weeks,rotation,warehouse,times,now]);
 const active=info.active,next=info.next;
 return <View style={S.wrap}>
  <View style={S.card}>
   <Text style={S.kicker}>🟢 KTO TERAZ PRACUJE?</Text>
   {active?<><Text style={S.name}>{PEOPLE[active.person]||active.person}</Text><Text style={S.line}>📦 {active.warehouse}</Text><Text style={S.line}>🕐 {fmt(active.start)} – {fmt(active.end)}</Text><Text style={S.count}>⏳ {countdown(active.end)}</Text></>:<Text style={S.name}>Nikt</Text>}
  </View>
  <View style={S.next}>
   <Text style={S.kicker}>⏭️ NASTĘPNA ZMIANA</Text>
   {next?<><Text style={S.nextName}>{PEOPLE[next.person]||next.person}</Text><Text style={S.line}>📦 {next.warehouse}</Text><Text style={S.line}>📅 {DAYS[next.day]} · {String(next.date.getDate()).padStart(2,'0')}.{String(next.date.getMonth()+1).padStart(2,'0')}</Text><Text style={S.line}>🕐 {fmt(next.start)} · zmiana {next.shift}</Text></>:<Text style={S.line}>Brak zaplanowanej kolejnej zmiany.</Text>}
  </View>
 </View>;
}
const S=StyleSheet.create({wrap:{paddingHorizontal:14},card:{backgroundColor:'#467ff1',borderRadius:20,padding:20,marginBottom:12},next:{backgroundColor:'rgba(28,32,41,0.96)',borderRadius:17,padding:17,marginBottom:12,borderWidth:1,borderColor:'#2b313d'},kicker:{color:'#e7efff',fontWeight:'900',fontSize:13},name:{color:'#fff',fontSize:29,fontWeight:'900',marginTop:5},nextName:{color:'#fff',fontSize:23,fontWeight:'900',marginTop:5},line:{color:'#e6edff',fontSize:15,marginTop:5},count:{color:'#fff',fontSize:25,fontWeight:'900',marginTop:10}});
