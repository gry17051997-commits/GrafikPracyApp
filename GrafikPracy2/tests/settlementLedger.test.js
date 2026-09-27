import test from "node:test";
import assert from "node:assert/strict";
import { createLedgerEntry, ledgerSummary, transitionLedger, LEDGER_STATES } from "../src/settlementLedger.js";

test("ledger follows schedule -> approved -> worked -> settled -> paid", () => {
  let entry = createLedgerEntry({
    id: "ledger-1",
    scheduleEntryId: "schedule-1",
    employeeId: "P",
    date: "2026-09-28",
    hours: 12,
    rate: 360,
    createdBy: "admin",
    createdAt: "2026-09-27T12:00:00.000Z"
  });

  for (const state of [
    LEDGER_STATES.APPROVED,
    LEDGER_STATES.WORKED,
    LEDGER_STATES.SETTLED,
    LEDGER_STATES.PAID
  ]) {
    entry = transitionLedger(entry, state, "admin", "2026-09-27T13:00:00.000Z");
  }

  assert.equal(entry.state, LEDGER_STATES.PAID);
  assert.equal(entry.amount, 360);
});

test("ledger rejects skipping business states", () => {
  const entry = createLedgerEntry({
    id: "ledger-2",
    scheduleEntryId: "schedule-2",
    employeeId: "M",
    date: "2026-09-28",
    hours: 10,
    rate: 300
  });
  assert.throws(() => transitionLedger(entry, LEDGER_STATES.PAID), /invalid ledger transition/);
});

test("ledger summary ignores void entries", () => {
  const base = createLedgerEntry({
    id: "ledger-3",
    scheduleEntryId: "schedule-3",
    employeeId: "L",
    date: "2026-10-04",
    hours: 12,
    rate: 360
  });
  const voided = { ...base, state: LEDGER_STATES.VOID };
  assert.deepEqual(ledgerSummary([base, voided]), { shifts: 1, hours: 12, amount: 360 });
});
