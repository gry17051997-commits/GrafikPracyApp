import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import pg from 'pg';

const {Pool}=pg;
const app=express();
app.use(cors());
app.use(express.json({limit:'2mb'}));

const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?{rejectUnauthorized:false}:false});
const PORT=Number(process.env.PORT||8787);
const SESSION_DAYS=30;
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const randomToken=()=>crypto.randomBytes(32).toString('hex');
const id=()=>crypto.randomUUID();

async function q(text,params=[]){return pool.query(text,params);}
function publicUser(r){return {uid:r.id,email:r.email,displayName:r.display_name,personKey:r.person_key||'',role:r.role,disabled:!!r.disabled};}
async function auth(req,res,next){
  const raw=String(req.headers.authorization||'');
  const token=raw.startsWith('Bearer ')?raw.slice(7).trim():'';
  if(!token)return res.status(401).json({error:'AUTH_REQUIRED'});
  const r=await q('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.disabled=false',[hash(token)]);
  if(!r.rows[0])return res.status(401).json({error:'AUTH_INVALID'});
  req.user=r.rows[0]; next();
}
function admin(req,res,next){if(req.user.role!=='admin')return res.status(403).json({error:'ADMIN_REQUIRED'});next();}

app.get('/api/health',async(_req,res)=>{try{await q('SELECT 1');res.json({ok:true,backend:'central-api',firestore:false});}catch(e){res.status(503).json({ok:false,error:e.message});}});
app.post('/api/auth/login',async(req,res)=>{const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');const r=await q('SELECT * FROM users WHERE lower(email)=lower($1) LIMIT 1',[email]);const u=r.rows[0];if(!u||u.disabled||hash(password)!==u.password_hash)return res.status(401).json({error:'INVALID_CREDENTIALS'});const token=randomToken();await q('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+($3||\' days\')::interval)',[hash(token),u.id,SESSION_DAYS]);res.json({token,user:publicUser(u)});});
app.post('/api/auth/logout',auth,async(req,res)=>{const raw=String(req.headers.authorization||'').slice(7);await q('DELETE FROM sessions WHERE token_hash=$1',[hash(raw)]);res.json({ok:true});});
app.get('/api/me',auth,(req,res)=>res.json({user:publicUser(req.user)}));

