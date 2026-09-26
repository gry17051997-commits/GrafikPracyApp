import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {registerRootComponent} from 'expo';

function Root() {
  const [stage, setStage] = useState('EKRAN STARTOWY DZIAŁA');

  useEffect(() => {
    const t = setTimeout(() => {
      setStage('IMPORTOWANIE App.js...');
      try {
        const mod = require('./App');
        if (typeof mod?.default !== 'function') {
          throw new Error('App.js nie eksportuje komponentu default');
        }
        setStage('IMPORT App.js OK - App NIE JEST JESZCZE RENDEROWANY');
      } catch (e) {
        setStage('BŁĄD IMPORTU App.js: ' + String(e?.message || e));
      }
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <View style={S.root}>
      <Text style={S.title}>GRAFIK PRACY v7</Text>
      <Text style={S.step}>{stage}</Text>
      <Text style={S.info}>
        Ten test tylko ładuje moduł App.js. Nie renderuje go.
      </Text>
    </View>
  );
}

registerRootComponent(Root);

const S = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#11151c',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  title: { color: '#fff', fontSize: 28, fontWeight: '900' },
  step: {
    color: '#4f8cff',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 16,
    textAlign: 'center'
  },
  info: {
    color: '#c7ccd6',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 24,
    textAlign: 'center'
  }
});
