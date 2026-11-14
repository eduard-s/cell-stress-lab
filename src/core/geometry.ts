export const CELL_VIEW_WIDTH = 275;
export const CELL_VIEW_HEIGHT = 183;
export const CELL_PULSE_ORIGIN = { x: 137.5, y: 106 };
export const CELL_MEMBRANE = "M17 102C18 87 27 80 32 68c6-13 8-22 25-27 11-3 23-1 37-5 23-6 37-19 64-16 22 2 36 12 52 21 16 9 25 13 34 31 5 11 10 18 13 28 5 20-6 31-23 44-14 11-28 18-47 19-14 1-26-4-43-3-20 1-29 11-50 9-24-2-37-12-52-24-16-12-29-23-25-43Z";
export const CELL_NUCLEUS = { x: 134, y: 71, rx: 34, ry: 30 };
export const MITOCHONDRIA = [[72, 77, -25], [149, 123, -20], [190, 76, 26], [79, 126, 17]] as const;
export const PROTEIN_SITES = [
  [100, 117], [184, 110], [70, 101], [216, 87], [131, 142], [220, 123],
  [173, 139], [57, 133], [165, 95], [90, 144], [210, 57], [238, 107],
] as const;

export function isInsideCell(x: number, y: number, pressure: number): boolean {
  const radiusX = 115 * (1 + pressure * .11);
  const radiusY = 62 * (1 - pressure * .32);
  return ((x - 137.5) / radiusX) ** 2 + ((y - 94) / radiusY) ** 2 <= 1.08;
}

export function randomAt(seed: number, index: number): number {
  let value = Math.imul((seed | 0) ^ (index + 1), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
