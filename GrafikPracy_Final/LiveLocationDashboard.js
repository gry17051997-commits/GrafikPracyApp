import React, {useEffect, useMemo, useState} from 'react';
import {Linking, Platform, ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {collection, doc, getDoc, limit, onSnapshot, orderBy, query} from 'firebase/firestore';
import {FIREBASE_ENABLED, db, auth} from './firebaseConfig';
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

const geocodeAddress=async(point)=>{
  const lat=Number(point?.latitude), lon=Number(point?.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)) return null;
  const url='https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=pl&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon);
  try{
    const res=await fetch(url,{headers:{Accept:'application/json'}});
    if(!res.ok) return null;
    const data=await res.json();
    const a=data?.address||{};
    const locality=a.city||a.town||a.village||a.municipality||a.hamlet||a.suburb||'';
    const road=a.road||'';
    const ref=a.ref||a.road_ref||'';
    const house=a.house_number||'';
    let street='';
    if(road && ref && !road.toUpperCase().includes(String(ref).toUpperCase())) street=String(ref)+' '+road;
    else street=road||ref;
    if(street && house) street+=' '+house;
    if(locality && street) return locality+', '+street;
    return street||locality||data?.display_name||null;
  }catch(e){ return null; }
};

const mapHtml=(loc,warehouses)=>{
  const points=JSON.stringify({loc:loc||null,warehouses:warehouses||[]});
  return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1.0"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;margin:0;background:#11151c}.leaflet-popup-content{font:14px Arial}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const data='+points+';const p=data.loc||{latitude:51.05,longitude:16.65};const map=L.map("map").setView([p.latitude,p.longitude],13);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);if(data.loc){L.marker([p.latitude,p.longitude]).addTo(map).bindPopup("🚚 AUTO").openPopup()}(data.warehouses||[]).filter(x=>x.latitude&&x.longitude).forEach(w=>L.circleMarker([w.latitude,w.longitude],{radius:7}).addTo(map).bindPopup(w.name));</script></body></html>';
};

