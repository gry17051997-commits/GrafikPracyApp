import React,{useCallback,useEffect,useState} from 'react';
import {Alert,AppState,Platform,Text,TouchableOpacity,View} from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

const RELEASES_URL='https://api.github.com/repos/gry17051997-commits/3gf/releases/tags/grafik-latest';
const APK_NAME='GrafikPracy.apk';
const PACKAGE_NAME='pl.grafikpracy.app';
const APK_MIME='application/vnd.android.package-archive';
const LAST_CHECK_KEY='grafik-pracy-update-last-check-v1';
const CHECK_INTERVAL_MS=6*60*60*1000;
const parts=value=>String(value||'0').replace(/^v/i,'').split(/[.+-]/).map(x=>Number.parseInt(x,10)||0);
const isNewer=(remote,local)=>{
  const a=parts(remote),b=parts(local);
  for(let i=0;i<Math.max(a.length,b.length);i++){const x=a[i]||0,y=b[i]||0;if(x!==y)return x>y;}
  return false;
};

export default function UpdateBanner(){
  const [release,setRelease]=useState(null);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');
  const currentVersion=Constants.expoConfig?.version||'0.0.0';
  const check=useCallback(async()=>{
    if(Platform.OS!=='android')return;
    try{
      const last=Number(await AsyncStorage.getItem(LAST_CHECK_KEY)||0);
      if(last&&Date.now()-last<CHECK_INTERVAL_MS)return;
      const response=await fetch(RELEASES_URL,{headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
      if(!response.ok)return;
      const data=await response.json();
      await AsyncStorage.setItem(LAST_CHECK_KEY,String(Date.now()));
      const version=(String(data.name||'')+' '+String(data.tag_name||'')).match(/\\d+\\.\\d+\\.\\d+/)?.[0] || '';
      const apk=(data.assets||[]).find(asset=>asset.name===APK_NAME&&asset.browser_download_url);
      if(version&&apk&&isNewer(version,currentVersion))setRelease({version,apk,notes:String(data.body||'').trim()});
      else setRelease(null);
    }catch(error){console.log('UPDATE_CHECK_ERROR',error?.message||error);}
  },[currentVersion]);
  useEffect(()=>{
    check();
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')check();});
    return()=>subscription.remove();
  },[check]);
  const install=async()=>{
    if(!release||busy)return;
    setBusy(true);setStatus('Pobieranie aktualizacji…');
    try{
      const destination=(FileSystem.cacheDirectory||FileSystem.documentDirectory)+'grafik-pracy-update.apk';
      const result=await FileSystem.downloadAsync(release.apk.browser_download_url,destination);
      if(result.status!==200)throw new Error('APK_DOWNLOAD_HTTP_'+result.status);
      setStatus('Uruchamianie instalatora Androida…');
      const contentUri=await FileSystem.getContentUriAsync(result.uri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW',{data:contentUri,type:APK_MIME,flags:1});
    }catch(error){
      console.log('UPDATE_INSTALL_ERROR',error?.message||error);
      Alert.alert('Nie udało się uruchomić instalatora',
        'Jeśli Android blokuje instalację, włącz zezwolenie na instalowanie aplikacji z tego źródła i ponów próbę.',
        [{text:'Otwórz ustawienia',onPress:async()=>{
          try{await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES',{data:'package:'+PACKAGE_NAME});}
          catch(e){Alert.alert('Ustawienia','Włącz instalowanie nieznanych aplikacji dla Grafik Pracy.');}
        }},{text:'Później',style:'cancel'}]);
    }finally{setBusy(false);setStatus('');}
  };
  if(!release)return null;
  return <View style={{marginHorizontal:12,marginTop:7,marginBottom:8,padding:12,borderRadius:13,backgroundColor:'#173b2d',borderWidth:1,borderColor:'#2f8a62'}}>
    <Text style={{color:'#fff',fontWeight:'900',fontSize:14}}>⬆ Dostępna aktualizacja Grafik Pracy {release.version}</Text>
    {!!release.notes&&<Text numberOfLines={3} style={{color:'#d1fae5',fontSize:11,marginTop:4}}>{release.notes}</Text>}
    <TouchableOpacity disabled={busy} onPress={install} style={{marginTop:9,padding:11,borderRadius:9,backgroundColor:'#2e9d69',alignItems:'center',minHeight:44,justifyContent:'center'}}>
      <Text style={{color:'#fff',fontWeight:'900'}}>{busy?(status||'AKTUALIZOWANIE…'):'AKTUALIZUJ'}</Text>
    </TouchableOpacity>
  </View>;
}
