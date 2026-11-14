import { DNA_DAMAGE_RUNG, DNA_SEGMENTS, dnaRung, PROTEIN_SITES, randomAt, showsPhotolesion } from "../core/index.js";

export const lesionSites = {
  ner: { rung: DNA_DAMAGE_RUNG, side: "right", pool: "photolesions" },
  ber: { rung: 2, side: "left", pool: "oxidizedBases" },
  breaks: { rung: DNA_DAMAGE_RUNG, side: "right", pool: "breaks" },
} as const;

export type RepairPathway = keyof typeof lesionSites;

export function lesionPoint(pathway: RepairPathway, offset = 0) {
  const { rung, side } = lesionSites[pathway];
  return dnaRung(rung + offset)[side];
}

export function showsLesion(pathway: RepairPathway, index: number, burden: number) {
  return pathway === "ner" ? showsPhotolesion(index, burden) : burden >= (index + .05) / DNA_SEGMENTS.length;
}

export const proteinSites = PROTEIN_SITES.map(([x, y], index) => ({ x, y, angle: randomAt(27, index) * 150 }));

export function showsUnfolding(index: number, burden: number) {
  return burden > (index + .5) / proteinSites.length;
}
