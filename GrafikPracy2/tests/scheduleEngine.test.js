import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyWeek, generateWeek, summarize, shiftLabel } from "../src/scheduleEngine.js";
import { PEOPLE } from "../src/data.js";

test("creates exactly seven days and two shifts", () => {
  const week = createEmptyWeek("2026-09-28", 10, "PNT B");
  assert.equal(week.shifts.length, 7);
  assert.equal(week.shifts.every(d => d.entries.length === 2), true);
});
test("10h and 12h shift times are internally consistent", () => {
  assert.equal(shiftLabel(10,0), "06:00–16:00");
  assert.equal(shiftLabel(10,1), "16:00–02:00");
  assert.equal(shiftLabel(12,0), "06:00–18:00");
  assert.equal(shiftLabel(12,1), "18:00–06:00");
});
test("generator assigns people and keeps Sunday for Łukasz", () => {
  const week = generateWeek("2026-09-28", 10, "PNT B", "P");
  assert.equal(week.shifts.length, 7);
  assert.ok(week.shifts.every(d => d.entries.every(e => e.person)));
  assert.equal(week.shifts[6].entries[1].person, "L");
});
test("summary uses business rates and hours", () => {
  const week = generateWeek("2026-09-28", 12, "DC2", "P");
  const s = summarize(week, PEOPLE);
  assert.equal(s.totalShifts, 14);
  assert.equal(s.totalHours, 168);
  assert.equal(s.totalPay, 5040);
});