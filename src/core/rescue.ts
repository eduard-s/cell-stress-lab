import { RESPONSES, responseSettings, STRESSORS, stressMix, type ResponseId, type ResponseSettings, type StressMix } from "./catalog.js";
import { randomAt } from "./geometry.js";
import { activeLesions, clearStress, FATE_LABELS, isTerminal, prepareScenario, stepCell, type Cell, type CellSample } from "./model.js";

export const RESCUE_RESPONSE_LIMIT = 3;
export const RESCUE_EXPOSURE_TICKS = 10;
export const RESCUE_TOTAL_TICKS = 36;
export const RESCUE_STABLE_TICKS = 3;
export const RESCUE_TICK_MS = 900;
type ResponseChange = { response: keyof ResponseSettings; enabled: boolean };

export const RESCUE_CASES: readonly { name: string; mix: Partial<StressMix> }[] = [
  { name: "UV and heat", mix: { uv: .73, heat: .69 } },
  { name: "Heat and oxidants", mix: { heat: .74, oxidants: .57 } },
  { name: "X-rays and UV", mix: { xray: .65, uv: .60 } },
  { name: "Oxygen and glucose shortage", mix: { oxygen: .97, glucose: .94 } },
  { name: "ER overload and low glucose", mix: { er: .75, glucose: .36 } },
  { name: "Replication stress and X-rays", mix: { replication: .65, xray: .38 } },
  { name: "Compression and oxidants", mix: { crowding: .84, oxidants: .77 } },
  { name: "Growth signaling and UV", mix: { growth: .64, uv: .54 } },
];

export type RescueCase = { name: string; mix: StressMix; seed: number; index?: number };
type RescueStatus = "exposure" | "recovery" | "saved" | "lost" | "unrecovered";
export type RescueProgress = { elapsed: number; stableTicks: number; status: RescueStatus };
export type RescueRun = { sample: CellSample; progress: RescueProgress };
export type RescuePlan = { responses: (ResponseId | "cysteineSupport")[] };
export type RescueReading = {
  id: "cycle" | "energy" | "dna" | "protein" | "er" | "pressure";
  label: string;
  reading: string | number;
  target: string;
  ready: boolean;
  direction?: "higher" | "lower";
  fraction?: number;
  limit?: number;
};
export type RescueFrame = { tick: number; cell: Cell };
export type RescueComparisonReading = RescueReading & {
  failed?: RescueReading["reading"];
  failedFraction?: number;
  impact?: "better" | "worse";
};

export function randomRescueCase(seed: number, previous?: number): RescueCase {
  const skip = previous !== undefined && Number.isInteger(previous) && previous >= 0 && previous < RESCUE_CASES.length ? previous : undefined;
  const choices = RESCUE_CASES.length - (skip === undefined ? 0 : 1);
  const roll = Math.floor(randomAt(seed, 0) * choices);
  const index = skip !== undefined && roll >= skip ? roll + 1 : roll;
  const { name, mix } = RESCUE_CASES[index];
  const levels: Partial<StressMix> = {};
  STRESSORS.forEach(({ id }, offset) => {
    const level = mix[id];
    if (level) levels[id] = Math.round((level + (randomAt(seed, offset + 1) - .5) * .08) * 100) / 100;
  });
  return { name, mix: stressMix(levels), seed, index };
}

export function rescueResponseCount(settings: ResponseSettings) {
  return RESPONSES.filter(({ id }) => settings[id]).length;
}

export function beginRescue(cause: RescueCase, plan?: RescuePlan): RescueRun {
  const sample = prepareScenario("blank", cause.seed);
  const disabled = Object.fromEntries(RESPONSES.map(({ id }) => [id, false]));
  let exposed = { ...sample, mix: stressMix(cause.mix), responses: responseSettings(disabled) };
  // Apply the plan only after exposure has created the case's starting damage.
  for (let tick = 0; tick < 4; tick++) exposed = stepCell(exposed);
  const run: RescueRun = { sample: exposed, progress: { elapsed: 0, stableTicks: 0, status: "exposure" } };
  return plan ? withRescuePlan(run, plan) : run;
}

