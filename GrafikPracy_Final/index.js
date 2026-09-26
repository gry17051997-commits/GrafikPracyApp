import React, {Component, useEffect, useState} from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {registerRootComponent} from 'expo';

class AppErrorBoundary extends Component {
  state = {error: null};

  static getDerivedStateFromError(error) {
    return {error};
  }

  componentDidCatch(error, info) {
    console.log('GRAFIK_APP_RENDER_ERROR', error, info);
  }

  render() {
    if (this.state.error) {
      const error = this.state.error;
      return (
        <View style={S.root}>
          <Text style={S.title}>GRAFIK PRACY</Text>
          <Text style={S.errorTitle}>BŁĄD RENDEROWANIA App.js</Text>
          <ScrollView style={S.errorBox}>
            <Text style={S.errorText}>
              {String(error?.message || error)}
            </Text>
            {error?.stack ? (
              <Text style={S.stackText}>{String(error.stack)}</Text>
            ) : null}
          </ScrollView>
          <Text style={S.info}>
            App.js został załadowany, ale React zgłosił wyjątek podczas renderowania.
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

function Root() {
  const [stage, setStage] = useState('EKRAN STARTOWY DZIAŁA');
  const [App, setApp] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setStage('ŁADOWANIE App.js...');
      try {
        const originalUseEffect = React.useEffect;
        React.useEffect = (effect, deps) => originalUseEffect(() => {}, deps);
        const mod = require('./App');
        if (typeof mod?.default !== 'function') {
          throw new Error('App.js nie eksportuje komponentu default');
        }
        setApp(() => mod.default);
        setStage('App.js ZAŁADOWANY');
      } catch (e) {
        setStage('BŁĄD IMPORTU App.js: ' + String(e?.message || e));
      }
    }, 2000);

    return () => clearTimeout(t);
  }, []);

  if (App) {
    return (
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    );
  }

  return (
    <View style={S.root}>
      <Text style={S.title}>GRAFIK PRACY</Text>
      <Text style={S.step}>{stage}</Text>
      <Text style={S.info}>
        Ekran diagnostyczny pozostaje widoczny podczas ładowania właściwej aplikacji.
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
  title: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '900'
  },
  step: {
    color: '#4f8cff',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 14,
    textAlign: 'center'
  },
  errorTitle: {
    color: '#ff7777',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 18,
    textAlign: 'center'
  },
  errorBox: {
    width: '100%',
    maxHeight: 360,
    marginTop: 14,
    padding: 14,
    backgroundColor: '#1b2029',
    borderRadius: 12
  },
  errorText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 21
  },
  stackText: {
    color: '#aeb7c6',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12
  },
  info: {
    color: '#c7ccd6',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 24,
    textAlign: 'center'
  }
});
