import React from 'react';
import {ScrollView, Text, TouchableOpacity, View} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppRuntime from './AppRuntime';

const DIAG_KEY = 'grafik-pracy-last-crash-v1';

function formatError(error, info) {
  const message = String(error?.message || error || 'Nieznany błąd');
  const stack = String(error?.stack || '');
  const component = String(info?.componentStack || '');
  return [
    'GRAFIK PRACY - DIAGNOSTYKA',
    'Czas: ' + new Date().toISOString(),
    '',
    'BŁĄD:',
    message,
    '',
    'STACK:',
    stack.slice(0, 12000),
    '',
    'KOMPONENT:',
    component.slice(0, 8000)
  ].join('\n');
}

class CrashBoundary extends React.Component {
  state = {error: null, storedError: null};

  async componentDidMount() {
    try {
      const saved = await AsyncStorage.getItem(DIAG_KEY);
      if (saved) this.setState({storedError: saved});
    } catch {}
  }

  componentDidCatch(error, info) {
    const diagnostic = formatError(error, info);
    this.setState({error: diagnostic});
    AsyncStorage.setItem(DIAG_KEY, diagnostic).catch(() => {});
  }

  clearDiagnostic = async () => {
    try { await AsyncStorage.removeItem(DIAG_KEY); } catch {}
    this.setState({error: null, storedError: null});
  };

  copyDiagnostic = async () => {
    const value = this.state.error || this.state.storedError || '';
    try { await Clipboard.setStringAsync(value); } catch {}
  };

  renderDiagnostic(text, live) {
    return (
      <View style={{flex:1,backgroundColor:'#080b11',padding:18,paddingTop:54}}>
        <Text style={{color:'#ff6b6b',fontSize:25,fontWeight:'900'}}>⚠️ BŁĄD APLIKACJI</Text>
        <Text style={{color:'#cbd5e1',fontSize:14,lineHeight:21,marginTop:8}}>
          {live ? 'Aplikacja wykryła błąd. Zapisaliśmy pełną diagnostykę.' : 'Znaleziono błąd zapisany przy poprzednim uruchomieniu.'}
        </Text>
        <View style={{flex:1,backgroundColor:'#111722',borderRadius:12,marginTop:14,padding:12}}>
          <ScrollView><Text selectable style={{color:'#f8fafc',fontSize:12,lineHeight:18}}>{text}</Text></ScrollView>
        </View>
        <View style={{flexDirection:'row',gap:8,marginTop:12}}>
          <TouchableOpacity onPress={this.copyDiagnostic} style={{flex:1,backgroundColor:'#3f78ed',borderRadius:12,padding:14,alignItems:'center'}}>
            <Text style={{color:'#fff',fontWeight:'900'}}>📋 KOPIUJ BŁĄD</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={this.clearDiagnostic} style={{flex:1,backgroundColor:'#303744',borderRadius:12,padding:14,alignItems:'center'}}>
            <Text style={{color:'#fff',fontWeight:'900'}}>▶️ URUCHOM DALEJ</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  render() {
    if (this.state.error) return this.renderDiagnostic(this.state.error, true);
    if (this.state.storedError) return this.renderDiagnostic(this.state.storedError, false);
    return this.props.children;
  }
}

export default function App() {
  return <CrashBoundary><AppRuntime /></CrashBoundary>;
}
