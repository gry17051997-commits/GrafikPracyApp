import {supabase, SUPABASE_ENABLED} from './supabaseConfig';

function requireSupabase(){
  if(!SUPABASE_ENABLED || !supabase) throw new Error('Supabase nie jest jeszcze skonfigurowany.');
  return supabase;
}

const mapProfile = row => row ? ({
  uid: row.uid,
  email: row.email || '',
  displayName: row.display_name || '',
  personKey: row.person_key || '',
  role: row.role || 'employee',
  disabled: !!row.disabled
}) : null;

const mapSchedule = row => {
  if(!row) return null;
  const data = row.data || {};
  return {...data, weekId: row.week_id, updatedAt: row.updated_at, updatedBy: row.updated_by};
};

export async function supabaseSignIn(email,password){
  const client=requireSupabase();
  const {data,error}=await client.auth.signInWithPassword({email:String(email).trim(),password});
  if(error) throw error;
  return data.user;
}

export async function supabaseSignOut(){
  const client=requireSupabase();
  const {error}=await client.auth.signOut();
  if(error) throw error;
}

export async function supabaseGetSession(){
  const client=requireSupabase();
  const {data,error}=await client.auth.getSession();
  if(error) throw error;
  return data.session;
}

export async function supabaseGetProfile(uid){
  const client=requireSupabase();
  const {data,error}=await client.from('users').select('*').eq('uid',uid).maybeSingle();
  if(error) throw error;
  return mapProfile(data);
}

export function supabaseAuthState(callback){
  const client=requireSupabase();
  return client.auth.onAuthStateChange((_event,session)=>callback(session?.user || null,session));
}

export async function supabaseListUsers(){
  const client=requireSupabase();
  const {data,error}=await client.from('users').select('*').order('display_name',{ascending:true});
  if(error) throw error;
  return (data||[]).map(r=>({uid:r.uid,...mapProfile(r)}));
}

export async function supabaseGetSettings(){
  const client=requireSupabase();
  const {data,error}=await client.from('settings').select('*').eq('id','main').maybeSingle();
  if(error) throw error;
  return data?.data || null;
}

export async function supabaseSaveSettings(data){
  const client=requireSupabase();
  const {error}=await client.from('settings').upsert({id:'main',data:data||{},updated_at:new Date().toISOString(),updated_by:(await client.auth.getUser()).data.user?.id||null});
  if(error) throw error;
}

export async function supabaseListSchedules(){
  const client=requireSupabase();
  const {data,error}=await client.from('schedules').select('*').order('week_id');
  if(error) throw error;
  return (data||[]).map(mapSchedule);
}

export async function supabaseGetSchedule(weekId){
  const client=requireSupabase();
  const {data,error}=await client.from('schedules').select('*').eq('week_id',weekId).maybeSingle();
  if(error) throw error;
  return mapSchedule(data);
}

export async function supabaseUpsertSchedule(weekId,data){
  const client=requireSupabase();
  const user=(await client.auth.getUser()).data.user;
  const {error}=await client.from('schedules').upsert({
    week_id:weekId,
    data:data||{},
    updated_at:new Date().toISOString(),
    updated_by:user?.id||null
  });
  if(error) throw error;
}

export function supabaseSubscribe(table,callback,filter){
  const client=requireSupabase();
  const channel=client.channel('grafik-pracy-'+table+'-'+Math.random().toString(36).slice(2));
  let query=channel.on('postgres_changes',{event:'*',schema:'public',table,...(filter||{})},payload=>callback(payload));
  channel.subscribe();
  return ()=>{client.removeChannel(channel);};
}

export async function supabaseListProposals(uid,isAdmin=false){
  const client=requireSupabase();
  let q=client.from('proposals').select('*').order('created_at',{ascending:false});
  if(!isAdmin) q=q.eq('from_uid',uid);
  const {data,error}=await q;
  if(error) throw error;
  return (data||[]).map(r=>({id:r.id,...(r.data||{}),fromUid:r.from_uid,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at}));
}

export async function supabaseCreateProposal(payload){
  const client=requireSupabase();
  const user=(await client.auth.getUser()).data.user;
  const {data,error}=await client.from('proposals').insert({
    data:payload||{},
    from_uid:user?.id||null,
    status:'pending'
  }).select().single();
  if(error) throw error;
  return {id:data.id,...(data.data||{}),fromUid:data.from_uid,status:data.status,createdAt:data.created_at};
}

