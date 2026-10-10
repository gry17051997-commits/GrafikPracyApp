import React,{useEffect,useMemo,useState} from 'react';
import {Linking,Modal,Platform,ScrollView,Text,TouchableOpacity,View} from 'react-native';
import {api,apiGetGps} from './apiClient';
import {WebView} from 'react-native-webview';
import useSecondTicker from './hooks/useSecondTicker';
const normalizeVehicleId=value=>String(value||'').trim().toUpperCase().replace(/[^A-Z0-9ĄĆĘŁŃÓŚŹŻ]+/gi,'_').slice(0,40);

const serverMillis=v=>{if(typeof v==='number')return v;if(typeof v==='string')return Date.parse(v)||0;if(typeof v?.toMillis==='function')return v.toMillis();return 0;};
const distanceMeters=(a,b)=>{if(!a||!b)return Infinity;const R=6371000,p1=a.latitude*Math.PI/180,p2=b.latitude*Math.PI/180,dp=(b.latitude-a.latitude)*Math.PI/180,dl=(b.longitude-a.longitude)*Math.PI/180,x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));};
const ageText=ts=>{const m=Math.max(0,Math.floor((Date.now()-serverMillis(ts))/60000));if(m<1)return 'przed chwilą';if(m<60)return m+' min temu';return Math.floor(m/60)+' h '+m%60+' min temu';};
const geocodeAddress=async point=>{const lat=Number(point?.latitude),lon=Number(point?.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;try{const res=await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude='+encodeURIComponent(lat)+'&longitude='+encodeURIComponent(lon)+'&localityLanguage=pl',{headers:{Accept:'application/json'}});if(res.ok){const d=await res.json(),locality=d.city||d.locality||d.principalSubdivision||'',road=d.localityInfo?.informative?.find(x=>/street|road|ulica|droga/i.test(x.description||''))?.name||'';const address=[locality,road].filter(Boolean).join(', ');if(address)return address;}}catch{}try{const res=await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=pl&lat='+encodeURIComponent(lat)+'&lon='+encodeURIComponent(lon),{headers:{Accept:'application/json'}});if(res.ok){const d=await res.json(),a=d?.address||{},locality=a.city||a.town||a.village||a.municipality||a.suburb||a.county||'',road=a.road||a.pedestrian||a.residential||a.highway||'',house=a.house_number||'',ref=a.ref||'';return [locality,ref&&ref!==road?ref:'',road+(house?' '+house:'')].filter(Boolean).join(', ')||d.name||null;}}catch{}return null;};
const mapUrl=loc=>{const lat=Number(loc?.latitude),lon=Number(loc?.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;const d=0.006;return 'https://www.openstreetmap.org/export/embed.html?bbox='+(lon-d)+'%2C'+(lat-d)+'%2C'+(lon+d)+'%2C'+(lat+d)+'&layer=mapnik&marker='+lat+'%2C'+lon;};
const buildLiveMapHtml=(current,rows)=>{
 const valid=(rows||[]).filter(p=>Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude))&&serverMillis(p.updatedAt)>0).sort((a,b)=>serverMillis(a.updatedAt)-serverMillis(b.updatedAt));
 const segments=[];let segment=[],previous=null;
 for(const p of valid){
   const point={latitude:Number(p.latitude),longitude:Number(p.longitude),speed:Number(p.speed||0),time:serverMillis(p.updatedAt)};
   const moved=previous?distanceMeters(previous,point):0;
   const continuous=previous&&point.time>previous.time&&point.time-previous.time<=5*60*1000;
   const isMoving=point.speed*3.6>=4||moved>=80;
   if(!continuous){if(segment.length>1)segments.push(segment);segment=[];}
   if(continuous&&isMoving&&moved>=15){
     if(!segment.length)segment.push([previous.latitude,previous.longitude]);
     segment.push([point.latitude,point.longitude]);
   }else{if(segment.length>1)segments.push(segment);segment=[];}
   previous=point;
 }
 if(segment.length>1)segments.push(segment);
 const payload=JSON.stringify({current:current?{lat:Number(current.latitude),lon:Number(current.longitude),speed:Number(current.speed||0),time:serverMillis(current.updatedAt)}:null,segments}).replace(/</g,'\\u003c');
 return '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>html,body,#map{height:100%;width:100%;margin:0;background:#101722}.leaflet-control-attribution{font-size:9px}</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>const d='+payload+';const map=L.map("map",{zoomControl:true}).setView(d.current?[d.current.lat,d.current.lon]:[51.0,16.8],d.current?14:7);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);let bounds=[];d.segments.forEach(points=>{const line=L.polyline(points,{color:"#2d7cff",weight:5,opacity:.9}).addTo(map);bounds.push(...points);});if(d.current){const marker=L.circleMarker([d.current.lat,d.current.lon],{radius:9,color:"#fff",weight:3,fillColor:d.current.speed*3.6>=8?"#22c55e":"#f59e0b",fillOpacity:1}).addTo(map);marker.bindPopup("Aktualna pozycja<br>Prędkość: "+Math.round(d.current.speed*3.6)+" km/h<br>Aktualizacja: "+new Date(d.current.time).toLocaleTimeString("pl-PL"));bounds.push([d.current.lat,d.current.lon]);}if(bounds.length>1)map.fitBounds(bounds,{padding:[20,20],maxZoom:16});else if(bounds.length===1)map.setView(bounds[0],15);</script></body></html>';
};

