import { DAYS, RATES, SHIFT_TIMES } from "./data.js";

export function mondayOf(input = new Date()) {
  const d = new Date(input);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + diff);
  return d;
}
export function isoDate(d) { return d.toISOString().slice(0,10); }
export function createEmptyWeek(weekStart, hours=10, warehouse="PNT B") {
  return {
    weekStart, hours, warehouse,
    shifts: DAYS.map((name, dayIndex) => ({
      dayIndex,
      date: isoDate(new Date(new Date(weekStart).getTime() + dayIndex*86400000)),
      name, warehouse,
      entries: [0,1].map(shift => ({
        id: `${weekStart}-${dayIndex}-${shift}`,
        shift, person: null, warehouse, locked:false, manual:false
      }))
    }))
  };
}
export function generateWeek(weekStart, hours=10, warehouse="PNT B", seed="P") {
  const week = createEmptyWeek(weekStart, hours, warehouse);
  const a = seed === "M" ? "M" : "P";
  const b = a === "P" ? "M" : "P";

  // Mon-Sat: one shift per day for Paweł and Mateusz.
  // Sunday: Łukasz covers both shifts, matching the default 6/6/2 split.
  week.shifts.forEach((day, i) => {
    if (i === 6) {
      day.entries[0].person = "L";
      day.entries[1].person = "L";
      return;
    }
    day.entries[0].person = i % 2 === 0 ? a : b;
    day.entries[1].person = i % 2 === 0 ? b : a;
  });
  return week;
}
export function summarize(week, people) {
  const result = Object.fromEntries(people.map(p => [p.key, { ...p, shifts:0, hours:0, pay:0 }]));
  const rate = RATES[week.hours] || 0;
  week.shifts.forEach(day => day.entries.forEach(entry => {
    if (!entry.person || !result[entry.person]) return;
    result[entry.person].shifts += 1;
    result[entry.person].hours += Number(week.hours);
    result[entry.person].pay += rate;
  }));
  const list = Object.values(result);
  return {
    people:list,
    totalShifts:list.reduce((s,p)=>s+p.shifts,0),
    totalHours:list.reduce((s,p)=>s+p.hours,0),
    totalPay:list.reduce((s,p)=>s+p.pay,0)
  };
}
export function shiftLabel(hours, shift) {
  const pair = SHIFT_TIMES[hours] || SHIFT_TIMES[10];
  return `${pair[shift].start}–${pair[shift].end}`;
}
