import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

let AppRuntime = null;
let bootError = null;

function BootScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>GRAFIK PRACY</Text>
      <Text style={styles.subtitle}>Uruchamianie aplikacji...</Text>
    </View>
  );
}

function ErrorScreen({ message }) {
  return (
    <View style={styles.rootError}>
      <Text style={styles.errorIcon}>⚠️</Text>
      <Text style={styles.errorTitle}>Błąd startu aplikacji</Text>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export default function App() {
  const [status, setStatus] = useState('booting');

  useEffect(() => {
    let mounted = true;

    const start = async () => {
      try {
        const mod = await import('./AppRuntime');
        if (!mounted) return;

        AppRuntime = mod.default;
        setStatus('ready');
      } catch (error) {
        console.error('BOOT_ERROR', error);
        bootError = error;
        if (mounted) setStatus('error');
      }
    };

    start();

    return () => {
      mounted = false;
    };
  }, []);

  if (status === 'booting') return <BootScreen />;

  if (status === 'error') {
    return <ErrorScreen message={String(bootError?.message || bootError || 'Nieznany błąd podczas ładowania aplikacji.')} />;
  }

  if (AppRuntime) {
    const RuntimeApp = AppRuntime;
    return <RuntimeApp />;
  }

  return <BootScreen />;
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
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#cbd5e1',
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  rootError: {
    flex: 1,
    backgroundColor: '#111827',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorIcon: {
    fontSize: 52,
    marginBottom: 12,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorText: {
    color: '#fecaca',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
