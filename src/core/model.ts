import {
  getScenario, responseSettings, STRESSORS, stressMix,
  type ResponseSettings, type ScenarioId, type StressMix, type StressorId,
} from "./catalog.js";
import { randomAt } from "./geometry.js";

export type CellFate = "cycling" | "arrested" | "senescent" | "apoptotic" | "energy-failure";
export type DeathCause = "er-overload" | "dna-breaks" | "protein-damage" | "energy-failure";
export type Cell = {
  altered: boolean;
  generation: number;
  fate: CellFate;
  fateTick: number;
  phase: number;
  energy: number;
  photolesions: number;
  oxidizedBases: number;
  breaks: number;
  unfolded: number;
  damagedProteins: number;
  aggregates: number;
  erLoad: number;
  forkStress: number;
  oxidation: number;
  pressure: number;
  mutations: number;
  stressTime: number;
  deathTime: number;
  deathCause?: DeathCause;
};

export const FATE_LABELS: Record<CellFate, string> = {
  cycling: "Cycling", arrested: "Checkpoint arrest", senescent: "Senescent",
  apoptotic: "Apoptosis", "energy-failure": "Energy failure",
};

export type CellEvent = {
  tick: number;
  text: string;
};

export type LesionAmounts = Pick<Cell, "photolesions" | "oxidizedBases" | "breaks">;

export type CellActivity = {
  tick: number;
  pulse?: StressorId;
  uv: number;
  uvBlocked: number;
  xray: number;
  heat: number;
  formed: LesionAmounts;
  repaired: LesionAmounts;
  unfolded: number;
  refolded: number;
};

export type CellSample = {
  seed: number;
  tick: number;
  cell: Cell;
  mix: StressMix;
  pulse: StressMix;
  responses: ResponseSettings;
  events: readonly CellEvent[];
  activity: readonly CellActivity[];
};

const clamp = (value: number) => Math.max(0, Math.min(value, 1));
const approach = (value: number, target: number, speed: number) => clamp(value + (target - value) * speed);
export const activeLesions = (cell: Cell) => cell.photolesions + cell.oxidizedBases + cell.breaks;
export const isTerminal = (fate: CellFate) => fate === "apoptotic" || fate === "energy-failure";

function newCell(phase: number): Cell {
  return {
    altered: false, generation: 0, fate: "cycling", fateTick: 0, phase, energy: 1,
    photolesions: 0, oxidizedBases: 0, breaks: 0, unfolded: 0, damagedProteins: 0, aggregates: 0, erLoad: 0, forkStress: 0,
    oxidation: 0, pressure: 0, mutations: 0, stressTime: 0, deathTime: 0,
  };
}

export function clearStress(sample: CellSample): CellSample {
  return { ...sample, mix: stressMix(), pulse: stressMix() };
}

function updateCell(cell: Cell, stress: StressMix, response: ResponseSettings, tick: number, seed: number) {
  const uvBlocked = response.filter ? stress.uv * .86 : 0;
  const uv = stress.uv - uvBlocked;
  const oxygen = stress.oxygen * (response.supply ? .04 : 1);
  const glucose = stress.glucose * (response.supply ? .04 : 1);
  const buffering = response.glutathione ? (response.cysteineSupport ? .46 : .62) : 1;
  const oxidation = clamp((stress.oxidants + stress.xray * .24 + cell.erLoad * .11) * buffering);
  const energy = approach(cell.energy, 1 - clamp(.46 * oxygen + .38 * glucose + .24 * oxygen * glucose + .07 * oxidation), .24);
  const erLoad = clamp(cell.erLoad + stress.er * .24 + (oxygen + glucose) * .033 -
    cell.erLoad * (.06 + (response.upr ? .13 * energy : 0) + (response.clearance ? .07 * energy : 0)));
  const proteinInput = stress.heat * .22 + oxidation * .095 + (1 - energy) * .05 + .03 * (oxygen + glucose);
  const refolded = response.hsp ? cell.unfolded * .29 * energy * (1 - oxidation * .78) : 0;
  const aggregated = cell.unfolded * (.035 + oxidation * .14 + stress.heat * .08);
  const irreversiblyDamaged = cell.unfolded * oxidation * .11;
  const unfolded = clamp(cell.unfolded + proteinInput - refolded - aggregated - irreversiblyDamaged - cell.unfolded * .023);
  const damagedProteins = clamp(cell.damagedProteins + irreversiblyDamaged -
    cell.damagedProteins * (response.clearance ? .2 * energy : .01));
  const aggregates = clamp(cell.aggregates + aggregated - cell.aggregates * (response.clearance ? .17 * energy : .012));
  const pressure = approach(cell.pressure, stress.crowding, .31);
  const repaired: LesionAmounts = {
    photolesions: response.ner ? cell.photolesions * .25 * energy : 0,
    oxidizedBases: response.ber ? cell.oxidizedBases * .24 * energy : 0,
    breaks: 0,
  };
  const formed: LesionAmounts = {
    photolesions: Math.min(uv * .21, 1 - cell.photolesions + repaired.photolesions),
    oxidizedBases: Math.min(oxidation * .105, 1 - cell.oxidizedBases + repaired.oxidizedBases),
    breaks: 0,
  };
  const photolesions = clamp(cell.photolesions + formed.photolesions - repaired.photolesions);
  const oxidizedBases = clamp(cell.oxidizedBases + formed.oxidizedBases - repaired.oxidizedBases);
  const copying = cell.phase >= .30 && cell.phase < .77;
  const replicationLoad = copying ? .24 * stress.replication + .13 * photolesions + .045 * oxidizedBases + .1 * stress.growth : 0;
  const forkStress = clamp(cell.forkStress + replicationLoad - cell.forkStress * (response.checkpoint ? .27 : .08));
  const collapse = Math.max(0, forkStress - (response.checkpoint ? .62 : .37));
  repaired.breaks = response.breaks ? cell.breaks * (copying ? .28 : .21) * energy : 0;
  formed.breaks = Math.min(.23 * stress.xray + .17 * collapse, 1 - cell.breaks + repaired.breaks);
  const breaks = clamp(cell.breaks + formed.breaks - repaired.breaks);

  const damage = photolesions + oxidizedBases + breaks * 1.2;
  const growthDrive = cell.altered ? .75 : stress.growth;
  const check = response.checkpoint && !cell.altered;
  const needsPause = check && (damage > .42 || forkStress > .26 || growthDrive > .39 || energy < .34);
  const enduringStress = damage > .57 || growthDrive > .4;
  const stressTime = enduringStress ? cell.stressTime + 1 : Math.max(0, cell.stressTime - 2);
  const lethalLoad = erLoad > .79 ? "er-overload" : breaks > .88 ? "dna-breaks" :
    unfolded + aggregates + damagedProteins * .35 > 1.28 ? "protein-damage" : undefined;
  const deathCause = energy < .16 ? "energy-failure" : lethalLoad;
  const deathTime = deathCause ? cell.deathTime + 1 : Math.max(0, cell.deathTime - 2);
  let fate: CellFate = needsPause ? "arrested" : "cycling";
  if (cell.fate === "senescent" || (check && stressTime >= 13)) fate = "senescent";
  if (deathTime >= 5 && lethalLoad) fate = "apoptotic";
  if (deathTime >= 5 && energy < .16) fate = "energy-failure";

  const progress = cell.altered ? .145 : .075;
  const phase = fate === "cycling" && energy > .34 ? Math.min(1, cell.phase + progress * energy) : cell.phase;
  const finishedCopying = copying && phase >= .77;
  const copyDamage = damage + forkStress * .75;
  const mutation = finishedCopying && copyDamage > .22 &&
    randomAt(seed, tick + cell.generation * 17) < Math.min(.82, copyDamage);

  const next: Cell = {
    ...cell, fate, fateTick: fate === cell.fate ? cell.fateTick : tick, phase, energy, photolesions,
    oxidizedBases, breaks, unfolded, damagedProteins, aggregates, erLoad, forkStress, oxidation, pressure,
    stressTime, deathTime, mutations: cell.mutations + Number(mutation),
    ...(isTerminal(fate) && deathCause ? { deathCause } : {}),
  };
  const activity: CellActivity = {
    tick, uv, uvBlocked, xray: stress.xray, heat: stress.heat, formed, repaired,
    unfolded: Math.min(proteinInput, 1 - cell.unfolded + refolded + aggregated + irreversiblyDamaged + cell.unfolded * .023),
    refolded,
  };
  return { cell: next, activity };
}

