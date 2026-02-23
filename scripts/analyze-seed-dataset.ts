/**
 * One-off analysis of seed-schedule-generation.ts dataset.
 * Computes capacity math and constraint tensions.
 */

// Replicate shift slot definitions from seed script
interface ShiftSlotDef {
  dayOfWeek: number;
  station: string;
  startTime: string;
  endTime: string;
  minStaff: number;
  preferredStaff: number;
  priority: string;
}

function parseHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return eh - sh + (em - sm) / 60;
}

function buildShiftSlots(): ShiftSlotDef[] {
  const slots: ShiftSlotDef[] = [];
  const monThu = [1, 2, 3, 4];
  const monFri = [1, 2, 3, 4, 5];

  for (const d of monThu) {
    slots.push({ dayOfWeek: d, station: "Grill", startTime: "07:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Grill", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 2, priority: "high" });
  }
  slots.push({ dayOfWeek: 5, station: "Grill", startTime: "07:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 5, station: "Grill", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 2, priority: "critical" });
  slots.push({ dayOfWeek: 5, station: "Grill", startTime: "17:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Grill", startTime: "08:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Grill", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 2, priority: "critical" });
  slots.push({ dayOfWeek: 0, station: "Grill", startTime: "09:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 0, station: "Grill", startTime: "15:00", endTime: "21:00", minStaff: 1, preferredStaff: 1, priority: "high" });

  for (const d of monThu) {
    slots.push({ dayOfWeek: d, station: "Saute", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Saute", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  }
  slots.push({ dayOfWeek: 5, station: "Saute", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 5, station: "Saute", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 2, priority: "critical" });
  slots.push({ dayOfWeek: 6, station: "Saute", startTime: "08:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Saute", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 2, priority: "critical" });
  slots.push({ dayOfWeek: 0, station: "Saute", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 0, station: "Saute", startTime: "14:00", endTime: "21:00", minStaff: 1, preferredStaff: 1, priority: "high" });

  for (const d of monFri) {
    slots.push({ dayOfWeek: d, station: "Prep", startTime: "07:00", endTime: "13:00", minStaff: 1, preferredStaff: 1, priority: "high" });
    slots.push({ dayOfWeek: d, station: "Prep", startTime: "09:00", endTime: "17:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  }
  slots.push({ dayOfWeek: 5, station: "Prep", startTime: "13:00", endTime: "19:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 6, station: "Prep", startTime: "08:00", endTime: "14:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Prep", startTime: "11:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 0, station: "Prep", startTime: "09:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

  for (const d of monThu) {
    slots.push({ dayOfWeek: d, station: "Assembly", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Assembly", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  }
  slots.push({ dayOfWeek: 5, station: "Assembly", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 5, station: "Assembly", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 2, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Assembly", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Assembly", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 0, station: "Assembly", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 0, station: "Assembly", startTime: "14:00", endTime: "21:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

  for (const d of monThu) {
    slots.push({ dayOfWeek: d, station: "Expo", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Expo", startTime: "16:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  }
  slots.push({ dayOfWeek: 5, station: "Expo", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 5, station: "Expo", startTime: "16:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  slots.push({ dayOfWeek: 6, station: "Expo", startTime: "10:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "high" });
  slots.push({ dayOfWeek: 6, station: "Expo", startTime: "16:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "critical" });
  slots.push({ dayOfWeek: 0, station: "Expo", startTime: "10:00", endTime: "18:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

  for (const d of monFri) {
    slots.push({ dayOfWeek: d, station: "Dish", startTime: "07:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
    slots.push({ dayOfWeek: d, station: "Dish", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  }
  slots.push({ dayOfWeek: 6, station: "Dish", startTime: "08:00", endTime: "16:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 6, station: "Dish", startTime: "15:00", endTime: "23:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 0, station: "Dish", startTime: "09:00", endTime: "15:00", minStaff: 1, preferredStaff: 1, priority: "normal" });
  slots.push({ dayOfWeek: 0, station: "Dish", startTime: "14:00", endTime: "21:00", minStaff: 1, preferredStaff: 1, priority: "normal" });

  return slots;
}

// Staff definitions (active only)
const ACTIVE_STAFF = [
  { name: "Marcus Rivera", skills: ["Grill", "Saute", "Prep", "Assembly", "Expo"], max: 45, min: 30, preferred: ["Grill", "Expo"], availDays: 7 },
  { name: "Sophie Chen", skills: ["Saute", "Grill", "Prep", "Assembly"], max: 40, min: 25, preferred: ["Saute"], availDays: 7 },
  { name: "David Okafor", skills: ["Grill", "Saute", "Expo", "Assembly"], max: 40, min: 20, preferred: ["Grill"], availDays: 7 },
  { name: "Emily Nguyen", skills: ["Grill", "Saute"], max: 40, min: 20, preferred: ["Grill"], availDays: 7 },
  { name: "Jake Thompson", skills: ["Grill", "Assembly", "Expo"], max: 35, min: 15, preferred: ["Assembly"], availDays: 5 },
  { name: "Maria Santos", skills: ["Saute", "Prep"], max: 40, min: 20, preferred: ["Saute"], availDays: 7 },
  { name: "Tyler Kim", skills: ["Grill", "Saute"], max: 30, min: 10, preferred: ["Grill", "Saute"], availDays: 4 },
  { name: "Priya Patel", skills: ["Saute", "Assembly", "Expo"], max: 40, min: 20, preferred: ["Assembly"], availDays: 5 },
  { name: "Carlos Mendez", skills: ["Grill", "Prep"], max: 25, min: 8, preferred: ["Prep"], availDays: 3 },
  { name: "Ashley Brooks", skills: ["Assembly", "Expo"], max: 40, min: 20, preferred: ["Expo"], availDays: 5 },
  { name: "Ryan O'Brien", skills: ["Grill", "Saute", "Assembly"], max: 40, min: 30, preferred: ["Grill"], availDays: 7 },
  { name: "Lisa Chang", skills: ["Prep", "Assembly"], max: 35, min: 15, preferred: ["Prep"], availDays: 6 },
  { name: "Omar Hassan", skills: ["Prep", "Dish"], max: 30, min: 10, preferred: ["Prep"], availDays: 4 },
  { name: "Hannah Miller", skills: ["Prep", "Saute"], max: 35, min: 10, preferred: ["Prep"], availDays: 5 },
  { name: "Wei Zhang", skills: ["Prep", "Assembly"], max: 35, min: 20, preferred: ["Prep"], availDays: 7 },
  { name: "Jordan Taylor", skills: ["Prep", "Grill"], max: 30, min: 8, preferred: ["Prep"], availDays: 5 },
  { name: "Natalie Wood", skills: ["Prep", "Expo"], max: 30, min: 15, preferred: ["Prep"], availDays: 5 },
  { name: "Deshawn Williams", skills: ["Dish", "Prep"], max: 35, min: 15, preferred: ["Dish"], availDays: 7 },
  { name: "Kenji Tanaka", skills: ["Dish", "Prep"], max: 35, min: 10, preferred: ["Dish"], availDays: 4 },
  { name: "Aaliyah Johnson", skills: ["Dish", "Prep"], max: 25, min: 8, preferred: ["Dish"], availDays: 4 },
  { name: "Miguel Flores", skills: ["Dish", "Assembly"], max: 35, min: 15, preferred: ["Dish"], availDays: 5 },
  { name: "Sam Russo", skills: ["Grill", "Saute", "Prep", "Assembly", "Dish"], max: 35, min: 15, preferred: [], availDays: 5 },
  { name: "Alex Petrov", skills: ["Grill", "Prep", "Assembly", "Expo", "Dish"], max: 35, min: 8, preferred: [], availDays: 6 },
  { name: "Nina Kowalski", skills: ["Grill", "Saute", "Assembly", "Expo"], max: 40, min: 20, preferred: ["Grill", "Saute"], availDays: 7 },
  { name: "Dante Jackson", skills: ["Saute", "Prep", "Assembly", "Dish"], max: 40, min: 15, preferred: ["Saute", "Prep"], availDays: 7 },
  { name: "Chloe Martinez", skills: ["Grill", "Expo", "Assembly"], max: 35, min: 15, preferred: ["Expo"], availDays: 7 },
];

// Availability days - need to match seed exactly (some have restricted days)
const AVAIL_DAYS: Record<string, number> = {
  "Marcus Rivera": 7, "Sophie Chen": 7, "David Okafor": 7, "Emily Nguyen": 7,
  "Maria Santos": 7, "Ryan O'Brien": 7, "Lisa Chang": 6, "Wei Zhang": 7,
  "Deshawn Williams": 7, "Miguel Flores": 5,
  "Jake Thompson": 5, "Tyler Kim": 4, "Priya Patel": 5, "Carlos Mendez": 3,
  "Ashley Brooks": 5, "Omar Hassan": 4, "Hannah Miller": 5, "Natalie Wood": 5,
  "Kenji Tanaka": 4, "Aaliyah Johnson": 4, "Jordan Taylor": 5, "Alex Petrov": 6,
  "Sam Russo": 5, "Nina Kowalski": 7, "Dante Jackson": 7, "Chloe Martinez": 7,
};

// Station coverage: count staff who can work each station
const STATIONS = ["Grill", "Saute", "Prep", "Assembly", "Expo", "Dish"];

function main() {
  const slots = buildShiftSlots();

  // 1. Total shift-slots and person-hours
  let totalSlotHours = 0;
  const byStation: Record<string, { slots: number; hours: number }> = {};
  for (const s of slots) {
    const hrs = parseHours(s.startTime, s.endTime);
    totalSlotHours += hrs;
    if (!byStation[s.station]) byStation[s.station] = { slots: 0, hours: 0 };
    byStation[s.station].slots++;
    byStation[s.station].hours += hrs;
  }

  // 2–4. Staff aggregates
  let totalMin = 0;
  let totalMax = 0;
  for (const s of ACTIVE_STAFF) {
    totalMin += s.min;
    totalMax += s.max;
  }

  // 5. Staff list (use ACTIVE_STAFF)
  // 6. Staff per station
  const staffPerStation: Record<string, string[]> = {};
  for (const station of STATIONS) {
    staffPerStation[station] = ACTIVE_STAFF.filter((s) => s.skills.includes(station)).map((s) => s.name);
  }

  // Daily slots
  const slotsByDay: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const s of slots) slotsByDay[s.dayOfWeek]++;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // 7. Bottlenecks
  const sortedByStaff = [...Object.entries(staffPerStation)].sort((a, b) => a[1].length - b[1].length);
  const restrictedAvail = ACTIVE_STAFF.filter((s) => AVAIL_DAYS[s.name] <= 4);
  const highMinRelative = ACTIVE_STAFF.filter((s) => s.min >= 25);

  // Output
  console.log("\n" + "═".repeat(70));
  console.log("  SCHEDULING DATASET ANALYSIS — The Copper Ladle");
  console.log("═".repeat(70));

  console.log("\n## 1. SHIFT SLOTS & PERSON-HOURS");
  console.log("─".repeat(50));
  console.log(`  Total shift-slots per week:  ${slots.length}`);
  console.log(`  Total person-hours needed:   ${Math.round(totalSlotHours)}`);
  console.log("\n  By station:");
  for (const [st, data] of Object.entries(byStation)) {
    console.log(`    ${st.padEnd(10)} ${data.slots} slots, ${Math.round(data.hours)} hours`);
  }

  console.log("\n## 2–4. STAFF HOURS AGGREGATES");
  console.log("─".repeat(50));
  console.log(`  Active staff count:          ${ACTIVE_STAFF.length}`);
  console.log(`  Total staff min-hours:       ${totalMin}`);
  console.log(`  Total staff max-hours:       ${totalMax}`);
  console.log(`  Slots per active staff:      ${(slots.length / ACTIVE_STAFF.length).toFixed(1)}`);

  console.log("\n## 4b. SLOTS PER DAY (staff vs daily demand)");
  console.log("─".repeat(50));
  for (let d = 0; d <= 6; d++) {
    console.log(`  ${dayNames[d]}: ${slotsByDay[d]} slots | ${ACTIVE_STAFF.length} staff available`);
  }

  console.log("\n## 5. STAFF DETAIL (skills, hours, availability, preferences)");
  console.log("─".repeat(50));
  for (const s of ACTIVE_STAFF) {
    const avail = AVAIL_DAYS[s.name] ?? 7;
    console.log(`  ${s.name}`);
    console.log(`    Skills: ${s.skills.length} stations (${s.skills.join(", ")})`);
    console.log(`    Min: ${s.min}h | Max: ${s.max}h | Avail days: ${avail}`);
    console.log(`    Preferred: ${s.preferred.length ? s.preferred.join(", ") : "none"}`);
  }

  console.log("\n## 6. STAFF COUNT PER STATION");
  console.log("─".repeat(50));
  for (const [station, names] of Object.entries(staffPerStation)) {
    console.log(`  ${station.padEnd(10)} ${names.length} staff: ${names.join(", ")}`);
  }

  console.log("\n## 7. BOTTLENECKS & CONSTRAINT TENSIONS");
  console.log("─".repeat(50));
  console.log("\n  Stations by qualified staff count (fewest first):");
  for (const [st, names] of sortedByStaff) {
    const flag = names.length <= 9 ? " ⚠ BOTTLENECK" : "";
    console.log(`    ${st}: ${names.length} staff${flag}`);
  }
  console.log("\n  Staff with very restricted availability (≤4 days):");
  for (const s of restrictedAvail) {
    console.log(`    ${s.name}: ${AVAIL_DAYS[s.name]} days — ${s.skills.join(", ")}`);
  }
  console.log("\n  Staff with high min-hours (≥25h) — must be scheduled heavily:");
  for (const s of highMinRelative) {
    console.log(`    ${s.name}: min ${s.min}h, max ${s.max}h, ${AVAIL_DAYS[s.name]} avail days`);
  }
  console.log("\n  Skill gaps:");
  console.log(`    Expo: 9 qualified (lowest); Dish: 8 qualified`);
  console.log(`    Ryan O'Brien: min 30h forces ~4+ shifts/week (EDGE CASE in seed)`);

  console.log("\n" + "═".repeat(70));
}

main();
