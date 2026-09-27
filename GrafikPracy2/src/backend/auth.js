import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirebase } from "./firebaseClient.js";

export async function signIn(email, password) {
  const value = String(email || "").trim();
  if (!value || !password) throw new Error("Podaj e-mail i hasło.");
  const { auth } = getFirebase();
  const credential = await signInWithEmailAndPassword(auth, value, password);
  return credential.user;
}

export async function logout() {
  const { auth } = getFirebase();
  await signOut(auth);
}

export function observeAuth(callback) {
  const { auth } = getFirebase();
  return onAuthStateChanged(auth, callback);
}
