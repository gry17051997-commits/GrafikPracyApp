import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyWeek, generateWeek, summarize, shiftLabel } from "../src/scheduleEngine.js";
import { PEOPLE } from "../src/data.js";

test("creates exactly seven days and two shifts", () => {
  const week = createEmptyWeek("2026-09-28", 10, "PNT B");
  assert.equal(week.shifts.length, 7);
  assert.equal(week.shifts.every(d => d.entries.length === 2), true);
});

test("shift times match the 10h and 12h business systems", () => {
  assert.equal(shiftLabel(10,0), "06:00–16:00");
  assert.equal(shiftLabel(10,1), "16:00–02:00");
  assert.equal(shiftLabel(12,0), "07:00–19:00");
  assert.equal(shiftLabel(12,1), "19:00–07:00");
});

test("generator assigns 6/6/2 default weekly coverage", () => {
  const week = generateWeek("2026-09-28", 10, "PNT B", "P");
  assert.equal(week.shifts.length, 7);
  assert.ok(week.shifts.every(d => d.entries.every(e => e.person)));
  assert.deepEqual(
    Object.fromEntries(PEOPLE.map(p => [
      p.key,
      week.shifts.flatMap(d => d.entries).filter(e => e.person === p.key).length
    ])),
    { P: 6, M: 6, L: 2 }
  );
  assert.equal(week.shifts[6].entries[0].person, "L");
  assert.equal(week.shifts[6].entries[1].person, "L");
});

test("summary uses business rates and hours", () => {
  const week = generateWeek("2026-09-28", 12, "DC2", "P");
  const s = summarize(week, PEOPLE);
  assert.equal(s.totalShifts, 14);
  assert.equal(s.totalHours, 168);
  assert.equal(s.totalPay, 5040);
  assert.deepEqual(
    Object.fromEntries(s.people.map(p => [p.key, p.shifts])),
    { P: 6, M: 6, L: 2 }
  );
});
