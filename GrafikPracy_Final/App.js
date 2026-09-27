import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>GRAFIK PRACY</Text>
      <Text style={styles.ok}>APP.JS BOOT OK</Text>
      <Text style={styles.info}>Minimalny test App.js.</Text>
      <Text style={styles.info}>Bez Firebase, GPS, WebView, LocationService i pozostałych modułów aplikacji.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#11151c', justifyContent: 'center', alignItems: 'center', padding: 28 },
  title: { color: '#fff', fontSize: 28, fontWeight: '900' },
  ok: { color: '#35c98a', fontSize: 24, fontWeight: '900', marginTop: 12 },
  info: { color: '#c7ccd6', fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 14 },
});