import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebase } from "./firebaseClient.js";

export async function loadMainSchedule() {
  const { db } = getFirebase();
  const snapshot = await getDoc(doc(db, "schedules", "main"));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function saveMainSchedule(schedule, actorUid) {
  if (!actorUid) throw new Error("Brak użytkownika zapisującego grafik.");
  const { db } = getFirebase();
  await setDoc(doc(db, "schedules", "main"), {
    ...schedule,
    updatedBy: actorUid,
    updatedAt: new Date().toISOString()
  }, { merge: true });
}
