// DIAGNOSTIC: Firebase startup is intentionally disabled in this build.
// The production Firebase configuration is preserved in git history and will be restored
// after the startup fault is isolated.
import { getApps } from 'firebase/app';

export const FIREBASE_ENABLED = false;
export const firebaseApp = null;
export const auth = null;
export const db = null;
export const functions = null;

// Keep this module side-effect free during startup diagnostics.
void getApps;
