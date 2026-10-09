import React, {useEffect, useMemo, useState} from 'react';
import useSecondTicker from './hooks/useSecondTicker';
import {View, Text, StyleSheet, ScrollView, Platform, Linking, TouchableOpacity} from 'react-native';
import {apiGetGps} from './apiClient';
import {WebView} from 'react-native-webview';

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
const serverMillis=ts=>{if(typeof ts?.toMillis==='function')return ts.toMillis();const n=Number(ts);if(Number.isFinite(n))return n;const d=Date.parse(String(ts||''));return Number.isFinite(d)?d:0;};
const idFor=v=>String(v||'').trim().toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]+/gi,'_').slice(0,40);
const reverseGeocode=async loc=>{const lat=Number(loc?.latitude),lon=Number(loc?.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;try{const res=await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=pl&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon),{headers:{Accept:'application/json'}});if(!res.ok)return null;const data=await res.json(),a=data?.address||{};const locality=a.city||a.town||a.village||a.municipality||a.suburb||a.county||'';const road=a.road||a.pedestrian||a.residential||a.highway||'';const house=a.house_number||'';const route=a.ref||a.road_reference||'';const parts=[locality,route&&route!==road?route:'',road+(house?' '+house:'')].filter(Boolean);return parts.length?Array.from(new Set(parts)).join(', '):data?.name||data?.display_name||null;}catch{return null;}};
const mapHtml=loc=>{const lat=Number(loc?.latitude),lon=Number(loc?.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))return '<!doctype html><html><body style="margin:0;background:#0d121b"></body></html>';const safeLat=lat.toFixed(6),safeLon=lon.toFixed(6);return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;width:100%;margin:0;padding:0;background:#0d121b;overflow:hidden}.leaflet-control-attribution{font-size:9px}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const p=['+safeLat+','+safeLon+'];const map=L.map("map",{zoomControl:false,attributionControl:true}).setView(p,15);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap contributors"}).addTo(map);L.marker(p).addTo(map).bindPopup("Aktualna lokalizacja auta").openPopup();setTimeout(()=>map.invalidateSize(),250);</script></body></html>';};

