import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';

const {Pool}=pg;
const app=express();
app.use(cors());
app.use(express.json({limit:'2mb'}));

const pool=new Pool({
  connectionString:process.env.DATABASE_URL,
  ssl:process.env.DATABASE_URL?{rejectUnauthorized:false}:false
});
const PORT=Number(process.env.PORT||8787);
const SESSION_DAYS=30;
const STORE_COLLECTIONS=new Set(['chatMessages','proposals','schedules','settings','whatsappReports','audit']);

const hashToken=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const hashPassword=password=>{
  const salt=crypto.randomBytes(16).toString('hex');
  const derived=crypto.scryptSync(String(password),salt,64,{N:16384,r:8,p:1,maxmem:128*1024*1024}).toString('hex');
  return 'scrypt$'+salt+'$'+derived;
};
const verifyPassword=(password,stored)=>{
  const parts=String(stored||'').split('$');
  if(parts.length!==3||parts[0]!=='scrypt')return false;
  const derived=crypto.scryptSync(String(password),parts[1],64,{N:16384,r:8,p:1,maxmem:128*1024*1024}).toString('hex');
  const a=Buffer.from(derived,'hex'),b=Buffer.from(parts[2],'hex');
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
};
const randomToken=()=>crypto.randomBytes(32).toString('hex');
const id=()=>crypto.randomUUID();
const validEmail=v=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||''));
const validRole=v=>['employee','locator','admin'].includes(v);
const validPerson=v=>['','P','M','L'].includes(v);
const publicUser=r=>({uid:r.id,email:r.email,displayName:r.display_name,personKey:r.person_key||'',role:r.role,disabled:!!r.disabled});

async function q(text,params=[]){return pool.query(text,params);}
async function auth(req,res,next){
  try{
    const raw=String(req.headers.authorization||'');
    const token=raw.startsWith('Bearer ')?raw.slice(7).trim():'';
    if(!token)return res.status(401).json({error:'AUTH_REQUIRED'});
    const r=await q('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.disabled=false',[hashToken(token)]);
    if(!r.rows[0])return res.status(401).json({error:'AUTH_INVALID'});
    req.user=r.rows[0];
    next();
  }catch(e){next(e);}
}
function admin(req,res,next){if(req.user.role!=='admin')return res.status(403).json({error:'ADMIN_REQUIRED'});next();}

function canStoreRead(name,user,payload={}){
  if(name==='audit')return user.role==='admin';
  if(name==='proposals')return user.role==='admin'||payload.fromUid===user.id;
  if(name==='whatsappReports')return user.role==='admin'||payload.uid===user.id;
  return true;
}
function canStoreWrite(name,user,payload={},existing=null){
  if(name==='audit')return false;
  if(name==='settings'||name==='schedules')return user.role==='admin';
  if(name==='proposals')return user.role==='admin'||(!existing&&payload.fromUid===user.id);
  if(name==='chatMessages')return user.role==='admin'||(!existing&&payload.uid===user.id);
  if(name==='whatsappReports')return user.role==='admin'||(!existing&&payload.uid===user.id);
  if(name==='users')return user.role==='admin';
  return true;
}

function assertCollectionName(v){
  const name=String(v||'');
  if(!/^[A-Za-z0-9_-]{1,64}$/.test(name)||!STORE_COLLECTIONS.has(name))throw new Error('INVALID_COLLECTION');
}

app.get('/api/health',async(_req,res)=>{
  try{await q('SELECT 1');res.json({ok:true,backend:'central-api',firestore:false});}
  catch(e){res.status(503).json({ok:false,error:e.message});}
});

app.post('/api/auth/register',async(req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase();
  const password=String(req.body?.password||'');
  const displayName=String(req.body?.displayName||email.split('@')[0]||'').trim();
  if(!validEmail(email)||password.length<6||password.length>128||displayName.length<2||displayName.length>100)return res.status(400).json({error:'INVALID_REGISTRATION'});
  const count=await q('SELECT COUNT(*)::int AS n FROM users');
  const role=Number(count.rows[0].n)===0?'admin':'employee';
  try{
    const uid=id();
    const r=await q('INSERT INTO users(id,email,password_hash,display_name,role) VALUES($1,$2,$3,$4,$5) RETURNING *',[uid,email,hashPassword(password),displayName,role]);
    const token=randomToken();
    await q("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+($3 || ' days')::interval)",[hashToken(token),uid,SESSION_DAYS]);
    res.status(201).json({token,user:publicUser(r.rows[0])});
  }catch(e){res.status(409).json({error:'USER_ALREADY_EXISTS'});}
});

