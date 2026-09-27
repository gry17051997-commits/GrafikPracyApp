import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyCFmVaMVtLo7oGZxj3JCMnrWWum4FT5ZsY",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "grafik-pracy-c9006.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "grafik-pracy-c9006",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "grafik-pracy-c9006.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "977408978130",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:977408978130:web:c7f7ef7f9359515d32d10b"
};

let cached = null;

export function getFirebase() {
  if (cached) return cached;
  const app = getApps().length ? getApp() : initializeApp(config);
  let auth;
  if (Platform.OS === "web") {
    auth = getAuth(app);
  } else {
    try {
      auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
    } catch {
      auth = getAuth(app);
    }
  }
  cached = { app, auth, db: getFirestore(app) };
  return cached;
}
