export type Point = { x: number; y: number };
export type ProteinShape = "folded" | "unfolded";

export const DNA_RUNG_COUNT = 8;
export const DNA_DAMAGE_RUNG = 4;
export const DNA_SEGMENTS = [
  { x: 120, y: 63, angle: -16 },
  { x: 143, y: 57, angle: 13 },
  { x: 145, y: 81, angle: 35 },
] as const;
const uvThresholds = [.006, .24, .54];

export function showsPhotolesion(index: number, burden: number) {
  return burden >= uvThresholds[index];
}

export function dnaRung(index: number) {
  const center = Math.sin(index * 1.04) * 2.1;
  const halfWidth = 2.2 + Math.abs(Math.cos(index * 1.04)) * 2.7;
  const y = (index - 3.5) * 2.25;
  return { left: { x: center - halfWidth, y }, right: { x: center + halfWidth, y } };
}

export function dnaBackbone(side: "left" | "right") {
  return Array.from({ length: DNA_RUNG_COUNT }, (_, index) => {
    const { x, y } = dnaRung(index)[side];
    return `${x},${y}`;
  }).join(" ");
}

const strandPoints: Record<ProteinShape, readonly [number, number][]> = {
  unfolded: [[-11, -1], [-7, -5], [-4, 3.8], [0, 2.5], [3, -4.4], [7, -4.1], [10.7, 1.6]],
  folded: [[-4.8, 2], [-5.5, -2.9], [-1.8, -4.3], [1.9, -1.6], [-.3, 1.8], [2.8, 4.5], [5, 1.1]],
};

export function proteinStrand(fold: number, scale = 1) {
  const points = strandPoints.unfolded.map(([x, y], index) => {
    const [foldedX, foldedY] = strandPoints.folded[index];
    return { x: (x + (foldedX - x) * fold) * scale, y: (y + (foldedY - y) * fold) * scale };
  });
  let path = `M${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index];
    const next = points[index + 1];
    path += ` Q${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`;
  }
  const last = points.at(-1)!;
  return path + ` T${last.x} ${last.y}`;
}

export function wavePath(length: number, amplitude: number, phase: number, periods = 2.3) {
  return Array.from({ length: 28 }, (_, index) => {
    const progress = index / 27;
    const x = -length + progress * length;
    const y = Math.sin(progress * Math.PI * 2 * periods + phase) * amplitude * (.24 + progress * .76);
    return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}
