import React, {useEffect, useMemo, useState} from 'react';
import {Linking, Platform, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {collection, doc, limit, onSnapshot, orderBy, query} from 'firebase/firestore';
import {FIREBASE_ENABLED, db} from './firebaseConfig';
import {getVehicleLocationConfig} from './LocationService';
import {WebView} from 'react-native-webview';

const distanceMeters=(a,b)=>{
  if(!a||!b) return Infinity;
  const R=6371000,p1=a.latitude*Math.PI/180,p2=b.latitude*Math.PI/180;
  const dp=(b.latitude-a.latitude)*Math.PI/180,dl=(b.longitude-a.longitude)*Math.PI/180;
  const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
};
const ageText=ts=>{
  if(!ts) return 'brak danych';
  const m=Math.max(0,Math.floor((Date.now()-Number(ts))/60000));
  if(m<1) return 'przed chwilą';
  if(m<60) return m+' min temu';
  return Math.floor(m/60)+' h '+(m%60)+' min temu';
};
const idFor=v=>String(v||'SŁUŻBOWY').trim().toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]+/gi,'_')||'SLUZBOWY';

const mapHtml=(loc,warehouses)=>{
  const points=JSON.stringify({loc:loc||null,warehouses:warehouses||[]});
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1.0"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0;background:#11151c}.leaflet-popup-content{font:14px Arial}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const data='+points+';const p=data.loc||{latitude:51.05,longitude:16.65};const map=L.map("map").setView([p.latitude,p.longitude],13);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);if(data.loc){L.marker([p.latitude,p.longitude]).addTo(map).bindPopup("🚚 AUTO").openPopup()}(data.warehouses||[]).filter(x=>x.latitude&&x.longitude).forEach(w=>L.circleMarker([w.latitude,w.longitude],{radius:7}).addTo(map).bindPopup(w.name));</script></body></html>';
};

