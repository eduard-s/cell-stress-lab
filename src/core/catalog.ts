export const STRESSORS = [
  { id: "uv", label: "UV light", effect: "Links neighboring DNA bases", origin: "External" },
  { id: "xray", label: "X-rays", effect: "Break DNA and oxidize bases", origin: "External" },
  { id: "heat", label: "Heat", effect: "Unfolds proteins", origin: "External" },
  { id: "oxidants", label: "Oxidants", effect: "Damage DNA and proteins", origin: "External or internal" },
  { id: "er", label: "ER overload", effect: "Strains protein folding in the ER", origin: "Internal" },
  { id: "oxygen", label: "Oxygen shortage", effect: "Limits ATP production", origin: "External" },
  { id: "glucose", label: "Glucose shortage", effect: "Reduces the cell’s fuel supply", origin: "External" },
  { id: "replication", label: "Replication stress", effect: "Stalls DNA copying", origin: "Internal" },
  { id: "crowding", label: "Compression", effect: "Deforms the membrane", origin: "External" },
  { id: "growth", label: "Oncogenic signaling", effect: "Adds a persistent growth signal", origin: "Internal" },
] as const;

export const RESPONSES = [
  { id: "filter", label: "UV filter", role: "External prevention", description: "Reduces UV reaching the cell.", initial: false },
  { id: "ner", label: "Nucleotide excision repair", role: "DNA repair", description: "Removes UV lesions.", initial: true },
  { id: "ber", label: "Base excision repair", role: "DNA repair", description: "Removes oxidized DNA bases.", initial: true },
  { id: "breaks", label: "Double-strand break repair", role: "DNA repair", description: "Repairs breaks in DNA.", initial: true },
  { id: "hsp", label: "HSP70 chaperones", role: "Protein refolding", description: "Refold proteins using ATP.", initial: true },
  { id: "upr", label: "ER unfolded protein response", role: "Folding support", description: "Reduces folding load in the ER.", initial: true },
  { id: "clearance", label: "Protein clearance", role: "Proteasome and autophagy", description: "Removes damaged proteins and aggregates.", initial: true },
  { id: "glutathione", label: "Glutathione buffering", role: "Redox defense", description: "Limits oxidation.", initial: true },
  { id: "supply", label: "Oxygen and glucose supply", role: "External support", description: "Offsets both shortages so ATP can recover.", initial: false },
  { id: "checkpoint", label: "Cell-cycle checkpoints", role: "Division control", description: "Stabilize stalled DNA copying and pause division.", initial: true },
] as const;

export type StressorId = (typeof STRESSORS)[number]["id"];
export type ResponseId = (typeof RESPONSES)[number]["id"];
export type StressMix = Record<StressorId, number>;
export type ResponseSettings = Record<ResponseId, boolean> & { cysteineSupport: boolean };
type Match = readonly [kind: "Direct" | "Conditional", detail: string];

const MATCHES: Record<ResponseId, Partial<Record<StressorId, Match>>> = {
  filter: {
    uv: ["Direct", "Reduces new UV photolesions during exposure."],
  },
  ner: {
    uv: ["Direct", "Removes existing UV photolesions."],
    replication: ["Conditional", "Can relieve a stall if a blocking UV lesion is still present."],
  },
  ber: {
    oxidants: ["Direct", "Repairs oxidized bases such as 8-oxoguanine."],
    xray: ["Conditional", "Repairs oxidized bases in the radiation damage mix."],
  },
  breaks: {
    xray: ["Direct", "Repairs double-strand breaks."],
    uv: ["Conditional", "Acts if UV-stalled forks produce secondary breaks."],
    oxidants: ["Conditional", "Acts if oxidative lesions lead to collapsed forks."],
    replication: ["Conditional", "Acts if stalled forks collapse and leave a break."],
    growth: ["Conditional", "Acts on breaks that follow replication stress."],
  },
  hsp: {
    heat: ["Direct", "Refolds some heat-unfolded proteins while ATP is available."],
    oxidants: ["Conditional", "Can refold reversible damage. Oxidation can slow refolding."],
    oxygen: ["Conditional", "Can assist with misfolding while ATP is available."],
    glucose: ["Conditional", "Can assist with misfolding while ATP is available."],
  },
  upr: {
    er: ["Direct", "Reduces folding load and helps the ER recover."],
    oxygen: ["Conditional", "Helps if low oxygen disrupts ER folding."],
    glucose: ["Conditional", "Helps if low glucose disrupts ER folding."],
  },
  clearance: {
    heat: ["Direct", "Clears damaged proteins and some aggregates."],
    oxidants: ["Direct", "Clears damaged proteins that can be degraded."],
    er: ["Direct", "Routes selected misfolded ER proteins to degradation."],
    oxygen: ["Conditional", "Can remove damaged proteins while clearance capacity is available."],
    glucose: ["Conditional", "Can remove damaged proteins while clearance capacity is available."],
  },
  glutathione: {
    oxidants: ["Direct", "Buffers part of the reactive oxygen load."],
    xray: ["Conditional", "Buffers secondary oxidation from radiation."],
    er: ["Conditional", "Buffers some oxidative stress if ER overload persists."],
  },
  supply: {
    oxygen: ["Direct", "Restores oxygen so aerobic ATP production can recover."],
    glucose: ["Direct", "Restores glucose as a source of metabolic fuel."],
  },
  checkpoint: {
    uv: ["Conditional", "Delays division when UV lesions interfere with DNA copying."],
    xray: ["Conditional", "Delays division while strand breaks are present."],
    oxidants: ["Conditional", "Delays division when enough DNA damage accumulates."],
    replication: ["Direct", "Stabilizes stalled forks and delays cell-cycle progression."],
    growth: ["Conditional", "Abnormal growth signaling can lead to durable arrest."],
  },
};

