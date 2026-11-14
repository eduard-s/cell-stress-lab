import type { RescueComparisonReading, RescueReading, StressorId } from "../core/index.js";

type Scale = {
  unit: string;
  span: number;
  digits: number;
};

type StressScale = Scale & { baseline?: number; spokenUnit: string };

const stressScales: Record<StressorId, StressScale> = {
  uv: { unit: "mJ/cm²", span: 4, digits: 2, spokenUnit: "millijoules per square centimeter" },
  xray: { unit: "Gy", span: 1, digits: 2, spokenUnit: "gray" },
  heat: { unit: "°C", baseline: 37, span: 8, digits: 1, spokenUnit: "degrees Celsius" },
  oxidants: { unit: "µM H₂O₂ eq.", span: 200, digits: 0, spokenUnit: "micromolar hydrogen peroxide equivalent" },
  oxygen: { unit: "kPa O₂", baseline: 21, span: -21, digits: 1, spokenUnit: "kilopascals of oxygen" },
  glucose: { unit: "mM", baseline: 5.5, span: -5.5, digits: 2, spokenUnit: "millimolar" },
  crowding: { unit: "kPa", span: 15, digits: 1, spokenUnit: "kilopascals" },
  er: { unit: "× baseline", baseline: 1, span: 3, digits: 2, spokenUnit: "times baseline folding demand" },
  replication: { unit: "× baseline", baseline: 1, span: 4, digits: 2, spokenUnit: "times baseline replication stress" },
  growth: { unit: "× baseline", baseline: 1, span: 4, digits: 2, spokenUnit: "times baseline growth signal" },
};

export const readoutScales = {
  atp: { unit: "mM", span: 3, digits: 2 },
  dna: { unit: "lesion eq./cell", span: 10, digits: 2 },
  protein: { unit: "µM eq.", span: 10, digits: 2 },
  er: { unit: "µM eq.", span: 5, digits: 2 },
  replication: { unit: "fork eq./cell", span: 10, digits: 2 },
  oxidation: { unit: "µM H₂O₂ eq.", span: 200, digits: 1 },
  pressure: stressScales.crowding,
} satisfies Record<string, Scale>;

export type ReadoutUnit = keyof typeof readoutScales;

export function formatStressLevel(id: StressorId, fraction: number, spoken = false) {
  const scale = stressScales[id];
  const value = (scale.baseline ?? 0) + fraction * scale.span;
  const text = Number(value.toFixed(scale.digits));
  const unit = spoken ? scale.spokenUnit : scale.unit;
  if (id === "uv" || id === "xray") return text + " " + unit + (spoken ? " per tick" : "/tick");
  return text + " " + unit;
}

type Rounding = "nearest" | "up" | "down";

export function formatReading(unit: ReadoutUnit, fraction: number, rounding: Rounding = "nearest") {
  const { span, digits } = readoutScales[unit];
  const precision = 10 ** digits;
  const value = fraction * span * precision;
  const rounded = rounding === "up" ? Math.ceil(value - 1e-9) :
    rounding === "down" ? Math.floor(value + 1e-9) : Math.round(value);
  if (rounded === 0 && value > 0) return "<" + 1 / precision;
  return String(rounded / precision);
}

export function formatQuantity(unit: ReadoutUnit, fraction: number, rate = false) {
  return formatReading(unit, fraction) + " " + readoutScales[unit].unit + (rate ? "/tick" : "");
}

const rescueUnits = { energy: "atp", dna: "dna", protein: "protein", er: "er", pressure: "pressure", cycle: undefined } as const;

export function formatRescueReading(reading: RescueComparisonReading, previous = false) {
  const unit = rescueUnits[reading.id];
  const fraction = previous ? reading.failedFraction : reading.fraction;
  const state = previous ? reading.failed : reading.reading;
  if (!unit || fraction === undefined) return String(state ?? "—");
  return formatRescueQuantity(unit, fraction);
}

export function formatRescueTarget(reading: RescueReading) {
  const unit = rescueUnits[reading.id];
  if (!unit || reading.limit === undefined) return reading.target;
  return (reading.direction === "higher" ? "≥ " : "≤ ") + formatQuantity(unit, reading.limit);
}

export function formatFailureReading(reading: { id: RescueReading["id"]; fraction?: number; reading: string | number }) {
  const unit = rescueUnits[reading.id];
  return unit && reading.fraction !== undefined ? formatRescueQuantity(unit, reading.fraction) : String(reading.reading);
}

function formatRescueQuantity(unit: ReadoutUnit, fraction: number) {
  const rounding = unit === "atp" ? "down" : "up";
  return formatReading(unit, fraction, rounding) + " " + readoutScales[unit].unit;
}
