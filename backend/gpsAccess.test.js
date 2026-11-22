import test from 'node:test';
import assert from 'node:assert/strict';
import {canReadVehicleTelemetry} from './gpsAccess.js';

test('admin can read fleet telemetry',()=>{
  assert.equal(canReadVehicleTelemetry({role:'admin',userId:'admin-1'}),true);
});

test('employee retains current fleet dashboard access',()=>{
  assert.equal(canReadVehicleTelemetry({role:'employee',userId:'employee-1'}),true);
});

test('locator can read only their assigned vehicle',()=>{
  assert.equal(canReadVehicleTelemetry({role:'locator',userId:'driver-1',assignedUserId:'driver-1'}),true);
  assert.equal(canReadVehicleTelemetry({role:'locator',userId:'driver-1',assignedUserId:'driver-2'}),false);
  assert.equal(canReadVehicleTelemetry({role:'locator',userId:'driver-1',assignedUserId:null}),false);
});

test('unknown and guest roles are denied',()=>{
  assert.equal(canReadVehicleTelemetry({role:'guest',userId:'guest-1'}),false);
  assert.equal(canReadVehicleTelemetry({role:'unknown',userId:'user-1'}),false);
});

test('stale GPS observations cannot replace the current vehicle position', async()=>{
  const fs=await import('node:fs/promises');
  const server=await fs.readFile(new URL('./server.js',import.meta.url),'utf8');
  assert.match(server,/WHERE gps_current\.observed_at < EXCLUDED\.observed_at/);
  assert.match(server,/currentUpdated:Number\(currentResult\.rowCount\)>0/);
});
