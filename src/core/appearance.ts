import { activeLesions, type Cell } from "./model.js";

export type CellTone = "healthy" | "stress" | "arrested" | "senescent" | "apoptotic" | "energy" | "lineage";

export function cellTone(cell: Cell): CellTone {
  if (cell.fate === "energy-failure") return "energy";
  if (cell.fate !== "cycling") return cell.fate;
  if (cell.altered) return "lineage";
  return cell.unfolded > .20 || cell.aggregates > .18 || cell.erLoad > .25 ||
    activeLesions(cell) > .18 || cell.energy < .76 || cell.pressure > .28 ? "stress" : "healthy";
}