export async function supabaseListChatMessages(limit=100){
  const client=requireSupabase();
  const {data,error}=await client.from('chat_messages').select('*').order('created_at',{ascending:false}).limit(limit);
  if(error) throw error;
  return (data||[]).reverse().map(r=>({id:r.id,uid:r.uid,...(r.data||{}),text:r.text,createdAt:r.created_at}));
}

export async function supabaseCreateChatMessage(payload){
  const client=requireSupabase();
  const user=(await client.auth.getUser()).data.user;
  const {data,error}=await client.from('chat_messages').insert({
    uid:user?.id,
    text:String(payload?.text||'').trim(),
    data:payload||{}
  }).select().single();
  if(error) throw error;
  return {id:data.id,uid:data.uid,...(data.data||{}),text:data.text,createdAt:data.created_at};
}

export async function supabaseListReports(uid,isAdmin=false,limit=100){
  const client=requireSupabase();
  let q=client.from('whatsapp_reports').select('*').order('created_at',{ascending:false}).limit(limit);
  if(!isAdmin) q=q.eq('uid',uid);
  const {data,error}=await q;
  if(error) throw error;
  return (data||[]).map(r=>({id:r.id,uid:r.uid,...(r.data||{}),text:r.text,createdAt:r.created_at,updatedAt:r.updated_at}));
}

export async function supabaseCreateReport(payload){
  const client=requireSupabase();
  const user=(await client.auth.getUser()).data.user;
  const {data,error}=await client.from('whatsapp_reports').insert({
    uid:user?.id,
    text:String(payload?.text||'').trim(),
    data:payload||{}
  }).select().single();
  if(error) throw error;
  return {id:data.id,uid:data.uid,...(data.data||{}),text:data.text,createdAt:data.created_at,updatedAt:data.updated_at};
}

export async function supabaseGetLocationConfig(){
  const client=requireSupabase();
  const {data,error}=await client.from('location_config').select('*').eq('id','main').maybeSingle();
  if(error) throw error;
  return data ? {...data,vehicleId:data.vehicle_id,updatedAt:data.updated_at,updatedBy:data.updated_by} : null;
}

export async function supabaseSaveLocationConfig(patch){
  const client=requireSupabase();
  const user=(await client.auth.getUser()).data.user;
  const current=await supabaseGetLocationConfig();
  const row={
    id:'main',
    vehicle_id:String(patch.vehicleId ?? current?.vehicleId ?? ''),
    registration:String(patch.registration ?? current?.registration ?? ''),
    updated_at:new Date().toISOString(),
    updated_by:user?.id||null
  };
  const {error}=await client.from('location_config').upsert(row);
  if(error) throw error;
  return row;
}

export async function supabaseSaveVehicleLocation(payload){
  const client=requireSupabase();
  const {error}=await client.from('vehicle_tracking').upsert({
    vehicle_id:payload.vehicleId,
    registration:payload.registration||payload.vehicleId||'',
    owner_uid:payload.ownerUid,
    latitude:Number(payload.latitude),
    longitude:Number(payload.longitude),
    data:payload,
    updated_at:new Date().toISOString()
  });
  if(error) throw error;
  return supabaseSaveVehicleHistory(payload);
}

export async function supabaseSaveVehicleHistory(payload){
  const client=requireSupabase();
  const {error}=await client.from('vehicle_locations').insert({
    vehicle_id:payload.vehicleId,
    owner_uid:payload.ownerUid,
    registration:payload.registration||payload.vehicleId||'',
    latitude:Number(payload.latitude),
    longitude:Number(payload.longitude),
    data:payload,
    updated_at:new Date().toISOString()
  });
  if(error) throw error;
}

export async function supabaseListVehicleLocations(vehicleId,limit=120){
  const client=requireSupabase();
  const {data,error}=await client.from('vehicle_locations').select('*').eq('vehicle_id',vehicleId).order('updated_at',{ascending:false}).limit(limit);
  if(error) throw error;
  return (data||[]).map(r=>({...r.data,vehicleId:r.vehicle_id,ownerUid:r.owner_uid,registration:r.registration,updatedAt:r.updated_at}));
}