export default function NowDashboard({weeks,rotation,warehouse,times,personColors,weekConfigs,cloudUser,vehicleRegistration}) {
 const [location,setLocation]=useState(null);
 const [locationError,setLocationError]=useState('');
 const [locationAddress,setLocationAddress]=useState('Ustalanie adresu…');
 useSecondTicker(1000);
 useEffect(()=>{
   let cancelled=false;
   const load=async()=>{
     try{
       if(cloudUser?.role==='locator'){
         const selected=await (await import('./apiClient')).apiGetMyGps();
         if(cancelled)return;
         if(!selected){setLocation(null);setLocationError('Brak przypisanego auta lub brak odebranej pozycji GPS.');return;}
         const point={...selected,updatedAt:selected.observed_at};
         setLocation(point);
         const observed=serverMillis(point.updatedAt);
         setLocationError(observed>0 && Date.now()-observed>180000?'Lokalizacja nieaktualna':'');
         return;
       }
       const rows=await apiGetGps();
       if(cancelled)return;
       const requested=idFor(vehicleRegistration);
       const selected=rows.filter(x=>requested? idFor(x.registration||x.id)===requested:true).sort((x,y)=>serverMillis(y.observed_at)-serverMillis(x.observed_at))[0]||null;
       if(!selected){setLocation(null);setLocationError('Brak aktualnej lokalizacji z centralnego API.');return;}
       const point={...selected,updatedAt:selected.observed_at};
       setLocation(point);
       setLocationError(Date.now()-serverMillis(point.updatedAt)>180000?'Lokalizacja nieaktualna':'');
     }catch(e){if(!cancelled){setLocation(null);setLocationError('Nie można pobrać lokalizacji z centralnego API.');}}
   };
   load();const timer=setInterval(load,10000);
   return()=>{cancelled=true;clearInterval(timer);};
 },[cloudUser?.uid,cloudUser?.role,vehicleRegistration]);
 useEffect(()=>{
   let cancelled=false;
   if(!location){setLocationAddress('Brak adresu lokalizacji');return;}
   setLocationAddress('Ustalanie adresu…');
   const timer=setTimeout(async()=>{const address=await reverseGeocode(location);if(!cancelled)setLocationAddress(address||'Nie udało się ustalić adresu');},350);
   return()=>{cancelled=true;clearTimeout(timer);};
 },[location?.latitude?Math.round(Number(location.latitude)*10000):null,location?.longitude?Math.round(Number(location.longitude)*10000):null]);

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
 const openMap=async()=>{if(!location)return;const lat=Number(location.latitude),lon=Number(location.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))return;try{await Linking.openURL('https://www.openstreetmap.org/?mlat='+encodeURIComponent(lat)+'&mlon='+encodeURIComponent(lon)+'#map=16/'+encodeURIComponent(lat)+'/'+encodeURIComponent(lon));}catch{setLocationError('Nie udało się otworzyć mapy. Sprawdź połączenie z internetem.');}};

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

   <View style={S.sectionHeader}><Text style={S.sectionTitle}>📍 Lokalizacja auta</Text></View>
   <View style={S.locationCard}>
     <Text style={S.locationStatus}>{location?(locationError?'🟠 '+locationError:'🟢 AUTO ONLINE'):'🔴 BRAK LOKALIZACJI'}</Text>
     {location&&<><Text style={S.locationCoords}>{locationAddress}</Text><Text style={S.locationMeta}>{Number(location.latitude).toFixed(5)}, {Number(location.longitude).toFixed(5)} · Aktualizacja {new Date(serverMillis(location.updatedAt)).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'})} · ±{Math.round(Number(location.accuracy||0))} m</Text></>}
     <View style={S.miniMap}>{location?(Platform.OS==='web'?<iframe title="mini-mapa-lokalizacji" style={{width:'100%',height:'100%',border:0,display:'block'}} srcDoc={mapHtml(location)}/>:<WebView key={Math.round(Number(location.latitude)*10000)+'_'+Math.round(Number(location.longitude)*10000)} originWhitelist={['*']} source={{html:mapHtml(location),baseUrl:'https://www.openstreetmap.org'}} javaScriptEnabled domStorageEnabled mixedContentMode="always" setSupportMultipleWindows={false} scrollEnabled={false} style={{flex:1,backgroundColor:'#0d121b'}}/>):<Text style={S.locationEmpty}>Mapa pojawi się po odebraniu pozycji GPS.</Text>}</View>
     {location&&<TouchableOpacity accessibilityRole="button" accessibilityLabel="Otwórz aktualną pozycję na mapie" onPress={openMap} style={S.openMapButton}><Text style={S.openMapButtonText}>🗺️ OTWÓRZ MAPĘ NA ŻYWO</Text></TouchableOpacity>}
   </View>
 </ScrollView>;
}

const S=StyleSheet.create({
 scroll:{flex:1},content:{padding:12,paddingBottom:130},
 hero:{backgroundColor:'#315fb8',borderRadius:22,padding:20,marginBottom:14,borderWidth:1,borderColor:'#5480d0',shadowColor:'#000',shadowOpacity:0.2,shadowRadius:10,shadowOffset:{width:0,height:4},elevation:4},
 liveRow:{flexDirection:'row',alignItems:'center',gap:8},liveDot:{width:9,height:9,borderRadius:5,backgroundColor:'#fff'},eyebrow:{color:'#eaf0ff',fontSize:13,fontWeight:'900',letterSpacing:1},
 heroName:{color:'#fff',fontSize:30,fontWeight:'900',marginTop:7,letterSpacing:0.2},heroMeta:{color:'#e5edff',fontSize:14,marginTop:6},heroTime:{color:'#fff',fontSize:18,fontWeight:'800',marginTop:4},
 timer:{backgroundColor:'rgba(7,12,22,.24)',borderRadius:16,padding:14,marginTop:14,alignItems:'center',borderWidth:1,borderColor:'rgba(255,255,255,.14)'},timerLabel:{color:'#dce7ff',fontSize:11,fontWeight:'900',letterSpacing:1},timerValue:{color:'#fff',fontSize:30,fontWeight:'900',marginTop:2,letterSpacing:1},
 sectionHeader:{marginTop:4,marginBottom:8},sectionTitle:{color:'#fff',fontSize:18,fontWeight:'900'},
 nextCard:{backgroundColor:'rgba(20,25,34,.97)',borderRadius:18,padding:16,borderWidth:1,borderColor:'#303a4a',borderLeftWidth:5,marginBottom:12},
 nextTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},nextName:{color:'#fff',fontSize:23,fontWeight:'900'},personDot:{fontSize:20},
 nextMeta:{color:'#c7cfdd',fontSize:14,marginTop:6},startsIn:{color:'#8fb0ff',fontSize:14,fontWeight:'900',marginTop:12},
 smallCard:{backgroundColor:'rgba(20,25,34,.97)',borderRadius:14,padding:13,marginBottom:8,borderWidth:1,borderColor:'#2b313d',flexDirection:'row',alignItems:'center'},smallName:{color:'#fff',fontSize:16,fontWeight:'900'},smallMeta:{color:'#9fa8b8',fontSize:12,marginTop:4},smallShift:{color:'#8fb0ff',fontSize:11,fontWeight:'900'},
 empty:{backgroundColor:'rgba(20,25,34,.97)',borderRadius:16,padding:18,borderWidth:1,borderColor:'#2b313d'},emptyText:{color:'#aeb6c4',fontSize:14},locationCard:{backgroundColor:'rgba(20,25,34,.97)',borderRadius:18,padding:12,borderWidth:1,borderColor:'#303a4a',marginBottom:12},locationStatus:{color:'#fff',fontSize:16,fontWeight:'900'},locationCoords:{color:'#c7cfdd',fontSize:14,fontWeight:'800',marginTop:5},locationMeta:{color:'#8f99aa',fontSize:12,marginTop:4},miniMap:{height:180,borderRadius:14,overflow:'hidden',backgroundColor:'#0d121b',borderWidth:1,borderColor:'#2b313d',marginTop:10,alignItems:'center',justifyContent:'center'},openMapButton:{backgroundColor:'#3f78ed',borderRadius:12,padding:13,alignItems:'center',marginTop:10},openMapButtonText:{color:'#fff',fontWeight:'900',fontSize:14},locationEmpty:{color:'#8f99aa',fontSize:13,textAlign:'center',padding:18}
});
