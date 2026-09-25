import React, {useEffect, useState} from 'react';
import {Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {collection, onSnapshot} from 'firebase/firestore';
import {getFunctions, httpsCallable} from 'firebase/functions';
import {db, firebaseApp, FIREBASE_ENABLED} from './firebaseConfig';

const KEYS=['P','M','L'];
const ROLES=['employee','locator','admin'];

export default function AdminUsersPanel({cloudUser}) {
  const [users,setUsers]=useState([]);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({email:'',password:'',displayName:'',personKey:'',role:'employee'});

  useEffect(()=>{
    if(!FIREBASE_ENABLED||!db||!cloudUser)return;
    return onSnapshot(collection(db,'users'),snap=>{
      setUsers(snap.docs.map(d=>({uid:d.id,...d.data()})).sort((a,b)=>
        String(a.displayName||a.email||a.uid).localeCompare(String(b.displayName||b.email||b.uid))));
      setError('');
    },e=>setError('Nie udało się pobrać użytkowników. Kod: '+(e?.code||'unknown')));
  },[cloudUser?.uid]);

  const create=()=>{setError('');setForm({email:'',password:'',displayName:'',personKey:'',role:'employee'});setModal({mode:'create'});};
  const edit=u=>{setError('');setForm({email:u.email||'',password:'',displayName:u.displayName||'',personKey:u.personKey||'',role:ROLES.includes(u.role)?u.role:'employee'});setModal({mode:'edit',user:u});};
  const close=()=>{if(!busy)setModal(null);};

  const save=async()=>{
    if(!modal)return;
    setBusy(modal.mode==='create'?'create':modal.user.uid);setError('');
    try{
      const fn=httpsCallable(getFunctions(firebaseApp),modal.mode==='create'?'createUserAccount':'updateUserProfile');
      await fn(modal.mode==='create'?form:{...form,uid:modal.user.uid});
      setModal(null);
      Alert.alert('Gotowe',modal.mode==='create'?(form.role==='locator'?'Lokalizator został dodany.':form.role==='admin'?'Administrator został dodany.':'Pracownik został dodany.'):(form.role==='locator'?'Dane lokalizatora zapisane.':form.role==='admin'?'Dane administratora zapisane.':'Dane pracownika zapisane.'));
    }catch(e){setError((e?.message||'Operacja nie powiodła się.')+' ('+(e?.code||'unknown')+')');}
    finally{setBusy('');}
  };

  const remove=async u=>{
    if(!u?.uid||u.uid===cloudUser?.uid)return;
    Alert.alert('Usuń konto','Usunąć '+(u.displayName||u.email||u.uid)+'?',[{text:'Anuluj',style:'cancel'},{text:'USUŃ',style:'destructive',onPress:async()=>{
      setBusy(u.uid);setError('');
      try{await httpsCallable(getFunctions(firebaseApp),'deleteUserAccount')({uid:u.uid});Alert.alert('Gotowe','Konto zostało usunięte.');}
      catch(e){setError((e?.message||'Nie udało się usunąć konta.')+' ('+(e?.code||'unknown')+')');}
      finally{setBusy('');}
    }}]);
  };

  const input=(label,key,props={})=><View style={{marginBottom:9}}>
    <Text style={{color:'#c7ccd6',fontSize:12,fontWeight:'800',marginBottom:4}}>{label}</Text>
    <TextInput value={form[key]} onChangeText={v=>setForm(f=>({...f,[key]:v}))} placeholderTextColor="#6f7888" style={{backgroundColor:'#11151c',borderWidth:1,borderColor:'#303a4a',borderRadius:11,color:'#fff',padding:11,fontSize:16}} {...props}/>
  </View>;

  return <View style={{marginTop:16}}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
      <View style={{flex:1}}><Text style={{color:'#fff',fontSize:19,fontWeight:'900'}}>👥 Pracownicy i konta</Text><Text style={{color:'#9299a8',fontSize:13,marginTop:3}}>Dodawanie, edycja, role, przypisanie i usuwanie.</Text></View>
      <TouchableOpacity onPress={create} disabled={!!busy} style={{backgroundColor:'#3f78ed',borderRadius:11,paddingVertical:10,paddingHorizontal:12}}><Text style={{color:'#fff',fontWeight:'900'}}>＋ DODAJ</Text></TouchableOpacity>
    </View>
    {!!error&&<Text style={{color:'#ff8a8a',fontSize:13,lineHeight:19,marginBottom:8}}>⚠️ {error}</Text>}
    {users.map(u=>{
      const self=u.uid===cloudUser?.uid;
      return <View key={u.uid} style={{backgroundColor:'#1c2029',borderRadius:14,padding:13,marginBottom:8,borderWidth:1,borderColor:'#2b313d'}}>
        <View style={{flexDirection:'row',alignItems:'center'}}>
          <View style={{flex:1}}><Text style={{color:'#fff',fontSize:15,fontWeight:'900'}}>{u.displayName||u.email||'Bez nazwy'}</Text><Text style={{color:'#aab3c2',fontSize:12,marginTop:3}}>{u.email||'Brak e-maila'}</Text><Text style={{color:'#9299a8',fontSize:12,marginTop:3}}>{u.role==='admin'?'👑 Administrator':u.role==='locator'?'📍 Lokalizator':'👤 Pracownik'}{u.personKey?' · '+u.personKey:''}</Text></View>
          {self?<Text style={{color:'#75a1ff',fontSize:12,fontWeight:'900'}}>TO TY</Text>:<View style={{flexDirection:'row',gap:6}}>
            <TouchableOpacity disabled={!!busy} onPress={()=>edit(u)} style={{backgroundColor:'#293c62',borderRadius:10,paddingVertical:9,paddingHorizontal:10}}><Text style={{color:'#fff',fontWeight:'900'}}>✏️</Text></TouchableOpacity>
            <TouchableOpacity disabled={!!busy} onPress={()=>remove(u)} style={{backgroundColor:'#7b3039',borderRadius:10,paddingVertical:9,paddingHorizontal:10}}><Text style={{color:'#fff',fontWeight:'900'}}>{busy===u.uid?'…':'🗑️'}</Text></TouchableOpacity>
          </View>}
        </View>
      </View>;
    })}
    {!users.length&&<View style={{backgroundColor:'#1c2029',borderRadius:14,padding:14}}><Text style={{color:'#9299a8'}}>Brak zarejestrowanych użytkowników.</Text></View>}

    <Modal visible={!!modal} transparent animationType="fade" onRequestClose={close}>
      <View style={{flex:1,backgroundColor:'rgba(0,0,0,.78)',justifyContent:'center',padding:14}}>
        <View style={{backgroundColor:'#191d26',borderRadius:22,padding:18,borderWidth:1,borderColor:'#344054',maxHeight:'92%'}}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={{color:'#fff',fontSize:22,fontWeight:'900'}}>{modal?.mode==='create'?'➕ Nowy pracownik':'✏️ Edycja pracownika'}</Text>
            <Text style={{color:'#9299a8',fontSize:13,marginTop:5,marginBottom:12}}>{modal?.mode==='create'?'Utwórz konto logowania i profil.':'Puste pole hasła pozostawia obecne hasło.'}</Text>
            {input('Imię i nazwisko','displayName',{placeholder:'np. Jan Kowalski'})}
            {input('E-mail','email',{placeholder:'pracownik@firma.pl',autoCapitalize:'none',keyboardType:'email-address'})}
            {input(modal?.mode==='create'?'Hasło, min. 6 znaków':'Nowe hasło, opcjonalnie','password',{placeholder:'Hasło',secureTextEntry:true})}
            <Text style={{color:'#c7ccd6',fontSize:12,fontWeight:'800',marginBottom:5}}>Przypisanie</Text>
            <View style={{flexDirection:'row',gap:6,marginBottom:10}}>{['',...KEYS].map(k=><TouchableOpacity key={k} onPress={()=>setForm(f=>({...f,personKey:k}))} style={{backgroundColor:form.personKey===k?'#3f78ed':'#252b35',borderRadius:10,padding:10}}><Text style={{color:'#fff',fontWeight:'800'}}>{k||'BRAK'}</Text></TouchableOpacity>)}</View>
            <Text style={{color:'#c7ccd6',fontSize:12,fontWeight:'800',marginBottom:5}}>Rola</Text>
            <View style={{flexDirection:'row',gap:6,marginBottom:10}}>{ROLES.map(role=><TouchableOpacity key={role} disabled={modal?.user?.uid===cloudUser?.uid&&role!=='admin'} onPress={()=>setForm(f=>({...f,role}))} style={{backgroundColor:form.role===role?'#3f78ed':'#252b35',borderRadius:10,padding:10,opacity:(modal?.user?.uid===cloudUser?.uid&&role!=='admin')?.45:1}}><Text style={{color:'#fff',fontWeight:'800'}}>{role==='admin'?'👑 ADMIN':role==='locator'?'📍 LOKALIZATOR':'👤 PRACOWNIK'}</Text></TouchableOpacity>)}</View>
            {!!error&&<Text style={{color:'#ff8a8a',fontSize:13,lineHeight:19,marginBottom:8}}>{error}</Text>}
            <View style={{flexDirection:'row',gap:8}}><TouchableOpacity onPress={close} disabled={!!busy} style={{flex:1,backgroundColor:'#303744',borderRadius:12,padding:13,alignItems:'center'}}><Text style={{color:'#fff',fontWeight:'900'}}>ANULUJ</Text></TouchableOpacity><TouchableOpacity onPress={save} disabled={!!busy} style={{flex:1,backgroundColor:'#3f78ed',borderRadius:12,padding:13,alignItems:'center'}}><Text style={{color:'#fff',fontWeight:'900'}}>{busy?'ZAPISUJĘ…':'ZAPISZ'}</Text></TouchableOpacity></View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
