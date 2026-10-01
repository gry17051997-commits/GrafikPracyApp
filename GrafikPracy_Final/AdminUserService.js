import {httpsCallable} from 'firebase/functions';
import {functions} from './firebaseConfig';

function requireFunctions() {
  if (!functions) throw new Error('Firebase Functions są niedostępne.');
  return functions;
}

function normalizeForm(form) {
  const email=String(form?.email||'').trim().toLowerCase();
  const password=String(form?.password||'');
  const displayName=String(form?.displayName||'').trim();
  const personKey=String(form?.personKey||'').trim();
  const role=String(form?.role||'').trim();

  if(!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Podaj prawidłowy e-mail.');
  if(password.length<6 || password.length>128) throw new Error('Hasło musi mieć od 6 do 128 znaków.');
  if(displayName.length<2 || displayName.length>100) throw new Error('Imię i nazwisko musi mieć od 2 do 100 znaków.');
  if(!['','P','M','L'].includes(personKey)) throw new Error('Nieprawidłowe przypisanie pracownika.');
  if(!['employee','locator','admin'].includes(role)) throw new Error('Nieprawidłowa rola.');
  if(role==='employee' && !['P','M','L'].includes(personKey)) throw new Error('Pracownik musi mieć przypisane P/M/L.');
  if(role!=='employee' && personKey!=='') throw new Error('Lokalizator i administrator nie mogą mieć przypisanego P/M/L.');
  return {email,password,displayName,personKey,role};
}

function callableError(error) {
  const message=String(error?.message||'Operacja nie powiodła się.');
  const code=String(error?.code||'');
  return new Error(code ? message+' ('+code+')' : message);
}

export async function createUserWithoutFunctions(form) {
  const data=normalizeForm(form);
  try {
    const result=await httpsCallable(requireFunctions(),'createUserAccount')(data);
    return result.data;
  } catch(error) {
    throw callableError(error);
  }
}

export async function updateUserProfileWithoutFunctions(uid,form) {
  if(!uid) throw new Error('Brak identyfikatora użytkownika.');
  const displayName=String(form?.displayName||'').trim();
  const personKey=String(form?.personKey||'').trim();
  const role=String(form?.role||'').trim();
  const email=String(form?.email||'').trim().toLowerCase();

  if(displayName.length<2 || displayName.length>100) throw new Error('Imię i nazwisko musi mieć od 2 do 100 znaków.');
  if(!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Podaj prawidłowy e-mail.');
  if(!['','P','M','L'].includes(personKey)) throw new Error('Nieprawidłowe przypisanie pracownika.');
  if(!['employee','locator','admin'].includes(role)) throw new Error('Nieprawidłowa rola.');
  if(role==='employee' && !['P','M','L'].includes(personKey)) throw new Error('Pracownik musi mieć przypisane P/M/L.');
  if(role!=='employee' && personKey!=='') throw new Error('Lokalizator i administrator nie mogą mieć przypisanego P/M/L.');

  try {
    const result=await httpsCallable(requireFunctions(),'updateUserProfile')({uid,email,displayName,personKey,role,password:String(form?.password||'')});
    return result.data;
  } catch(error) {
    throw callableError(error);
  }
}

export async function disableUserWithoutFunctions(uid) {
  if(!uid) throw new Error('Brak identyfikatora użytkownika.');
  try {
    const result=await httpsCallable(requireFunctions(),'disableUserAccount')({uid});
    return result.data;
  } catch(error) {
    throw callableError(error);
  }
}

export async function enableUserWithoutFunctions(uid) {
  if(!uid) throw new Error('Brak identyfikatora użytkownika.');
  try {
    const result=await httpsCallable(requireFunctions(),'enableUserAccount')({uid});
    return result.data;
  } catch(error) {
    throw callableError(error);
  }
}

export async function deleteUserAccount(uid) {
  if(!uid) throw new Error('Brak identyfikatora użytkownika.');
  try {
    const result=await httpsCallable(requireFunctions(),'deleteUserAccount')({uid});
    return result.data;
  } catch(error) {
    throw callableError(error);
  }
}
