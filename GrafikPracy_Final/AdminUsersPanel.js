import React, {useEffect, useState} from 'react';
import {Alert, Text, TouchableOpacity, View} from 'react-native';
import {collection, onSnapshot} from 'firebase/firestore';
import {getFunctions, httpsCallable} from 'firebase/functions';
import {db, firebaseApp, FIREBASE_ENABLED} from './firebaseConfig';

export default function AdminUsersPanel({cloudUser}) {
  const [users,setUsers] = useState([]);
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');

  useEffect(() => {
    if (!FIREBASE_ENABLED || !db || !cloudUser) return;
    const unsub = onSnapshot(collection(db,'users'), snap => {
      setUsers(snap.docs.map(d => ({uid:d.id,...d.data()})).sort((a,b) =>
        String(a.email || a.uid).localeCompare(String(b.email || b.uid))
      ));
      setError('');
    }, err => setError('Nie udało się pobrać listy użytkowników. Kod: ' + (err?.code || 'unknown')));
    return unsub;
  },[cloudUser]);

  const deleteUser = user => {
    if (!user?.uid || user.uid === cloudUser?.uid) return;
    Alert.alert(
      'Usuń konto',
      'Czy na pewno usunąć konto '+(user.email || user.uid)+'? Operacja usunie konto logowania Firebase oraz profil użytkownika.',
      [
        {text:'Anuluj',style:'cancel'},
        {text:'USUŃ KONTO',style:'destructive',onPress:async()=>{
          setBusy(user.uid);
          setError('');
          try {
            const fn = httpsCallable(getFunctions(firebaseApp), 'deleteUserAccount');
            await fn({uid:user.uid});
            Alert.alert('Gotowe','Konto zostało usunięte.');
          } catch(e) {
            const code = e?.code || 'unknown';
            const message = e?.message || 'Nie udało się usunąć konta.';
            setError(message + ' (' + code + ')');
            Alert.alert('Nie udało się usunąć konta',message);
          } finally {
            setBusy('');
          }
        }}
      ]
    );
  };

  return (
    <View>
      <Text style={{color:'#fff',fontSize:19,fontWeight:'900',marginTop:16,marginBottom:9}}>👥 Użytkownicy</Text>
      <Text style={{color:'#c7ccd6',fontSize:14,lineHeight:21,marginBottom:9}}>
        Panel administratora. Usunięcie konta kasuje dostęp do logowania oraz profil użytkownika.
      </Text>
      {!!error && <Text style={{color:'#ff8a8a',fontSize:13,lineHeight:19,marginBottom:8}}>{error}</Text>}
      {!users.length ? (
        <View style={{backgroundColor:'#1c2029',borderRadius:14,padding:14}}>
          <Text style={{color:'#9299a8'}}>Brak zarejestrowanych użytkowników.</Text>
        </View>
      ) : users.map(user => {
        const self = user.uid === cloudUser?.uid;
        return (
          <View key={user.uid} style={{backgroundColor:'rgba(28,32,41,0.96)',borderRadius:14,padding:13,marginBottom:8,borderWidth:1,borderColor:'#2b313d'}}>
            <View style={{flexDirection:'row',alignItems:'center'}}>
              <View style={{flex:1}}>
                <Text style={{color:'#fff',fontSize:15,fontWeight:'900'}}>{user.email || 'Brak e-maila'}</Text>
                <Text style={{color:'#9299a8',fontSize:12,marginTop:3}}>
                  {user.role === 'admin' ? '👑 Administrator' : '👤 Pracownik'} · {user.personKey || 'bez przypisania'}
                </Text>
              </View>
              {self ? (
                <Text style={{color:'#75a1ff',fontSize:12,fontWeight:'900'}}>TO TY</Text>
              ) : (
                <TouchableOpacity
                  disabled={!!busy}
                  onPress={()=>deleteUser(user)}
                  style={{backgroundColor:'#7b3039',borderRadius:10,paddingVertical:10,paddingHorizontal:12,opacity:busy && busy!==user.uid ? 0.45 : 1}}
                >
                  <Text style={{color:'#fff',fontWeight:'900'}}>{busy===user.uid?'USUWAM…':'🗑️ USUŃ'}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
