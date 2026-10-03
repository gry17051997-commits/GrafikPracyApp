import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');

test('Supabase migration scaffold keeps privileged credentials server-side',()=>{
  const client=read('supabaseConfig.js');
  const admin=read('../supabase/functions/admin-users/index.ts');
  assert.doesNotMatch(client,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(admin,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(admin,/auth\.admin\.createUser/);
  assert.match(admin,/auth\.admin\.deleteUser/);
});

test('Supabase schema contains all Firebase-backed domains',()=>{
  const sql=read('../supabase/migrations/001_initial_schema.sql');
  for(const table of ['users','schedules','settings','proposals','chat_messages','whatsapp_reports','location_config','vehicle_tracking','vehicle_locations','audit']){
    assert.match(sql,new RegExp('create table if not exists public\\.'+table+'\\b'));
    assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security'));
  }
  assert.match(sql,/interval '7 days'/);
});

test('Supabase client adapter is isolated until the backend is configured',()=>{
  const adapter=read('supabaseDataService.js');
  assert.match(adapter,/SUPABASE_ENABLED/);
  assert.match(adapter,/supabase\.auth/);
  assert.match(adapter,/supabaseSubscribe/);
});
