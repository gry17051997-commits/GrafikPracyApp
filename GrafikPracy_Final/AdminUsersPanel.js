import React, {useEffect, useState} from 'react';
import {Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {collection, onSnapshot} from 'firebase/firestore';
import {db, FIREBASE_ENABLED} from './firebaseConfig';
import {createUserAccountWithoutFunctions, updateUserProfileWithoutFunctions, disableUserWithoutFunctions, enableUserWithoutFunctions} from './AdminUserService';
import {createUserInvite, listUserInvites, revokeUserInvite} from './UserInviteService';

const KEYS=['P','M','L'];
const ROLES=['employee','locator','admin'];
const formatDate=value=>{
  const date=value?.toDate?.()||value;
  return date instanceof Date&&!Number.isNaN(date.getTime())?date.toLocaleString('pl-PL'):'—';
};

export default function AdminUsersPanel({cloudUser}) {
  const [users,setUsers]=useState([]);
  const [invites,setInvites]=useState([]);
  const [showDisabled,setShowDisabled]=useState(false);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [modal,setModal]=useState(null);
  const [createdInvite,setCreatedInvite]=useState(null);
  const [form,setForm]=useState({email:'',displayName:'',personKey:'',role:'employee',password:''});

  useEffect(()=>{
    if(!FIREBASE_ENABLED||!db||!cloudUser)return;
    return onSnapshot(collection(db,'users'),snap=>{
      setUsers(snap.docs.map(d=>({uid:d.id,...d.data()})).sort((a,b)=>
        String(a.displayName||a.email||a.uid).localeCompare(String(b.displayName||b.email||b.uid))));
      setError('');
    },e=>setError('Nie udało się pobrać użytkowników. Kod: '+(e?.code||'unknown')));
  },[cloudUser?.uid]);

  useEffect(()=>{
    if(!FIREBASE_ENABLED||!db||!cloudUser)return;
    let mounted=true;
    listUserInvites().then(items=>{
      if(mounted)setInvites(items.filter(invite=>invite.status==='pending'));
    }).catch(e=>{
      if(mounted)setError('Nie udało się pobrać zaproszeń. Kod: '+(e?.code||'unknown'));
    });
    return ()=>{mounted=false;};
  },[cloudUser?.uid]);

  const refreshInvites=async()=>{
    const items=await listUserInvites();
    setInvites(items.filter(invite=>invite.status==='pending'));
  };
  const create=()=>{setError('');setForm({email:'',displayName:'',personKey:'',role:'employee',password:''});setModal({mode:'create'});};
  const edit=u=>{setError('');setForm({email:u.email||'',displayName:u.displayName||'',personKey:u.personKey||'',role:ROLES.includes(u.role)?u.role:'employee',password:''});setModal({mode:'edit',user:u});};
  const close=()=>{if(!busy)setModal(null);};

  const save=async()=>{
    if(!modal)return;
    if(modal.mode==='edit'&&form.role==='employee'&&!KEYS.includes(form.personKey)){
      setError('Pracownik musi mieć przypisane P/M/L.');
      return;
    }
    if(modal.mode==='create'&&String(form.password||'').length<6){setError('Hasło musi mieć co najmniej 6 znaków.');return;}
    setBusy(modal.mode==='create'?'create':modal.user.uid);setError('');
    try{
      if(modal.mode==='create'){
        await createUserAccountWithoutFunctions(form);
        Alert.alert('Gotowe','Konto użytkownika zostało utworzone. Użytkownik może od razu się zalogować.');
        setModal(null);
      }else{
        await updateUserProfileWithoutFunctions(modal.user.uid,form);
        Alert.alert('Gotowe',form.role==='locator'?'Dane lokalizatora zapisane.':form.role==='admin'?'Dane administratora zapisane.':'Dane pracownika zapisane.');
      }
      setModal(null);
    }catch(e){setError((e?.message||'Operacja nie powiodła się.')+' ('+(e?.code||'unknown')+')');}
    finally{setBusy('');}
  };

  const revoke=async invite=>{
    setBusy('invite:'+invite.inviteId);setError('');
    try{
      await revokeUserInvite(invite.inviteId);
      await refreshInvites();
    }catch(e){setError((e?.message||'Nie udało się unieważnić zaproszenia.')+' ('+(e?.code||'unknown')+')');}
    finally{setBusy('');}
  };

  const enable=async u=>{
    if(!u?.uid||u.uid===cloudUser?.uid)return;
    setBusy(u.uid);setError('');
    try{
      await enableUserWithoutFunctions(u.uid);
      Alert.alert('Gotowe','Konto zostało ponownie aktywowane.');
    }catch(e){setError((e?.message||'Nie udało się aktywować konta.')+' ('+(e?.code||'unknown')+')');}
    finally{setBusy('');}
  };

  const deactivate=async u=>{
    if(!u?.uid||u.uid===cloudUser?.uid)return;
    Alert.alert('Dezaktywuj użytkownika','Profil '+(u.displayName||u.email||u.uid)+' zostanie dezaktywowany. Konto Firebase Authentication nie zostanie usunięte.',[
      {text:'Anuluj',style:'cancel'},
      {text:'DEZAKTYWUJ',style:'destructive',onPress:async()=>{
        setBusy(u.uid);setError('');
        try{
          await disableUserWithoutFunctions(u.uid);
          Alert.alert('Gotowe','Profil użytkownika został dezaktywowany.');
        }catch(e){
          setError((e?.message||'Nie udało się dezaktywować profilu.')+' ('+(e?.code||'unknown')+')');
        }finally{setBusy('');}
      }}
    ]);
  };

  const input=(label,key,props={})=><View style={{marginBottom:9}}>
    <Text style={{color:'#c7ccd6',fontSize:12,fontWeight:'800',marginBottom:4}}>{label}</Text>
    <TextInput value={form[key]} onChangeText={v=>setForm(f=>({...f,[key]:v}))} placeholderTextColor="#6f7888" style={{backgroundColor:'#11151c',borderWidth:1,borderColor:'#303a4a',borderRadius:11,color:'#fff',padding:11,fontSize:16}} {...props}/>
  </View>;

  return <View style={{marginTop:16}}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
      <View style={{flex:1}}><Text style={{color:'#fff',fontSize:19,fontWeight:'900'}}>👥 Pracownicy i konta</Text><Text style={{color:'#9299a8',fontSize:13,marginTop:3}}>Konta, role, przypisanie i dezaktywacja.</Text></View>
      <TouchableOpacity onPress={create} disabled={!!busy} style={{backgroundColor:'#3f78ed',borderRadius:11,paddingVertical:10,paddingHorizontal:12}}><Text style={{color:'#fff',fontWeight:'900'}}>＋ DODAJ</Text></TouchableOpacity>
    </View>
    {!!error&&<Text style={{color:'#ff8a8a',fontSize:13,lineHeight:19,marginBottom:8}}>⚠️ {error}</Text>}
    <View style={{marginBottom:13}}>
      <Text style={{color:'#fff',fontSize:16,fontWeight:'900',marginBottom:7}}>✉️ Oczekujące zaproszenia</Text>
      {!invites.length&&<Text style={{color:'#9299a8',fontSize:13}}>Brak oczekujących zaproszeń.</Text>}
      {invites.map(invite=><View key={invite.inviteId} style={{backgroundColor:'#1c2029',borderRadius:14,padding:13,marginBottom:8,borderWidth:1,borderColor:'#2b313d'}}>
        <View style={{flexDirection:'row',alignItems:'flex-start'}}>
          <View style={{flex:1}}>
            <Text style={{color:'#fff',fontSize:14,fontWeight:'900'}}>{invite.email}</Text>
            <Text style={{color:'#aab3c2',fontSize:12,marginTop:3}}>{invite.displayName}</Text>
            <Text style={{color:'#9299a8',fontSize:12,marginTop:3}}>Rola: {invite.role}{invite.personKey?' · personKey: '+invite.personKey:''} · {invite.status}</Text>
            <Text style={{color:'#9299a8',fontSize:11,marginTop:3}}>Wygasa: {formatDate(invite.expiresAt)}</Text>
            <Text style={{color:'#9299a8',fontSize:11,marginTop:2}}>Utworzono: {formatDate(invite.createdAt)}</Text>
          </View>
          <TouchableOpacity disabled={!!busy} onPress={()=>revoke(invite)} style={{backgroundColor:'#7b3039',borderRadius:10,paddingVertical:9,paddingHorizontal:10,marginLeft:8}}>
            <Text style={{color:'#fff',fontWeight:'900'}}>{busy==='invite:'+invite.inviteId?'…':'UNIEWAŻNIJ'}</Text>
          </TouchableOpacity>
        </View>
      </View>)}
    </View>
    <TouchableOpacity onPress={()=>setShowDisabled(v=>!v)} disabled={!!busy} style={{backgroundColor:'#252b36',borderRadius:10,paddingVertical:9,paddingHorizontal:12,marginBottom:9}}>
      <Text style={{color:'#cbd5e1',fontWeight:'900'}}>{showDisabled?'Ukryj nieaktywne konta':'Pokaż nieaktywne konta'}</Text>
    </TouchableOpacity>
    {users.filter(u=>showDisabled || !u.disabled).map(u=>{ 
      const self=u.uid===cloudUser?.uid;
      const actionView=(
        <View style={{flexDirection:'row',gap:6}}>
          {!u.disabled && (
            <TouchableOpacity disabled={!!busy} onPress={()=>edit(u)} style={{backgroundColor:'#293c62',borderRadius:10,paddingVertical:9,paddingHorizontal:10}}>
              <Text style={{color:'#fff',fontWeight:'900'}}>✏️</Text>
            </TouchableOpacity>
          )}
          {u.disabled ? (
            <TouchableOpacity disabled={!!busy} onPress={()=>enable(u)} style={{backgroundColor:'#28644a',borderRadius:10,paddingVertical:9,paddingHorizontal:10}}>
              <Text style={{color:'#fff',fontWeight:'900'}}>▶️</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity disabled={!!busy} onPress={()=>deactivate(u)} style={{backgroundColor:'#7b3039',borderRadius:10,paddingVertical:9,paddingHorizontal:10}}>
              <Text style={{color:'#fff',fontWeight:'900'}}>{busy===u.uid?'…':'🗑️'}</Text>
            </TouchableOpacity>
          )}
        </View>
      );
      return (
        <View key={u.uid} style={{backgroundColor:'#1c2029',borderRadius:14,padding:13,marginBottom:8,borderWidth:1,borderColor:'#2b313d'}}>
          <View style={{flexDirection:'row',alignItems:'center'}}>
            <View style={{flex:1}}>
              <Text style={{color:'#fff',fontSize:15,fontWeight:'900'}}>{u.displayName||u.email||'Bez nazwy'}</Text>
              <Text style={{color:'#aab3c2',fontSize:12,marginTop:3}}>{u.email||'Brak e-maila'}</Text>
              <Text style={{color:'#9299a8',fontSize:12,marginTop:3}}>{u.role==='admin'?'👑 Administrator':u.role==='locator'?'📍 Lokalizator':'👤 Pracownik'}{u.personKey?' · '+u.personKey:''}</Text>
            </View>
            {self ? <Text style={{color:'#75a1ff',fontSize:12,fontWeight:'900'}}>TO TY</Text> : actionView}
          </View>
        </View>
      );
    })}
    {!users.length&&<View style={{backgroundColor:'#1c2029',borderRadius:14,padding:14}}><Text style={{color:'#9299a8'}}>Brak zarejestrowanych użytkowników.</Text></View>}

    <Modal visible={!!modal} transparent animationType="fade" onRequestClose={close}>
      <View style={{flex:1,backgroundColor:'rgba(0,0,0,.78)',justifyContent:'center',padding:14}}>
        <View style={{backgroundColor:'#191d26',borderRadius:22,padding:18,borderWidth:1,borderColor:'#344054',maxHeight:'92%'}}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={{color:'#fff',fontSize:22,fontWeight:'900'}}>{modal?.mode==='create'?'➕ Nowe konto':'✏️ Edycja pracownika'}</Text>
            <Text style={{color:'#9299a8',fontSize:13,marginTop:5,marginBottom:12}}>{modal?.mode==='create'?'Utwórz konto bez wylogowywania administratora.':'E-mail pozostaje bez zmian. Edycja aktualizuje profil, rolę i przypisanie.'}</Text>
            {input('Imię i nazwisko','displayName',{placeholder:'np. Jan Kowalski'})}
            {input('E-mail','email',{placeholder:'pracownik@firma.pl',autoCapitalize:'none',keyboardType:'email-address',editable:modal?.mode==='create'})}
            {modal?.mode==='create'&&input('Hasło początkowe','password',{placeholder:'minimum 6 znaków',secureTextEntry:true,autoCapitalize:'none'})}
            <Text style={{color:'#c7ccd6',fontSize:12,fontWeight:'800',marginBottom:5}}>Przypisanie</Text>
            <View style={{flexDirection:'row',gap:6,marginBottom:10}}>{['',...KEYS].map(k=><TouchableOpacity key={k} onPress={()=>setForm(f=>({...f,personKey:k}))} style={{backgroundColor:form.personKey===k?'#3f78ed':'#252b35',borderRadius:10,padding:10}}><Text style={{color:'#fff',fontWeight:'800'}}>{k||'BRAK'}</Text></TouchableOpacity>)}</View>
            <Text style={{color:'#c7ccd6',fontSize:12,fontWeight:'800',marginBottom:5}}>Rola</Text>
            <View style={{flexDirection:'row',gap:6,marginBottom:10}}>{ROLES.map(role=><TouchableOpacity key={role} disabled={modal?.user?.uid===cloudUser?.uid&&role!=='admin'} onPress={()=>setForm(f=>({...f,role,personKey:role==='employee'?f.personKey:''}))} style={{backgroundColor:form.role===role?'#3f78ed':'#252b35',borderRadius:10,padding:10,opacity:(modal?.user?.uid===cloudUser?.uid&&role!=='admin')?.45:1}}><Text style={{color:'#fff',fontWeight:'800'}}>{role==='admin'?'👑 ADMIN':role==='locator'?'📍 LOKALIZATOR':'👤 PRACOWNIK'}</Text></TouchableOpacity>)}</View>
            {!!error&&<Text style={{color:'#ff8a8a',fontSize:13,lineHeight:19,marginBottom:8}}>{error}</Text>}
            <View style={{flexDirection:'row',gap:8}}><TouchableOpacity onPress={close} disabled={!!busy} style={{flex:1,backgroundColor:'#303744',borderRadius:12,padding:13,alignItems:'center'}}><Text style={{color:'#fff',fontWeight:'900'}}>ANULUJ</Text></TouchableOpacity><TouchableOpacity onPress={save} disabled={!!busy||(modal?.mode==='edit'&&form.role==='employee'&&!KEYS.includes(form.personKey))} style={{flex:1,backgroundColor:'#3f78ed',borderRadius:12,padding:13,alignItems:'center',opacity:modal?.mode==='edit'&&form.role==='employee'&&!KEYS.includes(form.personKey)?0.5:1}}><Text style={{color:'#fff',fontWeight:'900'}}>{busy?'ZAPISUJĘ…':modal?.mode==='create'?'UTWÓRZ KONTO':'ZAPISZ'}</Text></TouchableOpacity></View>
          </ScrollView>
        </View>
      </View>
    </Modal>
    <Modal visible={!!createdInvite} transparent animationType="fade" onRequestClose={()=>setCreatedInvite(null)}>
      <View style={{flex:1,backgroundColor:'rgba(0,0,0,.78)',justifyContent:'center',padding:14}}>
        <View style={{backgroundColor:'#191d26',borderRadius:22,padding:18,borderWidth:1,borderColor:'#344054',maxHeight:'92%'}}>
          <ScrollView>
            <Text style={{color:'#fff',fontSize:21,fontWeight:'900'}}>✅ Zaproszenie utworzone</Text>
            <Text style={{color:'#aab3c2',fontSize:14,marginTop:10}}>E-mail: {createdInvite?.email}</Text>
            <Text style={{color:'#aab3c2',fontSize:14,marginTop:4}}>Imię i nazwisko: {createdInvite?.displayName}</Text>
            <Text style={{color:'#aab3c2',fontSize:14,marginTop:4}}>Rola: {createdInvite?.role}{createdInvite?.personKey?' · personKey: '+createdInvite.personKey:''}</Text>
            <Text style={{color:'#aab3c2',fontSize:14,marginTop:4}}>Wygasa: {formatDate(createdInvite?.expiresAt)}</Text>
            <Text style={{color:'#f2c879',fontSize:13,fontWeight:'800',marginTop:14}}>Jednorazowy token — skopiuj i przekaż zaproszonej osobie. Nie będzie ponownie wyświetlony.</Text>
            <Text selectable style={{backgroundColor:'#11151c',borderRadius:10,padding:12,color:'#fff',fontSize:13,marginTop:8}}>{createdInvite?.token}</Text>
            <TouchableOpacity onPress={()=>setCreatedInvite(null)} style={{backgroundColor:'#3f78ed',borderRadius:12,padding:13,alignItems:'center',marginTop:14}}>
              <Text style={{color:'#fff',fontWeight:'900'}}>ZAMKNIJ</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
