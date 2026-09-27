import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>GRAFIK PRACY</Text>
      <Text style={styles.subtitle}>TEST STARTU APK</Text>
      <Text style={styles.info}>Jeżeli ten ekran jest widoczny, natywny start aplikacji działa.</Text>
    </View>
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
  },
  subtitle: {
    color: '#38bdf8',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 14,
  },
  info: {
    color: '#cbd5e1',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 18,
    maxWidth: 320,
  },
});
