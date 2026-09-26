import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {registerRootComponent} from 'expo';

function BootDiagnostic() {
  return (
    <View style={S.root}>
      <Text style={S.icon}>🚀</Text>
      <Text style={S.title}>GRAFIK PRACY</Text>
      <Text style={S.ok}>BOOT OK</Text>
      <Text style={S.info}>Natywny start Androida i wbudowany bundle JavaScript działają.</Text>
      <Text style={S.info}>To jest test diagnostyczny, bez ładowania właściwej aplikacji.</Text>
    </View>
  );
}

const S=StyleSheet.create({
  root:{flex:1,backgroundColor:'#11151c',alignItems:'center',justifyContent:'center',padding:28},
  icon:{fontSize:58,marginBottom:18},
  title:{color:'#fff',fontSize:28,fontWeight:'900'},
  ok:{color:'#35c98a',fontSize:24,fontWeight:'900',marginTop:12},
  info:{color:'#c7ccd6',fontSize:15,lineHeight:22,textAlign:'center',marginTop:14}
});

registerRootComponent(BootDiagnostic);
