import React,{useEffect,useState} from 'react';
import {Alert,ScrollView,Text,TextInput,TouchableOpacity,View} from 'react-native';
import {api} from './apiClient';

const Btn=({children,onPress,disabled})=><TouchableOpacity disabled={disabled} onPress={onPress} style={{backgroundColor:'#3f78ed',borderRadius:10,padding:10,marginRight:6,marginBottom:6}}><Text style={{color:'#fff',fontWeight:'900'}}>{children}</Text></TouchableOpacity>;
const gpsOnline=p=>!!p?.last_seen_at&&(Date.now()-Date.parse(p.last_seen_at)<=180000);\nconst Input=({value,onChangeText,placeholder})=><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#6f7888" style={{backgroundColor:'#11151c',borderWidth:1,borderColor:'#303a4a',borderRadius:10,color:'#fff',padding:10,marginBottom:7}}/>;

export default function AdminFleetPanel(){
 const [tab,setTab]=useState('vehicles'),[vehicles,setVehicles]=useState([]),[phones,setPhones]=useState([]),[users,setUsers]=useState([]),[assignments,setAssignments]=useState([]),[registration,setRegistration]=useState(''),[phoneName,setPhoneName]=useState(''),[newToken,setNewToken]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const [selectedPhone,setSelectedPhone]=useState({}),[selectedUser,setSelectedUser]=useState({});

 const load=async({preserveSuccess=false}={})=>{
   try{
     const [v,p,u,a]=await Promise.all([api('/vehicles'),api('/phones'),api('/users'),api('/assignments')]);
     setVehicles(v.vehicles||[]);
     setPhones(p.phones||[]);
     setUsers((u.users||[]).filter(x=>!x.disabled));
     setAssignments(a.assignments||[]);
     setError('');
     if(!preserveSuccess)setSuccess('');
     return a.assignments||[];
   }catch(e){
     setError(e.message||'Nie udało się pobrać floty.');
     throw e;
   }
 };

 useEffect(()=>{load().catch(()=>{});const t=setInterval(()=>load({preserveSuccess:true}).catch(()=>{}),5000);return()=>clearInterval(t);},[]);

 const addVehicle=async()=>{
   if(!registration.trim())return;
   setBusy(true);setError('');setSuccess('');
   try{await api('/vehicles',{method:'POST',body:{registration:registration.trim()}});setRegistration('');await load();}
   catch(e){setError(e.message||'Nie udało się dodać auta.');}
   finally{setBusy(false);}
 };

 const addPhone=async()=>{
   if(!phoneName.trim())return;
   setBusy(true);setError('');setSuccess('');
   try{const r=await api('/phones',{method:'POST',body:{name:phoneName.trim()}});setPhoneName('');setNewToken(r.deviceToken||'');await load();}
   catch(e){setError(e.message||'Nie udało się dodać telefonu.');}
   finally{setBusy(false);}
 };

 const assign=async(v,p,u)=>{
   if(!v?.id||!p?.id||!u?.uid){setError('Wybierz telefon oraz konto lokalizatora.');return;}
   setBusy(true);setError('');setSuccess('');
   try{
     await api('/assignments',{method:'POST',body:{vehicleId:v.id,phoneId:p.id,userId:u.uid}});
     const fresh=await load({preserveSuccess:true});
     const confirmed=(fresh||[]).find(a=>a.vehicle_id===v.id && a.phone_id===p.id && a.user_id===u.uid && a.active===true);
     if(!confirmed)throw Object.assign(new Error('ASSIGNMENT_NOT_CONFIRMED'),{code:'ASSIGNMENT_NOT_CONFIRMED'});
     setSuccess('✅ Przypisanie zapisane: '+v.registration+' → '+p.name+' → '+(u.displayName||u.email)+'.');
   }catch(e){
     setError(e.message||e.code||'Nie udało się przypisać telefonu, auta i użytkownika.');
   }finally{setBusy(false);}
 };

 const removeVehicle=async v=>{Alert.alert('Usuń auto','Usunąć '+v.registration+'?', [{text:'Anuluj',style:'cancel'},{text:'USUŃ',style:'destructive',onPress:async()=>{try{setBusy(true);setError('');setSuccess('');await api('/vehicles/'+v.id,{method:'DELETE'});await load();}catch(e){setError(e.message||'Błąd usuwania.');}finally{setBusy(false);}}}]);};

 const removePhone=async p=>{Alert.alert('Usuń telefon','Usunąć '+p.name+'? Przypisanie do auta zostanie usunięte.',[{text:'Anuluj',style:'cancel'},{text:'USUŃ',style:'destructive',onPress:async()=>{setBusy(true);try{setError('');setSuccess('');await api('/phones/'+p.id,{method:'DELETE'});setNewToken('');await load();}catch(e){setError(e.message||'Błąd usuwania telefonu.');}finally{setBusy(false);}}}]);};

 return <View style={{marginTop:16}}>
  <Text style={{color:'#fff',fontSize:19,fontWeight:'900'}}>🚗 Flota i telefony GPS</Text>
  <Text style={{color:'#9299a8',fontSize:13,marginTop:3,marginBottom:10}}>Centralne przypisanie: samochód → telefon → lokalizator.</Text>
  <View style={{flexDirection:'row',flexWrap:'wrap',marginBottom:8}}>{[['vehicles','🚗 SAMOCHODY'],['phones','📱 TELEFONY'],['assign','🔗 PRZYPISANIA']].map(([k,t])=><TouchableOpacity key={k} onPress={()=>{setTab(k);setError('');setSuccess('');}} style={{backgroundColor:tab===k?'#3f78ed':'#252b35',borderRadius:10,padding:10,marginRight:6,marginBottom:6}}><Text style={{color:'#fff',fontWeight:'900'}}>{t}</Text></TouchableOpacity>)}</View>
  {!!error&&<Text style={{color:'#ff8a8a',marginBottom:8}}>⚠️ {error}</Text>}
  {!!success&&<Text style={{color:'#86efac',marginBottom:8}}>{success}</Text>}
  {tab==='vehicles'&&<><Input value={registration} onChangeText={setRegistration} placeholder="Numer rejestracyjny, np. DSW12345"/><Btn onPress={addVehicle} disabled={busy}>＋ DODAJ SAMOCHÓD</Btn>{vehicles.map(v=><View key={v.id} style={{backgroundColor:'#1c2029',borderRadius:12,padding:12,marginBottom:7,flexDirection:'row',alignItems:'center'}}><View style={{flex:1}}><Text style={{color:'#fff',fontWeight:'900'}}>{v.registration}</Text><Text style={{color:'#9299a8',fontSize:12}}>{v.active?'AKTYWNY':'NIEAKTYWNY'}</Text></View><TouchableOpacity onPress={()=>removeVehicle(v)}><Text style={{color:'#ff8a8a',fontWeight:'900'}}>🗑️</Text></TouchableOpacity></View>)}</>}
  {tab==='phones'&&<><Input value={phoneName} onChangeText={setPhoneName} placeholder="Nazwa telefonu, np. Iveco 01"/><Btn onPress={addPhone} disabled={busy}>＋ DODAJ TELEFON</Btn>{!!newToken&&<View style={{backgroundColor:'#253b2f',borderRadius:12,padding:12,marginBottom:8}}><Text style={{color:'#b7f0c8',fontWeight:'900'}}>TOKEN URZĄDZENIA</Text><Text selectable style={{color:'#fff',fontSize:12,marginTop:6}}>{newToken}</Text><Text style={{color:'#9fc6aa',fontSize:11,marginTop:5}}>Zapisz go na służbowym telefonie. Token jest pokazany tylko po utworzeniu telefonu.</Text></View>}{phones.map(p=><View key={p.id} style={{backgroundColor:'#1c2029',borderRadius:12,padding:12,marginBottom:7}}><Text style={{color:'#fff',fontWeight:'900'}}>📱 {p.name}</Text><Text style={{color:gpsOnline(p)?'#86efac':'#ffb4b4',fontSize:12,fontWeight:'800'}}>{p.active?(gpsOnline(p)?'🟢 GPS ONLINE':'🟠 GPS NIEAKTYWNY'):'🔴 TELEFON WYŁĄCZONY'} · ostatnio: {p.last_seen_at?new Date(p.last_seen_at).toLocaleString('pl-PL'):'brak'}</Text><TouchableOpacity disabled={busy} onPress={()=>removePhone(p)} style={{alignSelf:'flex-end',marginTop:7}}><Text style={{color:'#ff8a8a',fontWeight:'900'}}>🗑️ USUŃ TELEFON</Text></TouchableOpacity></View>)}</>}
  {tab==='assign'&&<>{vehicles.map(v=>{const current=assignments.find(a=>a.vehicle_id===v.id);const phoneId=selectedPhone[v.id]||current?.phone_id||'';const userId=selectedUser[v.id]||current?.user_id||'';return <View key={v.id} style={{backgroundColor:'#1c2029',borderRadius:12,padding:12,marginBottom:8}}>
    <Text style={{color:'#fff',fontWeight:'900'}}>🚗 {v.registration}</Text>
    <Text style={{color:'#9299a8',fontSize:12,marginBottom:6}}>{current?.phone_name?'📱 '+current.phone_name:'📱 Brak telefonu'}{current?.user_name?' · 📍 '+current.user_name:' · ⚠️ brak lokalizatora'}</Text>
    <Text style={{color:'#c7ccd6',fontSize:12,fontWeight:'900',marginBottom:5}}>1. Wybierz telefon</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>{phones.map(p=><TouchableOpacity key={p.id} onPress={()=>{setSelectedPhone(x=>({...x,[v.id]:p.id}));setSuccess('');setError('');}} style={{backgroundColor:phoneId===p.id?'#3f78ed':'#252b35',borderRadius:10,padding:10,marginRight:6,marginBottom:6}}><Text style={{color:'#fff',fontWeight:'900'}}>📱 {p.name}</Text></TouchableOpacity>)}</ScrollView>
    <Text style={{color:'#c7ccd6',fontSize:12,fontWeight:'900',marginBottom:5}}>2. Wybierz lokalizatora</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>{users.filter(u=>u.role==='locator').map(u=><TouchableOpacity key={u.id} onPress={()=>{setSelectedUser(x=>({...x,[v.id]:u.uid}));setSuccess('');setError('');}} style={{backgroundColor:userId===u.uid?'#3f78ed':'#252b35',borderRadius:10,padding:10,marginRight:6,marginBottom:6}}><Text style={{color:'#fff',fontWeight:'900'}}>📍 {u.displayName||u.email}</Text></TouchableOpacity>)}</ScrollView>
    <Btn disabled={busy||!phoneId||!userId} onPress={()=>assign(v,phones.find(p=>p.id===phoneId),users.find(u=>u.uid===userId))}>💾 ZAPISZ PRZYPISANIE</Btn>
  </View>})}</>}
 </View>;
}
