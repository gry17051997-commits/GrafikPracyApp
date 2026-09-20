import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

const box={backgroundColor:'#171b23',borderRadius:18,padding:14,flex:1,flexDirection:'column',justifyContent:'space-between'};
const label={fontSize:11,color:'#9aa4b5',fontWeight:'bold'};
const title={fontSize:18,color:'#ffffff',fontWeight:'bold'};
const value={fontSize:15,color:'#dce6ff',fontWeight:'bold'};
const accent={fontSize:24,color:'#6fa0ff',fontWeight:'bold'};

export function GrafikTerazWidget({data}){return <FlexWidget style={box} clickAction="OPEN_APP"><TextWidget text="🟢 TERAZ" style={label}/><TextWidget text={data?.person||'Brak aktywnej zmiany'} style={title}/><TextWidget text={data?.warehouse||'Brak magazynu'} style={value}/><TextWidget text={data?.time||''} style={value}/><TextWidget text={data?.remaining?'⏱ '+data.remaining:'Gotowe'} style={accent}/></FlexWidget>;}
export function GrafikAutoWidget({data}){return <FlexWidget style={box} clickAction="OPEN_APP"><TextWidget text="🚚 AUTO / GPS" style={label}/><TextWidget text={data?.status||'GPS wyłączony'} style={title}/><TextWidget text={data?.vehicle?'🚘 '+data.vehicle:'Brak auta'} style={value}/><TextWidget text={data?.detail||'Włącz nadajnik w aplikacji.'} style={value}/><TextWidget text={data?.updated||''} style={{fontSize:11,color:'#7f8a9b'}}/></FlexWidget>;}
export function GrafikRaportWidget({data}){return <FlexWidget style={box} clickAction="OPEN_APP"><TextWidget text="📲 OSTATNI RAPORT" style={label}/><TextWidget text={data?.status||'Brak raportu'} style={title}/><TextWidget text={data?.detail||''} style={value}/><TextWidget text={data?.duration?'⏱ '+data.duration:''} style={accent}/><TextWidget text={data?.time||''} style={{fontSize:11,color:'#7f8a9b'}}/></FlexWidget>;}