function withRescuePlan(start: RescueRun, plan: RescuePlan): RescueRun {
  const responses = { ...start.sample.responses };
  for (const id of plan.responses) responses[id] = true;
  return { ...start, sample: { ...start.sample, responses } };
}

export function rescueReadiness(cell: Cell): RescueReading[] {
  return [
    { id: "cycle" as const, label: "Cell cycle", reading: FATE_LABELS[cell.fate], target: "Cycling", ready: cell.fate === "cycling" },
    targetReading("energy", "ATP", cell.energy, .75, "higher"),
    targetReading("dna", "DNA lesions", activeLesions(cell), .25, "lower"),
    targetReading("protein", "Protein damage", proteinBurden(cell), .30, "lower"),
    targetReading("er", "ER folding load", cell.erLoad, .25, "lower"),
    targetReading("pressure", "Membrane pressure", cell.pressure, .20, "lower"),
  ];
}

function proteinBurden(cell: Cell) {
  return cell.unfolded + cell.damagedProteins + cell.aggregates;
}

const deathTarget = { "energy-failure": "energy", "protein-damage": "protein", "er-overload": "er" } as const;

export function rescueFailureReading(cell: Cell, deathCause = cell.deathCause) {
  if (!deathCause) return undefined;
  if (deathCause === "dna-breaks") {
    return { id: "dna" as const, label: "DNA strand breaks", reading: Math.ceil(cell.breaks * 100), fraction: cell.breaks };
  }
  const target = rescueReadiness(cell).find(({ id }) => id === deathTarget[deathCause]);
  return target && { id: target.id, label: target.label, reading: target.reading, fraction: target.fraction };
}

function targetReading(id: RescueReading["id"], label: string, value: number, limit: number, direction: "higher" | "lower"): RescueReading {
  const reading = direction === "higher" ? Math.floor(value * 100) : Math.ceil(value * 100);
  const target = Math.round(limit * 100) + " or " + direction;
  return { id, label, reading, target, direction, fraction: value, limit, ready: direction === "higher" ? value >= limit : value <= limit };
}

export function compareRescueReadings(sample: RescueFrame, failedRun: readonly RescueFrame[]): RescueComparisonReading[] {
  const readings = rescueReadiness(sample.cell);
  const failed = failedRun.find(frame => frame.tick === sample.tick);
  if (!failed) return readings;
  const previous = rescueReadiness(failed.cell);
  return readings.map((reading, index) => {
    const baseline = previous[index];
    const before = baseline.fraction;
    const after = reading.fraction;
    let impact: RescueComparisonReading["impact"];
    if (typeof before === "number" && typeof after === "number" && before !== after) {
      impact = (reading.direction === "higher" ? after > before : after < before) ? "better" : "worse";
    } else if (reading.id === "cycle" && isTerminal(failed.cell.fate) !== isTerminal(sample.cell.fate)) {
      impact = isTerminal(sample.cell.fate) ? "worse" : "better";
    }
    return { ...reading, failed: baseline.reading, failedFraction: before, impact };
  });
}

export function isRescueRunning(progress: RescueProgress) {
  return progress.status === "exposure" || progress.status === "recovery";
}

export function stepRescue(run: RescueRun): RescueRun {
  const { progress } = run;
  if (!isRescueRunning(progress)) return run;
  const elapsed = progress.elapsed + 1;
  const stepped = stepCell(run.sample);
  const sample = elapsed === RESCUE_EXPOSURE_TICKS ? clearStress(stepped) : stepped;
  if (isTerminal(sample.cell.fate)) return { sample, progress: { elapsed, stableTicks: 0, status: "lost" } };
  if (elapsed < RESCUE_EXPOSURE_TICKS) return { sample, progress: { elapsed, stableTicks: 0, status: "exposure" } };
  const stableTicks = rescueReadiness(sample.cell).every(({ ready }) => ready) ? progress.stableTicks + 1 : 0;
  const status = stableTicks >= RESCUE_STABLE_TICKS ? "saved" : elapsed >= RESCUE_TOTAL_TICKS ? "unrecovered" : "recovery";
  return { sample, progress: { elapsed, stableTicks, status } };
}

