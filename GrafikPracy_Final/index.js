import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {registerRootComponent} from 'expo';

function Root() {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>GRAFIK PRACY</Text>
      <Text style={styles.subtitle}>TEST STARTU APLIKACJI</Text>
      <Text style={styles.info}>Jeżeli ten ekran jest widoczny, silnik Android/Expo działa poprawnie.</Text>
    </View>
  );
}

registerRootComponent(Root);

const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:'#11151c',alignItems:'center',justifyContent:'center',padding:24},
  title:{color:'#fff',fontSize:30,fontWeight:'900',textAlign:'center'},
  subtitle:{color:'#4f8cff',fontSize:16,fontWeight:'800',marginTop:10,textAlign:'center'},
  info:{color:'#c7ccd6',fontSize:14,lineHeight:21,marginTop:24,textAlign:'center'}
});
