import test from "node:test";
import assert from "node:assert/strict";
import {createDriverStatus,transitionDriverStatus,DRIVER_STATUSES} from "../src/driverStatus.js";

test("driver can move from start to loading and then en route",()=>{
  let s=createDriverStatus({employeeId:"P"});
  s=transitionDriverStatus(s,DRIVER_STATUSES.LOADING,{warehouse:"PNT B"});
  s=transitionDriverStatus(s,DRIVER_STATUSES.EN_ROUTE_LOADED,{route:"PNT B -> DC2"});
  assert.equal(s.status,"en_route_loaded");
  assert.equal(s.route,"PNT B -> DC2");
});

test("driver status rejects invalid transition from finished to loading",()=>{
  const s=createDriverStatus({employeeId:"M",status:DRIVER_STATUSES.FINISHED});
  assert.throws(()=>transitionDriverStatus(s,DRIVER_STATUSES.LOADING),/invalid driver status transition/);
});

test("finished shift can be restarted explicitly",()=>{
  const s=createDriverStatus({employeeId:"L",status:DRIVER_STATUSES.FINISHED});
  const next=transitionDriverStatus(s,DRIVER_STATUSES.STARTED,{warehouse:"UNICO"});
  assert.equal(next.status,"started");
  assert.equal(next.warehouse,"UNICO");
});
