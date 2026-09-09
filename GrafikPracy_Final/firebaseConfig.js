import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyCFmVaMVtLo7oGZxj3JCMnrWWum4FT5ZsY',
  authDomain: 'grafik-pracy-c9006.firebaseapp.com',
  projectId: 'grafik-pracy-c9006',
  storageBucket: 'grafik-pracy-c9006.firebasestorage.app',
  messagingSenderId: '977408978130',
  appId: '1:977408978130:web:c7f7ef7f9359515d32d10b',
  measurementId: 'G-JDY7G3KVRE'
};

export const FIREBASE_ENABLED = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId
);

export const firebaseApp = FIREBASE_ENABLED
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

export const auth = firebaseApp
  ? (() => {
      try {
        return initializeAuth(firebaseApp, { persistence: getReactNativePersistence(AsyncStorage) });
      } catch (e) {
        return getAuth(firebaseApp);
      }
    })()
  : null;

export const db = firebaseApp ? getFirestore(firebaseApp) : null;
