export const LEDGER_STATES = Object.freeze({
  SCHEDULED: "scheduled",
  APPROVED: "approved",
  WORKED: "worked",
  SETTLED: "settled",
  PAID: "paid",
  VOID: "void"
});

const ALLOWED = {
  [LEDGER_STATES.SCHEDULED]: new Set([LEDGER_STATES.APPROVED, LEDGER_STATES.VOID]),
  [LEDGER_STATES.APPROVED]: new Set([LEDGER_STATES.WORKED, LEDGER_STATES.VOID]),
  [LEDGER_STATES.WORKED]: new Set([LEDGER_STATES.SETTLED, LEDGER_STATES.VOID]),
  [LEDGER_STATES.SETTLED]: new Set([LEDGER_STATES.PAID]),
  [LEDGER_STATES.PAID]: new Set(),
  [LEDGER_STATES.VOID]: new Set()
};

export function createLedgerEntry({ id, scheduleEntryId, employeeId, date, hours, rate, createdBy, createdAt }) {
  if (!id || !scheduleEntryId || !employeeId || !date) throw new Error("ledger entry requires identity");
  const numericHours = Number(hours);
  const numericRate = Number(rate);
  if (!Number.isFinite(numericHours) || numericHours <= 0) throw new Error("invalid hours");
  if (!Number.isFinite(numericRate) || numericRate < 0) throw new Error("invalid rate");
  const now = createdAt || new Date().toISOString();
  return {
    id,
    scheduleEntryId,
    employeeId,
    date,
    hours: numericHours,
    rate: numericRate,
    amount: numericRate,
    state: LEDGER_STATES.SCHEDULED,
    createdBy: createdBy || "system",
    createdAt: now,
    updatedAt: now
  };
}

export function transitionLedger(entry, nextState, actor = "system", at = new Date().toISOString()) {
  if (!entry || !Object.values(LEDGER_STATES).includes(nextState)) throw new Error("invalid ledger state");
  const allowed = ALLOWED[entry.state];
  if (!allowed || !allowed.has(nextState)) {
    throw new Error(`invalid ledger transition: ${entry.state} -> ${nextState}`);
  }
  return { ...entry, state: nextState, updatedAt: at, updatedBy: actor };
}

export function ledgerSummary(entries) {
  return entries
    .filter(entry => entry.state !== LEDGER_STATES.VOID)
    .reduce((sum, entry) => ({
      shifts: sum.shifts + 1,
      hours: sum.hours + Number(entry.hours || 0),
      amount: sum.amount + Number(entry.amount || 0)
    }), { shifts: 0, hours: 0, amount: 0 });
}
