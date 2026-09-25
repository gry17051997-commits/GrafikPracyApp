import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {registerRootComponent} from 'expo';

const probes = [
  ['AsyncStorage', () => require('@react-native-async-storage/async-storage')],
  ['expo-notifications', () => require('expo-notifications')],
  ['expo-location', () => require('expo-location')],
  ['expo-sharing', () => require('expo-sharing')],
  ['expo-print', () => require('expo-print')],
  ['expo-clipboard', () => require('expo-clipboard')],
  ['react-native-view-shot', () => require('react-native-view-shot')],
  ['react-native-android-widget', () => require('react-native-android-widget')],
  ['./firebaseConfig', () => require('./firebaseConfig')],
  ['./LocationService', () => require('./LocationService')],
  ['./LiveLocationDashboard', () => require('./LiveLocationDashboard')],
  ['./NowDashboard', () => require('./NowDashboard')],
  ['./AdminUsersPanel', () => require('./AdminUsersPanel')],
];

function Root() {
  const [status, setStatus] = useState('START');
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      for (let i=0; i<probes.length; i++) {
        if (cancelled) return;
        const [name, load] = probes[i];
        setIndex(i+1);
        setStatus('TEST: ' + name);
        await new Promise(r => setTimeout(r, 700));
        try {
          load();
          if (!cancelled) setStatus('OK: ' + name);
        } catch (e) {
          if (!cancelled) setStatus('BŁĄD: ' + name + '\n' + String(e?.message || e));
          return;
        }
        await new Promise(r => setTimeout(r, 500));
      }
      if (!cancelled) { setDone(true); setStatus('WSZYSTKIE MODUŁY OK'); }
    };
    run();
    return () => { cancelled = true; };
  }, []);

  return <View style={styles.root}>
    <Text style={styles.title}>GRAFIK PRACY</Text>
    <Text style={styles.step}>{done ? 'DIAGNOSTYKA ZAKOŃCZONA' : 'DIAGNOSTYKA STARTU'}</Text>
    <Text style={styles.count}>{index} / {probes.length}</Text>
    <Text style={styles.status}>{status}</Text>
    <Text style={styles.hint}>Nie zamykaj aplikacji podczas testu.</Text>
  </View>;
}
registerRootComponent(Root);
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:'#11151c',alignItems:'center',justifyContent:'center',padding:24},
 title:{color:'#fff',fontSize:30,fontWeight:'900',textAlign:'center'},
 step:{color:'#4f8cff',fontSize:16,fontWeight:'800',marginTop:10,textAlign:'center'},
 count:{color:'#fff',fontSize:22,fontWeight:'900',marginTop:25},
 status:{color:'#fff',fontSize:16,lineHeight:23,textAlign:'center',marginTop:18},
 hint:{color:'#9299a8',fontSize:12,textAlign:'center',marginTop:25}
});
