import React, {useState} from 'react';
import {View, Text, ScrollView, TouchableOpacity, StyleSheet} from 'react-native';

const TESTS = [
  ['firebaseConfig', () => require('./firebaseConfig')],
  ['expo-notifications', () => require('expo-notifications')],
  ['LocationService', () => require('./LocationService')],
  ['LiveLocationDashboard', () => require('./LiveLocationDashboard')],
  ['NowDashboard', () => require('./NowDashboard')],
  ['AdminUsersPanel', () => require('./AdminUsersPanel')],
  ['AppRuntime', () => require('./AppRuntime')],
];

export default function App() {
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(false);

  const runTests = () => {
    if (running) return;
    setRunning(true);
    setResults([]);
    const next = [];

    for (const [name, loader] of TESTS) {
      try {
        loader();
        next.push({name, ok:true});
        setResults([...next]);
      } catch (error) {
        next.push({
          name,
          ok:false,
          error:String(error?.stack || error?.message || error),
        });
        setResults([...next]);
        break;
      }
    }
    setRunning(false);
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>GRAFIK PRACY</Text>
      <Text style={styles.subtitle}>DIAGNOSTYKA IMPORTÓW</Text>
      <Text style={styles.info}>Sprawdzamy łańcuch importów krok po kroku. Aplikacja nie zmienia danych.</Text>
      <TouchableOpacity disabled={running} onPress={runTests} style={styles.button}>
        <Text style={styles.buttonText}>{running ? 'TESTOWANIE...' : 'URUCHOM TEST'}</Text>
      </TouchableOpacity>
      <ScrollView style={styles.box} contentContainerStyle={{paddingBottom:40}}>
        {results.map((item,index) => (
          <View key={item.name} style={styles.result}>
            <Text style={styles.resultTitle}>{item.ok ? '✅' : '❌'} {index+1}. {item.name}</Text>
            {!item.ok && <Text selectable style={styles.error}>{item.error}</Text>}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles=StyleSheet.create({
  root:{flex:1,backgroundColor:'#0f172a',padding:20,paddingTop:60},
  title:{color:'#fff',fontSize:28,fontWeight:'900',textAlign:'center'},
  subtitle:{color:'#38bdf8',fontSize:18,fontWeight:'800',textAlign:'center',marginTop:8},
  info:{color:'#cbd5e1',fontSize:13,lineHeight:19,textAlign:'center',marginTop:12},
  button:{backgroundColor:'#2563eb',borderRadius:14,padding:16,marginTop:25},
  buttonText:{color:'#fff',fontSize:16,fontWeight:'900',textAlign:'center'},
  box:{marginTop:20},
  result:{backgroundColor:'#1e293b',borderRadius:12,padding:14,marginBottom:8},
  resultTitle:{color:'#fff',fontSize:15,fontWeight:'800'},
  error:{color:'#fca5a5',fontSize:12,lineHeight:17,marginTop:8},
});