const responseReadings = [
  { label: "ATP", unit: "atp", read: (cell: Cell) => cell.energy, higher: true },
  { label: "UV lesions", unit: "dna", read: (cell: Cell) => cell.photolesions, higher: false },
  { label: "Oxidized DNA bases", unit: "dna", read: (cell: Cell) => cell.oxidizedBases, higher: false },
  { label: "DNA strand breaks", unit: "dna", read: (cell: Cell) => cell.breaks, higher: false },
  { label: "Unfolded proteins", unit: "protein", read: (cell: Cell) => cell.unfolded, higher: false },
  { label: "Protein aggregates", unit: "protein", read: (cell: Cell) => cell.aggregates, higher: false },
  { label: "Oxidized proteins", unit: "protein", read: (cell: Cell) => cell.damagedProteins, higher: false },
  { label: "ER folding load", unit: "er", read: (cell: Cell) => cell.erLoad, higher: false },
  { label: "Replication stress", unit: "replication", read: (cell: Cell) => cell.forkStress, higher: false },
  { label: "Oxidation", unit: "oxidation", read: (cell: Cell) => cell.oxidation, higher: false },
] as const;

export type RescueResponseEffect = {
  response: keyof ResponseSettings;
  enabled: boolean;
  changes: {
    label: string;
    unit: (typeof responseReadings)[number]["unit"];
    before: number;
    after: number;
    beforeFraction: number;
    afterFraction: number;
    better: boolean;
  }[];
  fate?: { before: string; after: string };
  ticks: number;
};

export function compareRescueResponse(run: RescueRun, change: ResponseChange): RescueResponseEffect {
  const responses = { ...run.sample.responses, [change.response]: change.enabled };
  let before = run;
  let after = { ...run, sample: { ...run.sample, responses } };
  let ticks = 0;
  // Compare from identical cells through the same exposure and cooling schedule.
  while (ticks < 3 && isRescueRunning(before.progress) && isRescueRunning(after.progress)) {
    before = stepRescue(before);
    after = stepRescue(after);
    ticks++;
  }
  const changes = responseReadings.flatMap(({ label, unit, read, higher }) => {
    const beforeFraction = read(before.sample.cell);
    const afterFraction = read(after.sample.cell);
    const previous = Math.round(beforeFraction * 100);
    const next = Math.round(afterFraction * 100);
    return previous === next ? [] : [{
      label, unit, before: previous, after: next, beforeFraction, afterFraction,
      better: higher ? next > previous : next < previous,
    }];
  });
  changes.sort((left, right) => Math.abs(right.after - right.before) - Math.abs(left.after - left.before));
  const oldFate = before.sample.cell.fate;
  const nextFate = after.sample.cell.fate;
  const fate = oldFate === nextFate ? undefined : { before: FATE_LABELS[oldFate], after: FATE_LABELS[nextFate] };
  return { ...change, changes, fate, ticks };
}

export function findRescuePlan(cause: RescueCase, preferred: ResponseSettings): RescuePlan | undefined {
  const start = beginRescue(cause);
  if (isTerminal(start.sample.cell.fate)) return;
  const ordered = [...RESPONSES].sort((left, right) => Number(preferred[right.id]) - Number(preferred[left.id]));
  function find(remaining: number, index = 0, chosen: ResponseId[] = []): RescuePlan | undefined {
    if (remaining > 0) {
      for (let i = index; i <= ordered.length - remaining; i++) {
        const result = find(remaining - 1, i + 1, [...chosen, ordered[i].id]);
        if (result) return result;
      }
      return;
    }
    const variants = chosen.includes("glutathione") ? [preferred.cysteineSupport, !preferred.cysteineSupport] : [false];
    for (const cysteineSupport of variants) {
      const plan: RescuePlan = { responses: cysteineSupport ? [...chosen, "cysteineSupport"] : chosen };
      let attempt = withRescuePlan(start, plan);
      while (isRescueRunning(attempt.progress)) attempt = stepRescue(attempt);
      if (attempt.progress.status === "saved") return plan;
    }
  }
  for (let size = 0; size <= RESCUE_RESPONSE_LIMIT; size++) {
    const result = find(size);
    if (result) return result;
  }
}