export function responseMatch(stressor: StressorId, response: ResponseId): Match | undefined {
  return MATCHES[response][stressor];
}

export function stressMix(values: Partial<StressMix> = {}): StressMix {
  return Object.fromEntries(STRESSORS.map(({ id }) => {
    const value = values[id];
    return [id, typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0];
  })) as StressMix;
}

export function responseSettings(values: Partial<ResponseSettings> = {}): ResponseSettings {
  return {
    ...Object.fromEntries(RESPONSES.map(({ id, initial }) => [id, values[id] ?? initial])) as Record<ResponseId, boolean>,
    cysteineSupport: values.cysteineSupport ?? false,
  };
}

type Scenario = {
  id: string;
  title: string;
  tip: string;
  focus: StressorId;
  mix: Partial<StressMix>;
  responses?: Partial<ResponseSettings>;
  warmup: number;
};

export const SCENARIOS = [
  { id: "uv-heat", title: "UV and heat", focus: "uv", mix: { uv: .43, heat: .61 }, warmup: 4,
    tip: "Watch UV reach the DNA while HSP70 refolds heat-unfolded proteins. Switch the UV filter, DNA repair, or HSP70 on and off to compare." },
  { id: "heat", title: "Heat and oxidants", focus: "heat", mix: { heat: .66, oxidants: .34 }, warmup: 4,
    tip: "Stop all stress to watch proteins refold. Repeat with HSP70 chaperones switched off and compare the unfolded protein readout." },
  { id: "uv", title: "UV during DNA replication", focus: "uv", mix: { uv: .95, replication: .38 }, warmup: 2,
    tip: "Toggle the UV filter while the cell runs. Watch DNA lesions, checkpoint arrest, and fixed mutations separately." },
  { id: "er", title: "Persistent ER overload", focus: "er", mix: { er: 1 }, warmup: 4,
    tip: "Stop all stress early to give the ER time to recover. Leave ER overload on to see how sustained stress can end in apoptosis." },
  { id: "energy", title: "Oxygen and glucose shortage", focus: "oxygen", mix: { oxygen: 1, glucose: 1 }, warmup: 4,
    tip: "Watch ATP fall, then restore oxygen and glucose. The earlier you restore supply, the more time cells have to recover." },
  { id: "crowding", title: "Mechanical compression", focus: "crowding", mix: { crowding: .9 }, warmup: 2,
    tip: "Watch the membrane deform. Lower compression to let the cell relax." },
  { id: "lineage", title: "Altered growth control", focus: "growth", mix: { growth: .85 }, warmup: 0,
    tip: "This cell starts with altered growth control. After each division, the lab follows one daughter cell and its inherited mutations." },
  { id: "blank", title: "Free play", focus: "heat", mix: {}, warmup: 0,
    tip: "Set any mix of stressors and watch the same cell respond. Pulse UV or heat for a brief exposure." },
] as const satisfies readonly Scenario[];

export type ScenarioId = (typeof SCENARIOS)[number]["id"];

export function getScenario(id: ScenarioId): Scenario {
  return SCENARIOS.find(scenario => scenario.id === id) ?? SCENARIOS[0];
}
