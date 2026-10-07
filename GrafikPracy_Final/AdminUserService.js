import {api,apiMe} from './apiClient';

async function assertAdmin(){const user=await apiMe();if(!user||user.role!=='admin'||user.disabled)throw new Error('Tylko aktywny administrator może wykonywać tę operację.');return user.uid;}
function validateInput(form,requirePassword=true){
  const email=String(form.email||'').trim().toLowerCase();
  const password=String(form.password||'');
  const displayName=String(form.displayName||'').trim();
  const personKey=String(form.personKey||'');
  const role=String(form.role||'employee');
  if(!/^\S+@\S+\.\S+$/.test(email))throw new Error('Podaj prawidłowy e-mail.');
  if(requirePassword&&(password.length<6||password.length>128))throw new Error('Hasło musi mieć od 6 do 128 znaków.');
  if(displayName.length<2||displayName.length>100)throw new Error('Imię i nazwisko musi mieć od 2 do 100 znaków.');
  if(!['','P','M','L'].includes(personKey))throw new Error('Nieprawidłowe przypisanie pracownika.');
  if(!['employee','locator','admin'].includes(role))throw new Error('Nieprawidłowa rola.');
  if(role==='employee'&&!['P','M','L'].includes(personKey))throw new Error('Pracownik musi mieć przypisane P/M/L.');
  if(role!=='employee'&&personKey!=='')throw new Error('Lokalizator i administrator nie mogą mieć przypisanego P/M/L.');
  return {email,password,displayName,personKey,role};
}
export async function createUserWithoutFunctions(form){const data=validateInput(form,true);await assertAdmin();const r=await api('/users',{method:'POST',body:data});return {ok:true,uid:r.user.uid,email:r.user.email};}
export async function updateUserProfileWithoutFunctions(uid,form){if(!uid)throw new Error('Brak identyfikatora użytkownika.');const data=validateInput(form,false),adminUid=await assertAdmin();if(uid===adminUid)throw new Error('Nie możesz edytować własnego profilu administratora w tym miejscu.');await api('/users/'+encodeURIComponent(uid),{method:'PATCH',body:data});return {ok:true,uid};}
export async function disableUserWithoutFunctions(uid){if(!uid)throw new Error('Brak identyfikatora użytkownika.');const adminUid=await assertAdmin();if(uid===adminUid)throw new Error('Administrator nie może wyłączyć własnego konta.');await api('/users/'+encodeURIComponent(uid),{method:'PATCH',body:{disabled:true}});return {ok:true,uid,disabled:true};}
export async function deleteUserAccountWithoutFunctions(uid){return disableUserWithoutFunctions(uid);}
export async function enableUserWithoutFunctions(uid){if(!uid)throw new Error('Brak identyfikatora użytkownika.');await assertAdmin();await api('/users/'+encodeURIComponent(uid),{method:'PATCH',body:{disabled:false}});return {ok:true,uid,disabled:false};}
export async function setUserRoleAdmin(uid,role){const adminUid=await assertAdmin();if(!uid)throw new Error('Brak identyfikatora użytkownika.');if(!['admin','employee','locator'].includes(role))throw new Error('Nieprawidłowa rola użytkownika.');if(uid===adminUid&&role!=='admin')throw new Error('Nie możesz odebrać sobie roli administratora.');await api('/users/'+encodeURIComponent(uid),{method:'PATCH',body:{role}});return {ok:true,uid,role};}
export async function setUserDisabledAdmin(uid,disabled){return disabled?disableUserWithoutFunctions(uid):enableUserWithoutFunctions(uid);}
export async function assignVehicleRegistrationAdmin(registration){await assertAdmin();const normalized=String(registration||'').trim().toUpperCase();if(!normalized)throw new Error('Brak numeru rejestracyjnego.');const r=await api('/vehicles',{method:'POST',body:{registration:normalized}});return {ok:true,vehicleId:r.vehicle.id,registration:normalized};}
export async function adjustRecoveryBalanceAdmin(person,delta){await assertAdmin();if(!['P','M','L'].includes(person))throw new Error('Nieprawidłowy pracownik.');const amount=Number(delta);if(!Number.isFinite(amount)||amount===0)throw new Error('Nieprawidłowa korekta salda.');const current=(await api('/store/settings/main')).data||{};const balances={P:0,M:0,L:0,...(current.recoveryBalances||{})};const next=(Number(balances[person])||0)+amount;if(next<0)throw new Error('Saldo nie może spaść poniżej zera.');balances[person]=next;await api('/store/settings/main',{method:'PUT',body:{payload:{recoveryBalances:balances}}});return {ok:true,person,delta:amount,next};}
