import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.root}>
      <Text style={styles.text}>BOOT OK</Text>
      <Text style={styles.info}>Minimalny test startu aplikacji</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#11151c',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  text: {
    color: '#35c98a',
    fontSize: 30,
    fontWeight: '900',
  },
  info: {
    color: '#c7ccd6',
    fontSize: 15,
    marginTop: 12,
  },
});
