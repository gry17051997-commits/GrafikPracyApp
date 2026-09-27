import React from 'react';
import {View, Text, ScrollView, StyleSheet} from 'react-native';

let RuntimeApp = null;
let importError = null;

try {
  const mod = require('./AppRuntime');
  RuntimeApp = mod && mod.default ? mod.default : mod;
} catch (error) {
  importError = error;
}

class DiagnosticBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {error: null};
  }

  static getDerivedStateFromError(error) {
    return {error};
  }

  componentDidCatch(error, info) {
    console.error('AppRuntime render error:', error, info);
  }

  render() {
    if (this.state.error || importError) {
      const error = this.state.error || importError;
      return (
        <View style={styles.root}>
          <Text style={styles.title}>GRAFIK PRACY</Text>
          <Text style={styles.bad}>APP RUNTIME ERROR</Text>
          <ScrollView style={styles.box}>
            <Text selectable style={styles.error}>{String(error?.stack || error?.message || error)}</Text>
          </ScrollView>
        </View>
      );
    }

    if (typeof RuntimeApp !== 'function') {
      return (
        <View style={styles.root}>
          <Text style={styles.title}>GRAFIK PRACY</Text>
          <Text style={styles.bad}>APP RUNTIME NIE JEST KOMPONENTEM</Text>
        </View>
      );
    }

    return <RuntimeApp />;
  }
}

export default function App() {
  return <DiagnosticBoundary />;
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0f172a', padding: 20, paddingTop: 60},
  title: {color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center'},
  bad: {color: '#fb7185', fontSize: 18, fontWeight: '900', textAlign: 'center', marginTop: 12},
  box: {marginTop: 20, backgroundColor: '#1e293b', borderRadius: 12, padding: 14},
  error: {color: '#fecaca', fontSize: 12, lineHeight: 18},
});