import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {registerRootComponent} from 'expo';

function BootDiagnostic() {
  return (
    <View style={S.root}>
      <Text style={S.icon}>🚀</Text>
      <Text style={S.title}>GRAFIK PRACY</Text>
      <Text style={S.ok}>NATIVE + JS BOOT OK</Text>
      <Text style={S.info}>Ten test nie ładuje App.js, Firebase, GPS, WebView ani LocationService.</Text>
      <Text style={S.info}>Jeżeli ten ekran działa, problem znajduje się wyżej w łańcuchu właściwej aplikacji.</Text>
    </View>
  );
}
const S=StyleSheet.create({
  root:{flex:1,backgroundColor:'#11151c',alignItems:'center',justifyContent:'center',padding:28},
  icon:{fontSize:58,marginBottom:18},
  title:{color:'#fff',fontSize:28,fontWeight:'900',textAlign:'center'},
  ok:{color:'#35c98a',fontSize:24,fontWeight:'900',marginTop:12,textAlign:'center'},
  info:{color:'#c7ccd6',fontSize:15,lineHeight:22,textAlign:'center',marginTop:14}
});
registerRootComponent(BootDiagnostic);