function eventText(cell: Cell): string {
  switch (cell.fate) {
    case "arrested": return "A checkpoint paused division.";
    case "senescent": return "The cell entered durable arrest.";
    case "apoptotic": return "The cell committed to apoptosis.";
    case "energy-failure": return "ATP fell below the level needed to sustain the cell.";
    case "cycling": return "The cell resumed cycling.";
  }
}

function advanceCell(sample: CellSample, pulsed?: StressorId): CellSample {
  const tick = sample.tick + 1;
  const stress = { ...sample.mix };
  const pulse = { ...sample.pulse };
  for (const { id } of STRESSORS) {
    stress[id] = clamp(stress[id] + pulse[id]);
    pulse[id] = pulse[id] > .015 ? pulse[id] * .60 : 0;
  }

  const previous = sample.cell;
  if (isTerminal(previous.fate)) return { ...sample, tick, pulse, activity: [] };
  const update = updateCell(previous, stress, sample.responses, tick, sample.seed);
  let cell = update.cell;
  const changes: CellEvent[] = [];
  const record = (text: string) => changes.push({ tick, text });
  if (cell.fate !== previous.fate) record(eventText(cell));
  if (cell.mutations !== previous.mutations) record("A sequence change persisted after DNA copying.");
  if (cell.phase === 1 && cell.fate === "cycling") {
    cell = { ...cell, phase: .06, generation: cell.generation + 1 };
    record("The cell divided. The view follows one daughter.");
  }
  const activity = isTerminal(cell.fate) ? [] : [...sample.activity, { ...update.activity, pulse: pulsed }].slice(-5);
  return { ...sample, cell, tick, pulse, activity, events: changes.length ? [...sample.events, ...changes].slice(-24) : sample.events };
}

export function stepCell(sample: CellSample): CellSample {
  return advanceCell(sample);
}

export function pulseCell(sample: CellSample, id: StressorId): CellSample {
  if (isTerminal(sample.cell.fate)) return sample;
  return advanceCell({ ...sample, pulse: { ...sample.pulse, [id]: Math.max(sample.pulse[id], .62) } }, id);
}

export function prepareScenario(id: ScenarioId, seed = 42): CellSample {
  const scenario = getScenario(id);
  let cell = newCell(id === "uv" ? .56 : .18 + randomAt(seed, 377) * .36);
  if (id === "lineage") {
    cell = { ...cell, altered: true, mutations: 2, phase: .72 };
  }
  // A short warmup makes the selected pathway visible on the first frame.
  let sample: CellSample = {
    seed, tick: 0, cell, mix: stressMix(scenario.mix), pulse: stressMix(),
    responses: responseSettings(scenario.responses), events: [], activity: [],
  };
  for (let index = 0; index < scenario.warmup; index++) sample = stepCell(sample);
  return { ...sample, activity: sample.activity.slice(-1) };
}