export default function LiveLocationDashboard({vehicleRegistration='',warehouseGeo={},reportHistory=[],onApplySuggestion}){
 const [location,setLocation]=useState(null),[history,setHistory]=useState([]),[locationError,setLocationError]=useState(''),[locationAddress,setLocationAddress]=useState('Ustalanie adresu…'),[selectedPoint,setSelectedPoint]=useState(null);
 const refreshTick=useSecondTicker(10000);
 const load=async()=>{try{const rows=await apiGetGps();const requested=normalizeVehicleId(vehicleRegistration);const selected=rows.filter(x=>requested?normalizeVehicleId(x.registration||x.id)===requested:true).sort((a,b)=>serverMillis(b.observed_at)-serverMillis(a.observed_at))[0]||null;if(!selected){setLocationError('API nie zwróciło nowej pozycji. Zachowuję ostatnią znaną lokalizację.');return;}const point={...selected,updatedAt:selected.observed_at};setLocation(point);const h=await api('/gps/'+encodeURIComponent(selected.id)+'/history');setHistory((h.history||[]).map(x=>({...x,updatedAt:x.observed_at})));setLocationError(Date.now()-serverMillis(point.updatedAt)>180000?'Nadajnik istnieje, ale ostatnia pozycja jest starsza niż 3 minuty.':'');}catch(e){setLocationError(e?.status===401?'Brak autoryzacji API. Zachowuję ostatnią znaną lokalizację.':'Błąd połączenia z API. Zachowuję ostatnią znaną lokalizację i pokazuję jej wiek.');}};
 useEffect(()=>{load();},[vehicleRegistration,refreshTick]);
 useEffect(()=>{let cancelled=false;if(!location){setLocationAddress('Brak adresu lokalizacji');return;}setLocationAddress('Ustalanie adresu…');const timer=setTimeout(async()=>{const address=await geocodeAddress(location);if(!cancelled)setLocationAddress(address||'Nie udało się ustalić adresu');},350);return()=>{cancelled=true;clearTimeout(timer);};},[location?.latitude?Math.round(Number(location.latitude)*10000):null,location?.longitude?Math.round(Number(location.longitude)*10000):null]);
 const warehouses=Object.entries(warehouseGeo||{}).map(([name,v])=>({name,...v}));
 const nearby=useMemo(()=>{if(!location)return null;return warehouses.filter(w=>w.latitude&&w.longitude).map(w=>({...w,distance:distanceMeters(location,w)})).sort((a,b)=>a.distance-b.distance)[0]||null;},[location,warehouseGeo]);
 const speed=location&&Number(location.speed)>0?Math.round(Number(location.speed)*3.6):0,stale=location?Date.now()-serverMillis(location.updatedAt)>180000:true;
 const currentRegistration=String(location?.registration||vehicleRegistration).trim().toUpperCase();
 const last=reportHistory?.find(r=>currentRegistration&&String(r?.text||'').trim().toUpperCase().startsWith(currentRegistration+' '))||null;
 let suggestion=null;
 if(location&&!stale){
   let candidate=null;
   if(nearby&&nearby.distance<=220){const previousStatus=String(last?.status||'');const status=previousStatus==='Czekam na rozładunek'||previousStatus==='Czekam na załadunek'?previousStatus:'Zaczynam pracę, jestem na miejscu';candidate={status,warehouse:nearby.name,distance:Math.round(nearby.distance),text:String(location.registration||vehicleRegistration).toUpperCase()+' '+nearby.name+' '+status.toLowerCase()};}
   else if(speed>=8)candidate={status:'W drodze',from:'',to:'',text:String(location.registration||vehicleRegistration).toUpperCase()+' w drodze'};
   const lastStatus=String(last?.status||'');
   const lastCreated=serverMillis(last?.createdAt);
   const sameStatus=!!candidate&&lastStatus===candidate.status;
   const sameStop=!!candidate?.warehouse&&String(last?.warehouse||'').split('->')[0]===candidate.warehouse;
   const recentlyReported=lastCreated>0&&Date.now()-lastCreated<3*60*1000;
   if(candidate&&!(sameStatus&&(!candidate.warehouse||sameStop||recentlyReported)))suggestion=candidate;
 }
 const openMap=async()=>{if(!location)return;try{await Linking.openURL('https://www.openstreetmap.org/?mlat='+location.latitude+'&mlon='+location.longitude+'#map=15/'+location.latitude+'/'+location.longitude);}catch{}};
 const historyRows=useMemo(()=>buildGpsEvents(history).slice(-6).reverse(),[history]);
 return <ScrollView style={{flex:1,padding:12}} contentContainerStyle={{paddingBottom:130}}>
  <View style={styles.header}><Text style={styles.title}>📍 LOKALIZACJA LIVE</Text><Text style={styles.sub}>Telefon → centralny API → aplikacja</Text></View>
  <View style={styles.card}><Text style={styles.big}>{location?(stale?'🟠 NIEAKTUALNA':(speed>5?'🚚 ONLINE · W RUCHU':'🅿️ ONLINE · POSTÓJ')):'🔴 BRAK SYGNAŁU'}</Text><Text style={styles.main}>{location?locationAddress:'Czekam na pierwszy punkt GPS…'}</Text>{location&&<Text style={styles.sub}>{Number(location.latitude).toFixed(5)+', '+Number(location.longitude).toFixed(5)}</Text>}{location&&<Text style={styles.sub}>Aktualizacja: {ageText(location.updatedAt)} · ±{Math.round(Number(location.accuracy||0))} m · {speed} km/h · {location.registration}</Text>}{!!locationError&&<Text style={styles.error}>⚠️ {locationError}</Text>}<TouchableOpacity style={styles.button} onPress={openMap}><Text style={styles.buttonText}>🗺️ OTWÓRZ MAPĘ</Text></TouchableOpacity></View>
  <View style={styles.card}><Text style={styles.section}>🤖 SUGESTIA RAPORTU</Text>{suggestion?<><Text style={styles.suggestion}>{suggestion.text}</Text><TouchableOpacity style={styles.button} onPress={()=>onApplySuggestion&&onApplySuggestion(suggestion)}><Text style={styles.buttonText}>📋 UŻYJ TEJ FORMUŁKI</Text></TouchableOpacity></>:<Text style={styles.sub}>Brak wystarczających danych.</Text>}</View>
  <View style={styles.card}><Text style={styles.section}>🏭 NAJBLIŻSZY MAGAZYN</Text><Text style={styles.main}>{nearby?nearby.name+' · '+Math.round(nearby.distance)+' m':'Brak skonfigurowanych stref GPS.'}</Text></View>
  <View style={styles.card}><Text style={styles.section}>🗺️ LIVE MAPA I ZAPISANA TRASA</Text><Text style={styles.sub}>Niebieska linia oznacza przejazdy, znacznik pokazuje aktualną pozycję. Mapa odświeża się co 10 sekund.</Text><View style={styles.mapWrap}>{location?(Platform.OS==='web'?<iframe title="mapa live z trasą" style={{width:'100%',height:'100%',border:0}} srcDoc={buildLiveMapHtml(location,history)}/>:<WebView key={String(location.id||location.registration)+'_'+serverMillis(location.updatedAt)+'_'+history.length} originWhitelist={['https://*','http://*']} source={{html:buildLiveMapHtml(location,history)}} javaScriptEnabled domStorageEnabled setSupportMultipleWindows={false} style={{flex:1,backgroundColor:'#11151c'}}/>):<Text style={styles.sub}>Mapa pojawi się po odebraniu lokalizacji.</Text>}</View></View>  <View style={styles.card}><Text style={styles.section}>🧭 PRZEJAZDY I POSTOJE · 7 DNI</Text>{historyRows.length?historyRows.map((event,i)=><TouchableOpacity key={event.startAt+'_'+i} style={styles.historyRow} onPress={()=>setSelectedPoint(event.point)}><Text style={styles.history}>{event.moving?'🚚 PRZEJAZD':'🅿️ POSTÓJ'} · {formatDuration(event.duration)}{event.moving?' · śr. '+event.averageSpeed+' km/h':''}</Text><Text style={styles.historyHint}>{new Date(event.startAt).toLocaleString('pl-PL')}{event.endAt!==event.startAt?' – '+new Date(event.endAt).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}):''} · dotknij, aby zobaczyć punkt ›</Text></TouchableOpacity>):<Text style={styles.sub}>Brak zapisanej historii GPS z ostatnich 7 dni.</Text>}</View>

  <Modal visible={!!selectedPoint} transparent animationType="slide" onRequestClose={()=>setSelectedPoint(null)}><View style={styles.modalBackdrop}><View style={styles.modalCard}><Text style={styles.section}>📍 SZCZEGÓŁY PUNKTU GPS</Text>{selectedPoint&&<><Text style={styles.main}>{new Date(serverMillis(selectedPoint.updatedAt)).toLocaleString('pl-PL')}</Text><Text style={styles.sub}>{Number(selectedPoint.speed||0)*3.6>5?'🚚 Ruch powyżej 5 km/h':'🅿️ Postój (do 5 km/h)'}</Text><Text style={styles.sub}>Prędkość: {Math.round(Number(selectedPoint.speed||0)*3.6)} km/h · Dokładność: ±{Math.round(Number(selectedPoint.accuracy||0))} m</Text><Text style={styles.sub}>Czas postoju w pobliżu: {formatDuration(stopDuration(history,selectedPoint))}</Text><Text style={styles.sub}>Współrzędne: {Number(selectedPoint.latitude).toFixed(6)}, {Number(selectedPoint.longitude).toFixed(6)}</Text><View style={styles.detailMap}>{Platform.OS==='web'?<iframe title="pozycja historyczna" style={{width:'100%',height:'100%',border:0}} src={mapUrl(selectedPoint)}/>:<WebView key={'history-'+serverMillis(selectedPoint.updatedAt)} originWhitelist={['https://www.openstreetmap.org']} source={{uri:mapUrl(selectedPoint)}} javaScriptEnabled domStorageEnabled style={{flex:1}}/>}</View><TouchableOpacity style={styles.button} onPress={()=>Linking.openURL('https://www.openstreetmap.org/?mlat='+selectedPoint.latitude+'&mlon='+selectedPoint.longitude+'#map=17/'+selectedPoint.latitude+'/'+selectedPoint.longitude)}><Text style={styles.buttonText}>OTWÓRZ TEN PUNKT NA MAPIE</Text></TouchableOpacity></>}<TouchableOpacity style={styles.closeButton} onPress={()=>setSelectedPoint(null)}><Text style={styles.buttonText}>ZAMKNIJ</Text></TouchableOpacity></View></View></Modal>
 </ScrollView>;
}
const buildGpsEvents=rows=>{
 const points=[...(rows||[])].filter(p=>serverMillis(p.updatedAt)>0&&Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude))).sort((a,b)=>serverMillis(a.updatedAt)-serverMillis(b.updatedAt));
 const classified=[];let previous=null,lastStable=false;
 for(const point of points){
  const t=serverMillis(point.updatedAt),gap=previous?t-serverMillis(previous.updatedAt):0,moved=previous?distanceMeters(previous,point):0;
  const gpsSpeed=Math.max(0,Number(point.speed||0)*3.6);
  const derivedSpeed=previous&&gap>0&&gap<=180000&&moved>=30?moved/gap*3600:0;
  const speed=Math.max(gpsSpeed,derivedSpeed);
  let moving=speed>=8||moved>=80;
  if(speed>5&&speed<8&&moved<80)moving=lastStable;
  classified.push({point,t,moving,speed,moved,gap});
  if(classified.length>=3){
   const a=classified[classified.length-3],b=classified[classified.length-2],c=classified[classified.length-1];
   if(a.moving===c.moving&&b.moving!==a.moving&&b.gap<=180000&&c.gap<=180000)b.moving=a.moving;
  }
  if(speed>=8||moved>=80)lastStable=true;else if(speed<=5&&moved<40)lastStable=false;
  previous=point;
 }
 const events=[];
 for(const sample of classified){
  const state=sample.moving,prev=events[events.length-1];
  const continuous=prev&&sample.t-prev.endAt<=5*60*1000&&sample.t>=prev.endAt;
  if(prev&&prev.moving===state&&continuous){
   prev.endAt=sample.t;prev.duration=prev.endAt-prev.startAt;prev.points.push(sample.point);prev.point=sample.point;
   prev.speedTotal+=sample.speed;prev.speedCount++;prev.averageSpeed=Math.round(prev.speedTotal/prev.speedCount);
  }else{
   events.push({moving:state,startAt:sample.t,endAt:sample.t,duration:0,points:[sample.point],point:sample.point,averageSpeed:Math.round(sample.speed),speedTotal:sample.speed,speedCount:1});
  }
 }
 return events;
};
const stopDuration=(rows,point)=>{const ordered=[...rows].sort((a,b)=>serverMillis(a.updatedAt)-serverMillis(b.updatedAt));const index=ordered.findIndex(x=>x===point||serverMillis(x.updatedAt)===serverMillis(point.updatedAt));if(index<0)return 0;const isStop=x=>Number(x.speed||0)*3.6<=5&&distanceMeters(x,point)<=100;let start=index,end=index;while(start>0&&isStop(ordered[start-1])&&isStop(ordered[start]))start--;while(end<ordered.length-1&&isStop(ordered[end+1])&&isStop(ordered[end]))end++;return Math.max(0,serverMillis(ordered[end].updatedAt)-serverMillis(ordered[start].updatedAt));};
const formatDuration=ms=>{const min=Math.floor(ms/60000);return min<1?'krócej niż minutę':min<60?min+' min':Math.floor(min/60)+' godz. '+min%60+' min';};
const styles={header:{backgroundColor:'#141922',borderRadius:20,padding:18,marginBottom:10,borderWidth:1,borderColor:'#303a4a'},title:{color:'#fff',fontSize:23,fontWeight:'900'},sub:{color:'#9ba3b3',fontSize:13,marginTop:5},error:{color:'#f0b35a',fontSize:13,marginTop:8,fontWeight:'800'},card:{backgroundColor:'#141922',borderRadius:18,padding:16,marginBottom:10,borderWidth:1,borderColor:'#303a4a'},big:{color:'#fff',fontSize:18,fontWeight:'900'},main:{color:'#fff',fontSize:17,fontWeight:'800',marginTop:8},section:{color:'#fff',fontSize:16,fontWeight:'900',marginBottom:7},suggestion:{color:'#75a1ff',fontSize:18,fontWeight:'900'},button:{backgroundColor:'#3f78ed',borderRadius:13,padding:13,alignItems:'center',marginTop:10},buttonText:{color:'#fff',fontWeight:'900'},history:{color:'#cbd2df',fontSize:12,marginTop:7},historyRow:{paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#303a4a'},historyHint:{color:'#75a1ff',fontSize:12,marginTop:4},mapWrap:{height:300,borderRadius:18,overflow:'hidden',backgroundColor:'#0d121b',borderWidth:1,borderColor:'#303a4a',alignItems:'center',justifyContent:'center'},modalBackdrop:{flex:1,backgroundColor:'rgba(0,0,0,0.78)',justifyContent:'center',padding:16},modalCard:{backgroundColor:'#141922',borderRadius:20,borderWidth:1,borderColor:'#303a4a',padding:16,maxHeight:'90%'},detailMap:{height:260,borderRadius:14,overflow:'hidden',marginTop:12,backgroundColor:'#0d121b'},closeButton:{backgroundColor:'#303a4a',borderRadius:12,padding:12,alignItems:'center',marginTop:10}};