export default function LiveLocationDashboard({vehicleRegistration='SŁUŻBOWY',warehouseGeo={},reportHistory=[],onApplySuggestion}) {
  const [location,setLocation]=useState(null);
  const [config,setConfig]=useState({});
  const [tick,setTick]=useState(0);
  const [history,setHistory]=useState([]);

  useEffect(()=>{
    let unsub;
    let historyUnsub;
    (async()=>{
      const c=await getVehicleLocationConfig(); setConfig(c);
      if(!FIREBASE_ENABLED||!db) return;
      const vehicleId=idFor(c.vehicleId||vehicleRegistration);
      unsub=onSnapshot(doc(db,'vehicleTracking',vehicleId),s=>setLocation(s.exists()?s.data():null),()=>setLocation(null));
      const historyQuery=query(collection(db,'vehicleTracking',vehicleId,'locations'),orderBy('updatedAt','desc'),limit(120));
      historyUnsub=onSnapshot(historyQuery,s=>setHistory(s.docs.map(d=>d.data())),()=>setHistory([]));
    })();
    return()=>{if(unsub) unsub(); if(historyUnsub) historyUnsub();};
  },[vehicleRegistration]);

  useEffect(()=>{const t=setInterval(()=>setTick(x=>x+1),10000);return()=>clearInterval(t)},[]);

  const warehouses=Object.entries(warehouseGeo||{}).map(([name,v])=>({name,...v}));
  const nearby=useMemo(()=>{
    if(!location) return null;
    return warehouses.filter(w=>w.latitude&&w.longitude).map(w=>({...w,distance:distanceMeters(location,w)})).sort((a,b)=>a.distance-b.distance)[0]||null;
  },[location,warehouseGeo,tick]);

  const speed=location&&Number(location.speed)>0?Math.round(Number(location.speed)*3.6):0;
  const stale=location?Date.now()-Number(location.updatedAt||0)>120000:true;
  const last=reportHistory?.[0];
  let suggestion=null;
  if(location&&!stale){
    if(nearby&&nearby.distance<=220){
      const previous=String(last?.status||'');
      const status=previous==='Czekam na rozładunek'||previous==='Czekam na załadunek'?previous:'Zaczynam pracę, jestem na miejscu';
      suggestion={status,warehouse:nearby.name,distance:Math.round(nearby.distance),text:String(vehicleRegistration||'').toUpperCase()+' '+nearby.name+' '+status.toLowerCase()};
    } else if(speed>=8){
      const route=last?.status==='W drodze'&&String(last?.warehouse||'').includes('->')?String(last.warehouse):'';
      suggestion={status:'W drodze',from:route.split('->')[0]||'',to:route.split('->')[1]||'',text:String(vehicleRegistration||'').toUpperCase()+' w drodze'+(route?' '+route.replace(/\s+/g,''):'')};
    }
  }

  const openMap=async()=>{
    if(!location) return;
    const url='https://www.openstreetmap.org/?mlat='+location.latitude+'&mlon='+location.longitude+'#map=15/'+location.latitude+'/'+location.longitude;
    try{await Linking.openURL(url)}catch(e){}
  };

  const nativeMap=location?<WebView originWhitelist={['*']} source={{html:mapHtml(location,warehouses)}} style={{flex:1}}/>:null;
  const webMap=location?<iframe title="mapa" style={{width:'100%',height:'100%',border:0}} srcDoc={mapHtml(location,warehouses)}/>:null;

  return <ScrollView style={{flex:1,padding:12}} contentContainerStyle={{paddingBottom:110}}>
    <View style={styles.header}><Text style={styles.title}>📍 LOKALIZACJA LIVE</Text><Text style={styles.sub}>{config.enabled===false?'Nadajnik wyłączony':'Służbowy telefon → Firebase → aplikacja'}</Text></View>
    <View style={styles.card}>
      <Text style={styles.big}>{location?(stale?'🟠 NIEAKTUALNA':'🟢 ONLINE'):'🔴 BRAK SYGNAŁU'}</Text>
      <Text style={styles.main}>{location?Number(location.latitude).toFixed(5)+', '+Number(location.longitude).toFixed(5):'Czekam na pierwszy punkt GPS…'}</Text>
      {location&&<Text style={styles.sub}>Aktualizacja: {ageText(location.updatedAt)} · dokładność ±{Math.round(Number(location.accuracy||0))} m · {speed} km/h</Text>}
      <TouchableOpacity style={styles.button} onPress={openMap}><Text style={styles.buttonText}>🗺️ OTWÓRZ MAPĘ</Text></TouchableOpacity>
    </View>
    <View style={styles.card}>
      <Text style={styles.section}>🤖 SUGESTIA RAPORTU</Text>
      {suggestion?<><Text style={styles.suggestion}>{suggestion.text}</Text><Text style={styles.sub}>{suggestion.status==='W drodze'?'Auto wykryło ruch poza strefą magazynu.':'Auto znajduje się w strefie '+suggestion.warehouse+'.'}</Text><TouchableOpacity style={styles.button} onPress={()=>onApplySuggestion&&onApplySuggestion(suggestion)}><Text style={styles.buttonText}>📋 UŻYJ TEJ FORMUŁKI</Text></TouchableOpacity></>:<Text style={styles.sub}>Brak wystarczających danych do bezpiecznej sugestii.</Text>}
    </View>
    <View style={styles.card}>
      <Text style={styles.section}>🏭 NAJBLIŻSZY MAGAZYN</Text>
      {nearby?<Text style={styles.main}>{nearby.name+' · '+Math.round(nearby.distance)+' m'}</Text>:<Text style={styles.sub}>Brak skonfigurowanych stref GPS.</Text>}
      <Text style={styles.sub}>Strefa rozpoznania: 220 m. Poza strefą aplikacja nie zgaduje magazynu.</Text>
    </View>
        <View style={styles.card}>
      <Text style={styles.section}>🧭 HISTORIA TRASY · 7 DNI</Text>
      <Text style={styles.sub}>Punkty starsze niż 7 dni są automatycznie usuwane. Pokazuję ostatnie {history.length} zapisanych punktów.</Text>
      {history.slice(0,6).map((p,i)=><Text key={String(p.updatedAt)+'-'+i} style={styles.history}>{new Date(Number(p.updatedAt)).toLocaleString('pl-PL')} · {Number(p.latitude).toFixed(5)}, {Number(p.longitude).toFixed(5)} · {Number(p.speed||0)>0?Math.round(Number(p.speed)*3.6)+' km/h':'postój'}</Text>)}
    </View>
    <View style={styles.mapWrap}>{location?(Platform.OS==='web'?webMap:nativeMap):<Text style={styles.sub}>Mapa pojawi się po odebraniu lokalizacji.</Text>}</View>
  </ScrollView>;
}

const styles={header:{backgroundColor:'#191d26',borderRadius:20,padding:18,marginBottom:10},title:{color:'#fff',fontSize:23,fontWeight:'900'},sub:{color:'#9ba3b3',fontSize:13,marginTop:5},card:{backgroundColor:'#191d26',borderRadius:18,padding:16,marginBottom:10,borderWidth:1,borderColor:'#2b3240'},big:{color:'#fff',fontSize:18,fontWeight:'900'},main:{color:'#fff',fontSize:17,fontWeight:'800',marginTop:8},section:{color:'#fff',fontSize:16,fontWeight:'900',marginBottom:7},suggestion:{color:'#75a1ff',fontSize:18,fontWeight:'900',marginTop:5},button:{backgroundColor:'#467ff1',borderRadius:12,padding:13,alignItems:'center',marginTop:10},buttonText:{color:'#fff',fontWeight:'900'},history:{color:'#cbd2df',fontSize:12,marginTop:7},mapWrap:{height:300,borderRadius:18,overflow:'hidden',backgroundColor:'#11151c',alignItems:'center',justifyContent:'center',padding:10}};