app.post('/api/auth/login',async(req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase();
  const password=String(req.body?.password||'');
  const r=await q('SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1',[email]);
  const u=r.rows[0];
  if(!u||u.disabled||!verifyPassword(password,u.password_hash))return res.status(401).json({error:'INVALID_CREDENTIALS'});
  const token=randomToken();
  await q("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+($3 || ' days')::interval)",[hashToken(token),u.id,SESSION_DAYS]);
  res.json({token,user:publicUser(u)});
});

app.post('/api/auth/logout',auth,async(req,res)=>{
  const raw=String(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  await q('DELETE FROM sessions WHERE token_hash=$1',[hashToken(raw)]);
  res.json({ok:true});
});
app.get('/api/me',auth,(req,res)=>res.json({user:publicUser(req.user)}));

app.get('/api/users',auth,admin,async(_req,res)=>{
  const r=await q('SELECT * FROM users ORDER BY lower(display_name),lower(email)');
  res.json({users:r.rows.map(publicUser)});
});
app.post('/api/users',auth,admin,async(req,res)=>{
  const b=req.body||{};
  const email=String(b.email||'').trim().toLowerCase();
  const password=String(b.password||'');
  const displayName=String(b.displayName||'').trim();
  const personKey=String(b.personKey||'');
  const role=String(b.role||'employee');
  if(!validEmail(email)||password.length<6||password.length>128||displayName.length<2||displayName.length>100||!validRole(role)||!validPerson(personKey)||(role==='employee'&&!['P','M','L'].includes(personKey))||(role!=='employee'&&personKey))return res.status(400).json({error:'INVALID_USER'});
  try{
    const exists=await q('SELECT 1 FROM users WHERE lower(email)=lower($1) OR ($2<>$3 AND person_key=$2) LIMIT 1',[email,personKey,'']);
    if(exists.rows[0])return res.status(409).json({error:'USER_ALREADY_EXISTS'});
    const r=await q('INSERT INTO users(id,email,password_hash,display_name,person_key,role) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[id(),email,hashPassword(password),displayName,personKey,role]);
    res.status(201).json({user:publicUser(r.rows[0])});
  }catch(e){res.status(409).json({error:'USER_ALREADY_EXISTS'});}
});
app.patch('/api/users/:uid',auth,admin,async(req,res)=>{
  const uid=req.params.uid,b=req.body||{};
  const current=await q('SELECT * FROM users WHERE id=$1',[uid]);
  if(!current.rows[0])return res.status(404).json({error:'USER_NOT_FOUND'});
  const u=current.rows[0];
  const nextRole=b.role!==undefined?String(b.role):u.role;
  const nextPerson=b.personKey!==undefined?String(b.personKey):String(u.person_key||'');
  const nextEmail=b.email!==undefined?String(b.email).trim().toLowerCase():u.email;
  const nextName=b.displayName!==undefined?String(b.displayName).trim():u.display_name;
  if(uid===req.user.id&&nextRole!=='admin')return res.status(400).json({error:'CANNOT_DEMOTE_SELF'});
  if(!validRole(nextRole)||!validPerson(nextPerson)||!validEmail(nextEmail)||nextName.length<2||nextName.length>100)return res.status(400).json({error:'INVALID_USER'});
  if(nextRole==='employee'&&!['P','M','L'].includes(nextPerson))return res.status(400).json({error:'EMPLOYEE_PERSON_REQUIRED'});
  if(nextRole!=='employee'&&nextPerson!=='')return res.status(400).json({error:'PERSON_NOT_ALLOWED'});
  try{
    const r=await q('UPDATE users SET display_name=$2,email=$3,person_key=$4,role=$5,disabled=COALESCE($6,disabled),updated_at=NOW() WHERE id=$1 RETURNING *',[uid,nextName,nextEmail,nextPerson,nextRole,b.disabled]);
    res.json({user:publicUser(r.rows[0])});
  }catch(e){res.status(409).json({error:'USER_ALREADY_EXISTS'});}
});
app.delete('/api/users/:uid',auth,admin,async(req,res)=>{
  if(req.params.uid===req.user.id)return res.status(400).json({error:'CANNOT_DELETE_SELF'});
  await q('UPDATE users SET disabled=true,updated_at=NOW() WHERE id=$1',[req.params.uid]);
  res.json({ok:true});
});

app.get('/api/vehicles',auth,async(_req,res)=>{
  const r=await q('SELECT * FROM vehicles ORDER BY registration');
  res.json({vehicles:r.rows});
});
app.post('/api/vehicles',auth,admin,async(req,res)=>{
  const registration=String(req.body?.registration||'').trim().toUpperCase();
  const name=String(req.body?.name||'').trim();
  if(!registration)return res.status(400).json({error:'REGISTRATION_REQUIRED'});
  try{
    const r=await q('INSERT INTO vehicles(id,registration,name) VALUES($1,$2,$3) RETURNING *',[id(),registration,name]);
    res.status(201).json({vehicle:r.rows[0]});
  }catch(e){res.status(409).json({error:'VEHICLE_ALREADY_EXISTS'});}
});
app.patch('/api/vehicles/:id',auth,admin,async(req,res)=>{
  const r=await q('UPDATE vehicles SET registration=COALESCE($2,registration),name=COALESCE($3,name),active=COALESCE($4,active),updated_at=NOW() WHERE id=$1 RETURNING *',[req.params.id,req.body?.registration?String(req.body.registration).trim().toUpperCase():null,req.body?.name,req.body?.active]);
  if(!r.rows[0])return res.status(404).json({error:'VEHICLE_NOT_FOUND'});
  res.json({vehicle:r.rows[0]});
});
app.delete('/api/vehicles/:id',auth,admin,async(req,res)=>{
  await q('DELETE FROM vehicles WHERE id=$1',[req.params.id]);
  res.json({ok:true});
});

app.get('/api/phones',auth,admin,async(_req,res)=>{
  const r=await q('SELECT id,name,active,last_seen_at,created_at,updated_at FROM phones ORDER BY name');
  res.json({phones:r.rows});
});
app.post('/api/phones',auth,admin,async(req,res)=>{
  const name=String(req.body?.name||'').trim();
  if(!name)return res.status(400).json({error:'PHONE_NAME_REQUIRED'});
  const token=randomToken();
  const r=await q('INSERT INTO phones(id,name,device_token_hash) VALUES($1,$2,$3) RETURNING id,name,active,created_at',[id(),name,hashToken(token)]);
  res.status(201).json({phone:r.rows[0],deviceToken:token});
});
app.patch('/api/phones/:id',auth,admin,async(req,res)=>{
  const r=await q('UPDATE phones SET name=COALESCE($2,name),active=COALESCE($3,active),updated_at=NOW() WHERE id=$1 RETURNING id,name,active,last_seen_at,created_at,updated_at',[req.params.id,req.body?.name,req.body?.active]);
  if(!r.rows[0])return res.status(404).json({error:'PHONE_NOT_FOUND'});
  res.json({phone:r.rows[0]});
});
app.delete('/api/phones/:id',auth,admin,async(req,res)=>{
  const r=await q('DELETE FROM phones WHERE id=$1 RETURNING id',[req.params.id]);
  if(!r.rows[0])return res.status(404).json({error:'PHONE_NOT_FOUND'});
  res.json({ok:true});
});

app.get('/api/assignments',auth,async(_req,res)=>{
  const r=await q('SELECT a.*,v.registration,v.name AS vehicle_name,p.name AS phone_name,u.display_name AS user_name FROM assignments a JOIN vehicles v ON v.id=a.vehicle_id JOIN phones p ON p.id=a.phone_id LEFT JOIN users u ON u.id=a.user_id WHERE a.active=true ORDER BY v.registration');
  res.json({assignments:r.rows});
});
app.post('/api/assignments',auth,admin,async(req,res)=>{
  const {vehicleId,phoneId,userId=null}=req.body||{};
  if(!vehicleId||!phoneId)return res.status(400).json({error:'ASSIGNMENT_REQUIRED'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('UPDATE assignments SET active=false,updated_at=NOW() WHERE vehicle_id=$1 OR phone_id=$2',[vehicleId,phoneId]);
    const r=await client.query('INSERT INTO assignments(id,vehicle_id,phone_id,user_id) VALUES($1,$2,$3,$4) RETURNING *',[id(),vehicleId,phoneId,userId]);
    await client.query('COMMIT');
    res.status(201).json({assignment:r.rows[0]});
  }catch(e){await client.query('ROLLBACK');res.status(400).json({error:'ASSIGNMENT_FAILED'});}
  finally{client.release();}
});

async function deviceVehicle(token){
  const r=await q('SELECT v.* FROM phones p JOIN assignments a ON a.phone_id=p.id AND a.active=true JOIN vehicles v ON v.id=a.vehicle_id WHERE p.device_token_hash=$1 AND p.active=true AND v.active=true',[hashToken(token)]);
  return r.rows[0];
}
app.get('/api/gps/device',async(req,res)=>{
  const token=String(req.headers['x-device-token']||'').trim();
  const v=await deviceVehicle(token);
  if(!v)return res.status(401).json({error:'DEVICE_NOT_ASSIGNED'});
  res.json({vehicleId:v.id,registration:v.registration,name:v.name});
});
app.post('/api/gps',async(req,res)=>{
  const token=String(req.headers['x-device-token']||'').trim();
  const v=await deviceVehicle(token);
  if(!v)return res.status(401).json({error:'DEVICE_NOT_ASSIGNED'});
  const b=req.body||{};
  const lat=Number(b.latitude),lon=Number(b.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<-90||lat>90||lon<-180||lon>180)return res.status(400).json({error:'INVALID_COORDINATES'});
  const observed=new Date(Number.isFinite(Number(b.observedAt))?Number(b.observedAt):Date.now());
  const accuracy=Number.isFinite(Number(b.accuracy))?Number(b.accuracy):null;
  const altitude=Number.isFinite(Number(b.altitude))?Number(b.altitude):null;
  const speed=Number.isFinite(Number(b.speed))?Number(b.speed):null;
  const heading=Number.isFinite(Number(b.heading))?Number(b.heading):null;
  await q('INSERT INTO gps_current(vehicle_id,latitude,longitude,accuracy,altitude,speed,heading,observed_at,received_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT(vehicle_id) DO UPDATE SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,accuracy=EXCLUDED.accuracy,altitude=EXCLUDED.altitude,speed=EXCLUDED.speed,heading=EXCLUDED.heading,observed_at=EXCLUDED.observed_at,received_at=NOW()',[v.id,lat,lon,accuracy,altitude,speed,heading,observed]);
  await q('INSERT INTO gps_history(vehicle_id,latitude,longitude,accuracy,altitude,speed,heading,observed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[v.id,lat,lon,accuracy,altitude,speed,heading,observed]);
  await q('UPDATE phones p SET last_seen_at=NOW(),updated_at=NOW() FROM assignments a WHERE a.phone_id=p.id AND a.vehicle_id=$1 AND a.active=true',[v.id]);
  res.json({ok:true,vehicleId:v.id,registration:v.registration,observedAt:observed.toISOString()});
});
app.get('/api/gps/mine',auth,async(req,res)=>{
  const r=await q('SELECT v.id,v.registration,v.name,g.latitude,g.longitude,g.accuracy,g.altitude,g.speed,g.heading,g.observed_at,g.received_at FROM assignments a JOIN vehicles v ON v.id=a.vehicle_id AND v.active=true LEFT JOIN gps_current g ON g.vehicle_id=v.id WHERE a.user_id=$1 AND a.active=true ORDER BY a.updated_at DESC LIMIT 1',[req.user.id]);
  res.json({vehicle:r.rows[0]||null});
});
app.get('/api/gps/vehicles',auth,async(_req,res)=>{
  const r=await q('SELECT v.id,v.registration,v.name,g.latitude,g.longitude,g.accuracy,g.altitude,g.speed,g.heading,g.observed_at,g.received_at FROM vehicles v LEFT JOIN gps_current g ON g.vehicle_id=v.id WHERE v.active=true ORDER BY v.registration');
  res.json({vehicles:r.rows});
});
app.get('/api/gps/:vehicleId/history',auth,async(req,res)=>{
  const r=await q("SELECT latitude,longitude,accuracy,altitude,speed,heading,observed_at,received_at FROM gps_history WHERE vehicle_id=$1 AND observed_at>=NOW()-INTERVAL '7 days' ORDER BY observed_at DESC LIMIT 500",[req.params.vehicleId]);
  res.json({history:r.rows});
});

app.get('/api/schedules/:weekId',auth,async(req,res)=>{
  const r=await q('SELECT week_id,payload,revision,updated_at,updated_by FROM schedules WHERE week_id=$1',[req.params.weekId]);
  res.json({schedule:r.rows[0]||null});
});
app.put('/api/schedules/:weekId',auth,async(req,res)=>{
  if(req.user.role!=='admin')return res.status(403).json({error:'ADMIN_REQUIRED'});
  const r=await q('INSERT INTO schedules(week_id,payload,revision,updated_by) VALUES($1,$2,1,$3) ON CONFLICT(week_id) DO UPDATE SET payload=EXCLUDED.payload,revision=schedules.revision+1,updated_at=NOW(),updated_by=EXCLUDED.updated_by RETURNING *',[req.params.weekId,JSON.stringify(req.body?.payload||{}),req.user.id]);
  res.json({schedule:r.rows[0]});
});

app.get('/api/store/:collection',auth,async(req,res)=>{
  try{
    assertCollectionName(req.params.collection);
    let sql='SELECT doc_id,payload,revision,updated_at,updated_by FROM documents WHERE collection_name=$1';
    const params=[req.params.collection];
    let i=2;
    if(req.query.whereField){
      sql+=' AND payload->>$'+i+'=$'+(i+1);
      params.push(String(req.query.whereField),String(req.query.whereValue??''));
      i+=2;
    }
    if(req.query.orderField){
      sql+=' ORDER BY payload->>$'+i+' '+(String(req.query.orderDirection||'desc').toLowerCase()==='asc'?'ASC':'DESC');
      params.push(String(req.query.orderField));
      i++;
    }else{
      sql+=' ORDER BY updated_at DESC';
    }
    const lim=Math.min(500,Math.max(1,Number(req.query.limit)||100));
    sql+=' LIMIT '+lim;
    const r=await q(sql,params);
    const docs=r.rows.filter(x=>canStoreRead(req.params.collection,req.user,x.payload||{})).map(x=>({id:x.doc_id,...x.payload,_revision:x.revision,_updatedAt:x.updated_at,_updatedBy:x.updated_by}));
    res.json({docs});
  }catch(e){res.status(400).json({error:e.message});}
});
app.get('/api/store/:collection/:id',auth,async(req,res)=>{
  try{
    assertCollectionName(req.params.collection);
    const r=await q('SELECT doc_id,payload,revision,updated_at,updated_by FROM documents WHERE collection_name=$1 AND doc_id=$2',[req.params.collection,req.params.id]);
    if(!r.rows[0])return res.json({exists:false});
    if(!canStoreRead(req.params.collection,req.user,r.rows[0].payload||{}))return res.status(403).json({error:'STORE_READ_FORBIDDEN'});
    res.json({exists:true,id:r.rows[0].doc_id,data:r.rows[0].payload,revision:r.rows[0].revision,updatedAt:r.rows[0].updated_at,updatedBy:r.rows[0].updated_by});
  }catch(e){res.status(400).json({error:e.message});}
});
app.put('/api/store/:collection/:id',auth,async(req,res)=>{
  try{
    assertCollectionName(req.params.collection);
    const merge=req.query.merge!=='false';
    const payload=req.body?.payload||{};
    const expectedRevision=Number(req.body?.expectedRevision);
    const hasExpectedRevision=Number.isInteger(expectedRevision)&&expectedRevision>0;
    const existingResult=await q('SELECT payload,revision FROM documents WHERE collection_name=$1 AND doc_id=$2',[req.params.collection,req.params.id]);
    const existing=existingResult.rows[0]?.payload||null;
    const currentRevision=existingResult.rows[0]?.revision||null;
    const effective=merge&&existing?{...existing,...payload}:payload;
    if(!canStoreWrite(req.params.collection,req.user,effective,existing))return res.status(403).json({error:'STORE_WRITE_FORBIDDEN'});
    if(hasExpectedRevision && currentRevision!==expectedRevision)return res.status(409).json({error:'REVISION_CONFLICT',revision:currentRevision});
    let r;
    if(hasExpectedRevision && existing){
      const sql=merge
        ? 'UPDATE documents SET payload=documents.payload || $3::jsonb,revision=revision+1,updated_at=NOW(),updated_by=$4 WHERE collection_name=$1 AND doc_id=$2 AND revision=$5 RETURNING *'
        : 'UPDATE documents SET payload=$3::jsonb,revision=revision+1,updated_at=NOW(),updated_by=$4 WHERE collection_name=$1 AND doc_id=$2 AND revision=$5 RETURNING *';
      const updated=await q(sql,[req.params.collection,req.params.id,JSON.stringify(payload),req.user.id,expectedRevision]);
      if(!updated.rows[0])return res.status(409).json({error:'REVISION_CONFLICT'});
      r=updated;
    }else{
      const sql=merge
        ? 'INSERT INTO documents(collection_name,doc_id,payload,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(collection_name,doc_id) DO UPDATE SET payload=documents.payload || EXCLUDED.payload,revision=documents.revision+1,updated_at=NOW(),updated_by=EXCLUDED.updated_by RETURNING *'
        : 'INSERT INTO documents(collection_name,doc_id,payload,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT(collection_name,doc_id) DO UPDATE SET payload=EXCLUDED.payload,revision=documents.revision+1,updated_at=NOW(),updated_by=EXCLUDED.updated_by RETURNING *';
      r=await q(sql,[req.params.collection,req.params.id,payload,req.user.id]);
    }
    res.json({ok:true,id:r.rows[0].doc_id,data:r.rows[0].payload,revision:r.rows[0].revision,updatedAt:r.rows[0].updated_at});
  }catch(e){res.status(400).json({error:e.message});}
});
app.post('/api/store/:collection',auth,async(req,res)=>{
  try{
    assertCollectionName(req.params.collection);
    const docId=crypto.randomUUID();
    const payload=req.body?.payload||{};
    if(!canStoreWrite(req.params.collection,req.user,payload,null))return res.status(403).json({error:'STORE_WRITE_FORBIDDEN'});
    const r=await q('INSERT INTO documents(collection_name,doc_id,payload,updated_by) VALUES($1,$2,$3,$4) RETURNING *',[req.params.collection,docId,payload,req.user.id]);
    res.status(201).json({ok:true,id:docId,data:r.rows[0].payload,revision:1,updatedAt:r.rows[0].updated_at});
  }catch(e){res.status(400).json({error:e.message});}
});
app.delete('/api/store/:collection/:id',auth,async(req,res)=>{
  const existing=await q('SELECT payload FROM documents WHERE collection_name=$1 AND doc_id=$2',[req.params.collection,req.params.id]);
  if(existing.rows[0]&&!canStoreWrite(req.params.collection,req.user,existing.rows[0].payload||{},existing.rows[0].payload||{}))return res.status(403).json({error:'STORE_WRITE_FORBIDDEN'});
  await q('DELETE FROM documents WHERE collection_name=$1 AND doc_id=$2',[req.params.collection,req.params.id]);
  res.json({ok:true});
});

app.use((err,_req,res,_next)=>{
  console.error('API error',err);
  if(res.headersSent)return;
  res.status(500).json({error:'INTERNAL_SERVER_ERROR'});
});

async function cleanupGpsHistory(){
  try{const result=await q("DELETE FROM gps_history WHERE observed_at < NOW()-INTERVAL '7 days'");console.log('GPS history cleanup',result.rowCount);}
  catch(error){console.error('GPS history cleanup failed',error);}
}
setInterval(cleanupGpsHistory,6*60*60*1000);

async function bootstrap(){
  if(!process.env.DATABASE_URL)console.warn('DATABASE_URL is not set.');
  if(process.env.DATABASE_URL){
    const schema=await readFile(new URL('./schema.sql',import.meta.url),'utf8');
    for(const statement of schema.split(';').map(x=>x.trim()).filter(Boolean))await q(statement);
    await cleanupGpsHistory();
  }
  app.listen(PORT,()=>console.log('Grafik Pracy central API listening on '+PORT));
}
bootstrap().catch(error=>{console.error('API bootstrap failed',error);process.exit(1);});
