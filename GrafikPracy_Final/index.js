import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {registerRootComponent} from 'expo';

function BootScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.icon}>🚀</Text>
      <Text style={styles.title}>GRAFIK PRACY</Text>
      <Text style={styles.ok}>BOOT OK</Text>
      <Text style={styles.info}>Start Androida działa. Ładowanie właściwej aplikacji...</Text>
    </View>
  );
}

function ErrorScreen({error}) {
  const message = String(error?.message || error || 'Nieznany błąd podczas ładowania aplikacji.');
  return (
    <View style={styles.root}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.title}>Błąd startu aplikacji</Text>
      <Text style={styles.info}>Natywny start działa, ale właściwy interfejs nie został załadowany.</Text>
      <View style={styles.errorBox}>
        <Text style={styles.errorText}>{message}</Text>
      </View>
    </View>
  );
}

function Root() {
  const [App, setApp] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      try {
        const LoadedApp = require('./App').default;
        if (active) setApp(() => LoadedApp);
      } catch (e) {
        console.error('Grafik Pracy bootstrap error:', e);
        if (active) setError(e);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  if (error) return <ErrorScreen error={error} />;
  if (!App) return <BootScreen />;
  return <App />;
}

registerRootComponent(Root);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#11151c',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28
  },
  icon: {
    fontSize: 58,
    marginBottom: 18
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center'
  },
  ok: {
    color: '#35c98a',
    fontSize: 24,
    fontWeight: '900',
    marginTop: 12
  },
  info: {
    color: '#c7ccd6',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 14
  },
  errorBox: {
    backgroundColor: '#1b222d',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#7b3039',
    padding: 14,
    marginTop: 20,
    width: '100%'
  },
  errorText: {
    color: '#ffb4b4',
    fontSize: 13,
    lineHeight: 19
  }
});