export default function LiveLocationDashboard({vehicleRegistration='SŁUŻBOWY',warehouseGeo={},reportHistory=[],onApplySuggestion,cloudUser=null}) {
  const [location,setLocation]=useState(null);
  const [config,setConfig]=useState({});
  const [tick,setTick]=useState(0);
  const [history,setHistory]=useState([]);
  const [locationError,setLocationError]=useState('');
  const [isAdmin,setIsAdmin]=useState(false);
  const [historyAddresses,setHistoryAddresses]=useState({});
  const geocodeCache=React.useRef({});

  useEffect(()=>{
    if(!db || !cloudUser?.uid) {
      setIsAdmin(false);
      return;
    }
    return onSnapshot(doc(db,'users',cloudUser.uid), snap=>setIsAdmin(snap.exists() && snap.data()?.role==='admin'), ()=>setIsAdmin(false));
  },[cloudUser?.uid]);

  useEffect(()=>{
    let cancelled=false;
    const points=(history||[]).slice(0,6);
    (async()=>{
      const next={...historyAddresses};
      for(const p of points){
        const key=Number(p.latitude).toFixed(5)+','+Number(p.longitude).toFixed(5);
        if(next[key] || geocodeCache.current[key]) { next[key]=next[key]||geocodeCache.current[key]; continue; }
        const address=await geocodeAddress(p);
        if(address) { geocodeCache.current[key]=address; next[key]=address; }
        if(!cancelled) setHistoryAddresses({...next});
        await new Promise(resolve=>setTimeout(resolve,1100));
      }
    })();
    return()=>{cancelled=true;};
  },[history]);

  useEffect(()=>{
    let historyUnsub;
    let vehiclesUnsub;
    let cancelled=false;
    (async()=>{
      const c=await getVehicleLocationConfig();
      if(cancelled) return;
      setConfig(c);
      if(!FIREBASE_ENABLED||!db){ setLocationError('Firebase lokalizacji jest wyłączony.'); return; }
      if(!cloudUser?.uid){ setLocationError('Zaloguj się do wspólnego konta, aby odbierać lokalizację telefonu służbowego.'); return; }
      let cloudConfig={};
      try { const snap=await getDoc(doc(db,'locationConfig','main')); cloudConfig=snap.exists()?snap.data()||{}:{}; } catch(e) { setLocationError('Brak dostępu do wspólnej konfiguracji GPS: '+(e?.code||'unknown')); }

      // Na WWW AsyncStorage jest osobne od telefonu służbowego, więc lokalne
      // przypisanie pojazdu nie może być jedynym źródłem identyfikatora.
      // Pobieramy aktywne nadajniki z Firebase i wybieramy przypisany numer,
      // a gdy WWW nie ma jeszcze numeru, najnowszy nadajnik.
      const requestedId=idFor(cloudConfig.vehicleId||c.vehicleId||vehicleRegistration);
      const vehicleRef=collection(db,'vehicleTracking');
      vehiclesUnsub=onSnapshot(vehicleRef,snap=>{
        const rows=snap.docs.map(d=>({id:d.id,...d.data()})).filter(x=>Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude))&&x.updatedAt);
        if(!rows.length){ setLocation(null); setLocationError('Brak punktów GPS w chmurze. Sprawdź, czy telefon służbowy ma aktywny nadajnik.'); return; }
        const now=Date.now();
        const exact=requestedId && rows.find(x=>idFor(x.vehicleId||x.registration||x.id)===requestedId);
        const exactFresh=exact && (now-Number(exact.updatedAt||0)<=180000);
        const freshRows=rows.filter(x=>now-Number(x.updatedAt||0)<=180000);
        const selected=exactFresh ? exact : freshRows.sort((a,b)=>Number(b.updatedAt||0)-Number(a.updatedAt||0))[0] || rows.sort((a,b)=>Number(b.updatedAt||0)-Number(a.updatedAt||0))[0];
        setLocation(selected);
        setLocationError(now-Number(selected.updatedAt||0)>180000?'Nadajnik istnieje, ale ostatnia pozycja jest starsza niż 3 minuty.':'');
        setConfig(prev=>({...prev,vehicleId:selected.vehicleId||selected.id,registration:selected.registration||prev.registration}));

        if(historyUnsub) historyUnsub();
        const selectedId=idFor(selected.vehicleId||selected.registration||selected.id);
        const historyQuery=query(collection(db,'vehicleTracking',selectedId,'locations'),orderBy('updatedAt','desc'),limit(120));
        historyUnsub=onSnapshot(historyQuery,s=>setHistory(s.docs.map(d=>d.data())),e=>{setHistory([]);setLocationError('GPS działa, ale historia trasy jest niedostępna: '+(e?.code||'unknown'));});
      },e=>{
        setLocation(null); setHistory([]);
        setLocationError(e?.code==='permission-denied'?'Brak uprawnień Firebase do odczytu lokalizacji. Telefon B musi być zalogowany do konta pracownika.':'Nie można połączyć się z chmurą GPS: '+(e?.code||'unknown'));
      });
    })();
    return()=>{cancelled=true; if(vehiclesUnsub) vehiclesUnsub(); if(historyUnsub) historyUnsub();};
  },[vehicleRegistration,cloudUser?.uid]);

  useEffect(()=>{const t=setInterval(()=>setTick(x=>x+1),10000);return()=>clearInterval(t)},[]);

  const warehouses=Object.entries(warehouseGeo||{}).map(([name,v])=>({name,...v}));
  const nearby=useMemo(()=>{
    if(!location) return null;
    return warehouses.filter(w=>w.latitude&&w.longitude).map(w=>({...w,distance:distanceMeters(location,w)})).sort((a,b)=>a.distance-b.distance)[0]||null;
  },[location,warehouseGeo,tick]);

  const speed=location&&Number(location.speed)>0?Math.round(Number(location.speed)*3.6):0;
  const stale=location?Date.now()-Number(location.updatedAt||0)>180000:true;
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

  return <ScrollView style={{flex:1,padding:12}} contentContainerStyle={{paddingBottom:130}}>
        <View style={styles.header}><View style={styles.headerTop}><Text style={styles.title}>📍 LOKALIZACJA LIVE</Text><Text style={styles.sub}>{config.enabled===false?'Nadajnik wyłączony':'Służbowy telefon → Firebase → aplikacja'}</Text></View></View>
    <View style={styles.card}>
      <Text style={styles.big}>{location?(stale?'🟠 NIEAKTUALNA':'🟢 ONLINE'):'🔴 BRAK SYGNAŁU'}</Text>
      <Text style={styles.main}>{location?Number(location.latitude).toFixed(5)+', '+Number(location.longitude).toFixed(5):'Czekam na pierwszy punkt GPS…'}</Text>
      {location&&<Text style={styles.sub}>Aktualizacja: {ageText(location.updatedAt)} · dokładność ±{Math.round(Number(location.accuracy||0))} m · {speed} km/h</Text>}
      {!!locationError&&<Text style={styles.error}>⚠️ {locationError}</Text>}
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
      {history.slice(0,6).map((p,i)=>{const key=Number(p.latitude).toFixed(5)+','+Number(p.longitude).toFixed(5); const address=historyAddresses[key]; return <Text key={String(p.updatedAt)+'-'+i} style={styles.history}>{new Date(Number(p.updatedAt)).toLocaleString('pl-PL')} · {address||'Ustalanie adresu…'} · {Number(p.speed||0)>0?Math.round(Number(p.speed)*3.6)+' km/h':'postój'}</Text>;})}
    </View>
    <View style={styles.mapWrap}>{location?(Platform.OS==='web'?webMap:nativeMap):<Text style={styles.sub}>Mapa pojawi się po odebraniu lokalizacji.</Text>}</View>
  </ScrollView>;
}

const styles={headerTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},error:{color:'#ff9b9b',fontSize:13,marginTop:8,fontWeight:'800'},header:{backgroundColor:'#141922',borderRadius:20,padding:18,marginBottom:10,borderWidth:1,borderColor:'#303a4a'},title:{color:'#fff',fontSize:23,fontWeight:'900'},sub:{color:'#9ba3b3',fontSize:13,marginTop:5},card:{backgroundColor:'#141922',borderRadius:18,padding:16,marginBottom:10,borderWidth:1,borderColor:'#303a4a',shadowColor:'#000',shadowOpacity:0.12,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:2},big:{color:'#fff',fontSize:18,fontWeight:'900'},main:{color:'#fff',fontSize:17,fontWeight:'800',marginTop:8},section:{color:'#fff',fontSize:16,fontWeight:'900',marginBottom:7},suggestion:{color:'#75a1ff',fontSize:18,fontWeight:'900',marginTop:5},button:{backgroundColor:'#3f78ed',borderRadius:13,padding:13,alignItems:'center',marginTop:10,borderWidth:1,borderColor:'#5d8ff5'},buttonText:{color:'#fff',fontWeight:'900'},history:{color:'#cbd2df',fontSize:12,marginTop:7},mapWrap:{height:300,borderRadius:18,overflow:'hidden',backgroundColor:'#0d121b',borderWidth:1,borderColor:'#303a4a',alignItems:'center',justifyContent:'center',padding:10}};

