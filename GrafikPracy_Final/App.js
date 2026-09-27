import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

let RuntimeApp = null;
let loadError = null;

try {
  const runtimeModule = require('./AppRuntime');
  RuntimeApp = runtimeModule && runtimeModule.default ? runtimeModule.default : runtimeModule;
} catch (error) {
  loadError = error;
}

class RuntimeErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const error = this.state.error;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <Text style={styles.title}>GRAFIK PRACY</Text>
        <Text style={styles.subtitle}>BŁĄD APP RUNTIME</Text>
        <ScrollView style={styles.box} contentContainerStyle={styles.boxContent}>
          <Text style={styles.label}>Aplikacja natywna działa, ale AppRuntime zgłosił wyjątek podczas renderowania.</Text>
          <Text selectable style={styles.error}>{String(error?.stack || error?.message || error)}</Text>
        </ScrollView>
      </View>
    );
  }
}

function DiagnosticError({ title, error }) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>GRAFIK PRACY</Text>
      <Text style={styles.subtitle}>{title}</Text>
      <ScrollView style={styles.box} contentContainerStyle={styles.boxContent}>
        <Text style={styles.label}>Błąd wystąpił podczas ładowania AppRuntime, zanim aplikacja została wyrenderowana.</Text>
        <Text selectable style={styles.error}>{String(error?.stack || error?.message || error)}</Text>
      </ScrollView>
    </View>
  );
}

export default function App() {
  if (loadError) {
    return <DiagnosticError title="BŁĄD ŁADOWANIA APP RUNTIME" error={loadError} />;
  }

  if (!RuntimeApp) {
    return <DiagnosticError title="APP RUNTIME NIE ZOSTAŁ ZAŁADOWANY" error={new Error('require("./AppRuntime") zwrócił pustą wartość')} />;
  }

  return (
    <RuntimeErrorBoundary>
      <RuntimeApp />
    </RuntimeErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    color: '#38bdf8',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 14,
    textAlign: 'center',
  },
  label: {
    color: '#cbd5e1',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 12,
  },
  box: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '62%',
    marginTop: 22,
    backgroundColor: '#111827',
    borderRadius: 12,
  },
  boxContent: {
    padding: 16,
  },
  error: {
    color: '#fca5a5',
    fontSize: 12,
    lineHeight: 18,
  },
});
