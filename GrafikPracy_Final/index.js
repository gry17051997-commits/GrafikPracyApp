import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {registerRootComponent} from 'expo';

function Root() {
  const [stage, setStage] = useState('EKRAN STARTOWY DZIAŁA');

  useEffect(() => {
    const t = setTimeout(() => {
      setStage('TEST CZYSTEGO RENDERU App.js...');
      try {
        const originalUseEffect = React.useEffect;
        const originalUseState = React.useState;
        const rn = require('react-native');

        // Keep hook order intact, but prevent startup effects from running.
        React.useEffect = (effect, deps) => originalUseEffect(() => {}, deps);

        // App.js declares "ready" as its first useState. Force only that
        // state to true so we reach the real UI without running effects.
        let stateCalls = 0;
        React.useState = (initial) => {
          stateCalls += 1;
          if (stateCalls === 1) return [true, () => {}];
          return originalUseState(initial);
        };

        // Replace ImageBackground with a plain View for this diagnostic.
        // This isolates a possible Android 16 image rendering/native issue.
        rn.ImageBackground = ({children, style}) => (
          <View style={style}>{children}</View>
        );

        const mod = require('./App');
        if (typeof mod?.default !== 'function') {
          throw new Error('App.js nie eksportuje komponentu default');
        }
        setStage('App.js ZAŁADOWANY - RENDEROWANIE...');
        setApp(() => mod.default);
      } catch (e) {
        setStage('BŁĄD: ' + String(e?.message || e));
      }
    }, 1500);
    return () => clearTimeout(t);
  }, []);

  const [App, setApp] = useState(null);

  if (App) {
    return (
      <View style={S.appRoot}>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </View>
    );
  }

  return (
    <View style={S.root}>
      <Text style={S.title}>GRAFIK PRACY v8</Text>
      <Text style={S.step}>{stage}</Text>
      <Text style={S.info}>
        Czysty test renderowania App.js: efekty startowe wyłączone, ready wymuszone na true, ImageBackground zastąpiony View.
      </Text>
    </View>
  );
}

class AppErrorBoundary extends React.Component {
  state = {error: null};
  static getDerivedStateFromError(error) { return {error}; }
  componentDidCatch(error) { console.log('GRAFIK_V8_RENDER_ERROR', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={S.root}>
        <Text style={S.title}>GRAFIK PRACY v8</Text>
        <Text style={S.errorTitle}>BŁĄD RENDEROWANIA</Text>
        <Text style={S.errorText}>{String(this.state.error?.message || this.state.error)}</Text>
        <Text style={S.stack}>{String(this.state.error?.stack || '')}</Text>
      </View>
    );
  }
}

registerRootComponent(Root);

const S = StyleSheet.create({
  root:{flex:1,backgroundColor:'#11151c',alignItems:'center',justifyContent:'center',padding:24},
  appRoot:{flex:1,backgroundColor:'#11151c'},
  title:{color:'#fff',fontSize:28,fontWeight:'900',textAlign:'center'},
  step:{color:'#4f8cff',fontSize:17,fontWeight:'900',marginTop:16,textAlign:'center'},
  info:{color:'#c7ccd6',fontSize:14,lineHeight:21,marginTop:24,textAlign:'center'},
  errorTitle:{color:'#ff7777',fontSize:21,fontWeight:'900',marginTop:18,textAlign:'center'},
  errorText:{color:'#fff',fontSize:16,lineHeight:23,marginTop:16,textAlign:'center'},
  stack:{color:'#aeb7c6',fontSize:10,lineHeight:15,marginTop:12}
});