app.get('/api/users',auth,admin,async(_req,res)=>{const r=await q('SELECT * FROM users ORDER BY lower(display_name),lower(email)');res.json({users:r.rows.map(publicUser)});});
app.post('/api/users',auth,admin,async(req,res)=>{const b=req.body||{},email=String(b.email||'').trim().toLowerCase(),password=String(b.password||''),displayName=String(b.displayName||'').trim(),personKey=String(b.personKey||''),role=String(b.role||'employee');if(!/^\\S+@\\S+\\.\\S+$/.test(email)||password.length<6||displayName.length<2||!['employee','locator','admin'].includes(role)||!['','P','M','L'].includes(personKey)||(role==='employee'&&!['P','M','L'].includes(personKey))||(role!=='employee'&&personKey))return res.status(400).json({error:'INVALID_USER'});const exists=await q('SELECT 1 FROM users WHERE lower(email)=lower($1) OR ($2<>\'\' AND person_key=$2) LIMIT 1',[email,personKey]);if(exists.rows[0])return res.status(409).json({error:'USER_ALREADY_EXISTS'});const uid=id();const r=await q('INSERT INTO users(id,email,password_hash,display_name,person_key,role) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[uid,email,hash(password),displayName,personKey,role]);res.status(201).json({user:publicUser(r.rows[0])});});
app.patch('/api/users/:uid',auth,admin,async(req,res)=>{const uid=req.params.uid,b=req.body||{};if(uid===req.user.id&&b.role&&b.role!=='admin')return res.status(400).json({error:'CANNOT_DEMOTE_SELF'});const r=await q('UPDATE users SET display_name=COALESCE($2,display_name),email=COALESCE($3,email),person_key=COALESCE($4,person_key),role=COALESCE($5,role),disabled=COALESCE($6,disabled),updated_at=NOW() WHERE id=$1 RETURNING *',[uid,b.displayName,b.email?String(b.email).trim().toLowerCase():null,b.personKey,b.role,b.disabled]);if(!r.rows[0])return res.status(404).json({error:'USER_NOT_FOUND'});res.json({user:publicUser(r.rows[0])});});
app.delete('/api/users/:uid',auth,admin,async(req,res)=>{if(req.params.uid===req.user.id)return res.status(400).json({error:'CANNOT_DELETE_SELF'});await q('UPDATE users SET disabled=true,updated_at=NOW() WHERE id=$1',[req.params.uid]);res.json({ok:true});});

app.get('/api/vehicles',auth,async(_req,res)=>{const r=await q('SELECT * FROM vehicles ORDER BY registration');res.json({vehicles:r.rows});});
app.post('/api/vehicles',auth,admin,async(req,res)=>{const registration=String(req.body?.registration||'').trim().toUpperCase(),name=String(req.body?.name||'').trim();if(!registration)return res.status(400).json({error:'REGISTRATION_REQUIRED'});const r=await q('INSERT INTO vehicles(id,registration,name) VALUES($1,$2,$3) RETURNING *',[id(),registration,name]).catch(e=>null);if(!r)return res.status(409).json({error:'VEHICLE_ALREADY_EXISTS'});res.status(201).json({vehicle:r.rows[0]});});
app.patch('/api/vehicles/:id',auth,admin,async(req,res)=>{const r=await q('UPDATE vehicles SET registration=COALESCE($2,registration),name=COALESCE($3,name),active=COALESCE($4,active),updated_at=NOW() WHERE id=$1 RETURNING *',[req.params.id,req.body?.registration?.trim()?.toUpperCase(),req.body?.name,req.body?.active]);if(!r.rows[0])return res.status(404).json({error:'VEHICLE_NOT_FOUND'});res.json({vehicle:r.rows[0]});});
app.delete('/api/vehicles/:id',auth,admin,async(req,res)=>{await q('DELETE FROM vehicles WHERE id=$1',[req.params.id]);res.json({ok:true});});

app.get('/api/phones',auth,admin,async(_req,res)=>{const r=await q('SELECT id,name,active,last_seen_at,created_at,updated_at FROM phones ORDER BY name');res.json({phones:r.rows});});
app.post('/api/phones',auth,admin,async(req,res)=>{const name=String(req.body?.name||'').trim();if(!name)return res.status(400).json({error:'PHONE_NAME_REQUIRED'});const token=randomToken();const r=await q('INSERT INTO phones(id,name,device_token_hash) VALUES($1,$2,$3) RETURNING id,name,active,created_at',[id(),name,hash(token)]);res.status(201).json({phone:r.rows[0],deviceToken:token});});
app.patch('/api/phones/:id',auth,admin,async(req,res)=>{const r=await q('UPDATE phones SET name=COALESCE($2,name),active=COALESCE($3,active),updated_at=NOW() WHERE id=$1 RETURNING id,name,active,last_seen_at,created_at,updated_at',[req.params.id,req.body?.name,req.body?.active]);if(!r.rows[0])return res.status(404).json({error:'PHONE_NOT_FOUND'});res.json({phone:r.rows[0]});});

app.get('/api/assignments',auth,async(_req,res)=>{const r=await q('SELECT a.*,v.registration,v.name vehicle_name,p.name phone_name,u.display_name user_name FROM assignments a JOIN vehicles v ON v.id=a.vehicle_id JOIN phones p ON p.id=a.phone_id LEFT JOIN users u ON u.id=a.user_id WHERE a.active=true ORDER BY v.registration');res.json({assignments:r.rows});});
app.post('/api/assignments',auth,admin,async(req,res)=>{const {vehicleId,phoneId,userId=null}=req.body||{};if(!vehicleId||!phoneId)return res.status(400).json({error:'ASSIGNMENT_REQUIRED'});await q('UPDATE assignments SET active=false,updated_at=NOW() WHERE vehicle_id=$1 OR phone_id=$2',[vehicleId,phoneId]);const r=await q('INSERT INTO assignments(id,vehicle_id,phone_id,user_id) VALUES($1,$2,$3,$4) RETURNING *',[id(),vehicleId,phoneId,userId]);res.status(201).json({assignment:r.rows[0]});});

async function deviceVehicle(token){const r=await q('SELECT v.* FROM phones p JOIN assignments a ON a.phone_id=p.id AND a.active=true JOIN vehicles v ON v.id=a.vehicle_id WHERE p.device_token_hash=$1 AND p.active=true AND v.active=true',[hash(token)]);return r.rows[0];}
app.post('/api/gps',async(req,res)=>{const raw=String(req.headers['x-device-token']||'').trim(),v=await deviceVehicle(raw);if(!v)return res.status(401).json({error:'DEVICE_NOT_ASSIGNED'});const b=req.body||{},lat=Number(b.latitude),lon=Number(b.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lon))return res.status(400).json({error:'INVALID_COORDINATES'});const observed=new Date(Number.isFinite(Number(b.observedAt))?Number(b.observedAt):Date.now());await q('INSERT INTO gps_current(vehicle_id,latitude,longitude,accuracy,altitude,speed,heading,observed_at,received_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW()) ON CONFLICT(vehicle_id) DO UPDATE SET latitude=EXCLUDED.latitude,longitude=EXCLUDED.longitude,accuracy=EXCLUDED.accuracy,altitude=EXCLUDED.altitude,speed=EXCLUDED.speed,heading=EXCLUDED.heading,observed_at=EXCLUDED.observed_at,received_at=NOW()',[v.id,lat,lon,Number(b.accuracy)||null,Number(b.altitude)||null,Number.isFinite(Number(b.speed))?Number(b.speed):null,Number.isFinite(Number(b.heading))?Number(b.heading):null,observed]);await q('INSERT INTO gps_history(vehicle_id,latitude,longitude,accuracy,altitude,speed,heading,observed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[v.id,lat,lon,Number(b.accuracy)||null,Number(b.altitude)||null,Number.isFinite(Number(b.speed))?Number(b.speed):null,Number.isFinite(Number(b.heading))?Number(b.heading):null,observed]);await q('UPDATE phones p SET last_seen_at=NOW(),updated_at=NOW() FROM assignments a WHERE a.phone_id=p.id AND a.vehicle_id=$1 AND a.active=true',[v.id]);res.json({ok:true,vehicleId:v.id,registration:v.registration,observedAt:observed.toISOString()});});
app.get('/api/gps/vehicles',auth,async(_req,res)=>{const r=await q('SELECT v.id,v.registration,v.name,g.latitude,g.longitude,g.accuracy,g.altitude,g.speed,g.heading,g.observed_at,g.received_at FROM vehicles v LEFT JOIN gps_current g ON g.vehicle_id=v.id WHERE v.active=true ORDER BY v.registration');res.json({vehicles:r.rows});});
app.get('/api/gps/:vehicleId/history',auth,async(req,res)=>{const r=await q('SELECT latitude,longitude,accuracy,altitude,speed,heading,observed_at,received_at FROM gps_history WHERE vehicle_id=$1 AND observed_at>=NOW()-INTERVAL \'7 days\' ORDER BY observed_at DESC LIMIT 500',[req.params.vehicleId]);res.json({history:r.rows});});

app.get('/api/schedules/:weekId',auth,async(req,res)=>{const r=await q('SELECT week_id,payload,revision,updated_at,updated_by FROM schedules WHERE week_id=$1',[req.params.weekId]);res.json({schedule:r.rows[0]||null});});
app.put('/api/schedules/:weekId',auth,async(req,res)=>{if(req.user.role!=='admin')return res.status(403).json({error:'ADMIN_REQUIRED'});const r=await q('INSERT INTO schedules(week_id,payload,revision,updated_by) VALUES($1,$2,1,$3) ON CONFLICT(week_id) DO UPDATE SET payload=EXCLUDED.payload,revision=schedules.revision+1,updated_at=NOW(),updated_by=EXCLUDED.updated_by RETURNING *',[req.params.weekId,JSON.stringify(req.body?.payload||{}),req.user.id]);res.json({schedule:r.rows[0]});});

app.listen(PORT,()=>console.log('Grafik Pracy central API listening on '+PORT));
