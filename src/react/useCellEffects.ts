import { useEffect, useRef, type RefObject } from "react";
import {
  DNA_SEGMENTS, proteinStrand, randomAt, wavePath,
  type CellActivity, type CellSample, type Point,
} from "../core/index.js";
import { lesionPoint, lesionSites, proteinSites, showsLesion, showsUnfolding, type RepairPathway } from "./molecular-sites.js";

type Target =
  | { kind: "uv" | "uv-block" | "xray"; index: number; contact?: { membrane: Point; dna: Point } }
  | { kind: "damage" | "repair"; index: number; pathway: RepairPathway }
  | { kind: "unfold" | "refold"; index: number }
  | { kind: "heat" };
type Effect = Target & { age: number };
type Focus = keyof typeof cellViews;
type Radiation = Extract<Effect, { kind: "uv" | "uv-block" | "xray" }>;
type MolecularEffect = Extract<Effect, { kind: "damage" | "repair" }>;
type ProteinEffect = Extract<Effect, { kind: "unfold" | "refold" }>;

// The molecular layers use the same SVG groups as the structures they animate.
export type EffectLayers = {
  membrane: SVGPathElement | null;
  membraneEffects: SVGGElement | null;
  exposure: SVGGElement | null;
  dna: (SVGGElement | null)[];
  proteins: (SVGGElement | null)[];
};

const LIMIT = 24;
const TRAVEL_END = 480;
const UV_TRANSIT = 170;
const durations: Record<Target["kind"], number> = {
  uv: 1360, "uv-block": 940, xray: 1240, heat: 900, damage: 720,
  repair: 1270, unfold: 740, refold: 1260,
};

const ease = (t: number) => t * t * (3 - 2 * t);
const progress = (value: number, start: number, end: number) => Math.max(0, Math.min(1, (value - start) / (end - start)));

function proteinInView(index: number, focus: Focus) {
  const { x, y } = proteinSites[index];
  return focus !== "dna" && (focus === "cell" || (x >= 63 && x <= 133 && y <= 145));
}

function effectBatch(step: CellActivity, sample: CellSample, focus: Focus, active: readonly Effect[]): Effect[] {
  const effects: Effect[] = [];
  const sequence = Math.floor(step.tick / 2);
  const input = step.tick % 2 === 0;
  const beat = (amount: number, key: number, scale: number) =>
    amount > 0 && (amount > 1 / scale || randomAt(sample.seed + key, step.tick) < amount * scale);
  const lesionIndex = (pathway: RepairPathway, beforeRepair = false) => {
    const pool = lesionSites[pathway].pool;
    const burden = sample.cell[pool] + (beforeRepair ? step.repaired[pool] - step.formed[pool] : 0);
    const indices = DNA_SEGMENTS.map((_, index) => index).filter(index => showsLesion(pathway, index, burden));
    return indices.length ? indices[sequence % indices.length] : 0;
  };

  if (step.pulse === "uv" || (input && beat(step.uv + step.uvBlocked, 301, 6))) {
    const index = lesionIndex("ner");
    if (step.uvBlocked >= step.uv && step.uvBlocked > 0) effects.push({ kind: "uv-block", index, age: 0 });
    if (beat(step.uv, 302, step.uvBlocked > 0 ? 3 : 10) || (step.pulse === "uv" && !step.uvBlocked)) {
      effects.push({ kind: "uv", index, age: 0 });
      if (step.formed.photolesions > .006) {
        effects.push({ kind: "damage", pathway: "ner", index, age: -(TRAVEL_END + UV_TRANSIT) });
      }
    }
  }
  if (step.pulse === "xray" || (input && beat(step.xray, 305, 7))) {
    const index = lesionIndex("breaks");
    effects.push({ kind: "xray", index, age: 0 });
    if (step.formed.breaks > .008) effects.push({ kind: "damage", pathway: "breaks", index, age: -TRAVEL_END });
  }
  if (step.pulse === "heat" || (input && beat(step.heat, 309, 4))) effects.push({ kind: "heat", age: 0 });
  if (beat(step.formed.oxidizedBases, 313, 18) && input) {
    effects.push({ kind: "damage", pathway: "ber", index: lesionIndex("ber"), age: 0 });
  }
  if (!input) {
    const pathways = (Object.keys(lesionSites) as RepairPathway[]).filter(pathway => sample.responses[pathway]);
    const amount = (pathway: RepairPathway) => step.repaired[lesionSites[pathway].pool];
    const [pathway] = pathways.sort((left, right) => amount(right) - amount(left));
    if (pathway && beat(amount(pathway), 321, 18)) {
      const index = lesionIndex(pathway, true);
      effects.push({ kind: "repair", index, pathway, age: 0 });
    }
  }

  const unfold = (input || step.pulse === "heat") && beat(step.unfolded, 328, 10);
  const refold = !input && sample.responses.hsp && beat(step.refolded, 340, 16);
  if (unfold || refold) {
    const burden = sample.cell.unfolded + (unfold ? 0 : step.refolded);
    const candidates = proteinSites.map((_, index) => index).filter(index =>
      proteinInView(index, focus) && showsUnfolding(index, burden) &&
      !active.some(effect => (effect.kind === "unfold" || effect.kind === "refold") && effect.index === index));
    if (candidates.length) {
      const index = candidates[sequence % candidates.length];
      effects.push({ kind: unfold ? "unfold" : "refold", index, age: 0 });
    }
  }

  return effects;
}

function ring(radius: number, opacity = 1) {
  return `<circle r="${radius.toFixed(2)}" class="csl-effect-ring" opacity="${opacity}"/>`;
}

function label(text: string, x: number, y: number, opacity: number, anchor = "start") {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" class="csl-effect-label" opacity="${opacity}">${text}</text>`;
}

function impact(fraction: number, radius: number) {
  const fade = 1 - fraction;
  const spread = radius * (.35 + fraction);
  return ring(spread, fade) + ring(spread * .65, fade * .6) +
    `<path class="csl-effect-flare" opacity="${fade}" d="M-${spread} 0h4m${2 * spread - 8} 0h4M0 -${spread}v4m0 ${2 * spread - 8}v4"/>`;
}

function interpolate(from: Point, to: Point, fraction: number) {
  return new DOMPoint(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction);
}

function membraneContact(membrane: SVGPathElement, source: Point, target: Point) {
  // The beam starts outside the silhouette and aims at a base inside it.
  let outside = 0;
  let inside = 1;
  for (let step = 0; step < 12; step++) {
    const fraction = (outside + inside) / 2;
    if (membrane.isPointInFill(interpolate(source, target, fraction))) inside = fraction;
    else outside = fraction;
  }
  return interpolate(source, target, inside);
}

function radiationImpact(point: Point, t: number, text: string, radius: number) {
  return `<g class="csl-radiation-impact" transform="translate(${point.x} ${point.y})">${impact(t, radius)}
    ${label(text, 11, 6, 1 - t)}
  </g>`;
}

function travellingWave(start: Point, endpoint: Point, travel: number, length: number, amplitude: number) {
  const { x, y } = interpolate(start, endpoint, travel);
  const angle = Math.atan2(endpoint.y - start.y, endpoint.x - start.x) * 180 / Math.PI;
  const stroke = wavePath(length, amplitude, travel * 10) + " L0 0";
  return `<g transform="translate(${x} ${y}) rotate(${angle})">
    <path class="csl-effect-halo" d="${stroke}"/><path class="csl-effect-wave" d="${stroke}"/>
    <circle class="csl-effect-head" r="2.15"/>
  </g>`;
}

function uvImpact({ membrane, dna }: NonNullable<Radiation["contact"]>, age: number, hit: number) {
  const fraction = progress(age, TRAVEL_END, TRAVEL_END + UV_TRANSIT);
  const flash = radiationImpact(membrane, hit, "UV hit", 11);
  if (fraction === 0 || fraction === 1) return flash;
  const length = Math.min(14, fraction * Math.hypot(dna.x - membrane.x, dna.y - membrane.y));
  return flash + travellingWave(membrane, dna, fraction, length, 1.9);
}

type LayerMarkup = { layer: SVGGElement | null; markup: string };

function radiation(effect: Radiation, layers: EffectLayers): LayerMarkup | undefined {
  const { kind, index, age } = effect;
  const xray = kind === "xray";
  const blocked = kind === "uv-block";
  const landed = age >= TRAVEL_END;
  const hit = progress(age, TRAVEL_END, durations[kind]);
  const target = lesionPoint(xray ? "breaks" : "ner");

  if (xray && landed) return { layer: layers.dna[index], markup: radiationImpact(target, hit, "X-ray hit", 7) };
  if (effect.contact) {
    return { layer: layers.membraneEffects, markup: uvImpact(effect.contact, age, hit) };
  }

  const screen = layers.exposure?.getScreenCTM();
  const dnaScreen = layers.dna[index]?.getScreenCTM();
  if (!screen || !dnaScreen) return;
  const start = new DOMPoint(xray ? 239 : 69 + index * 18, -7);
  const toView = screen.inverse();
  let endpoint = new DOMPoint(target.x, target.y).matrixTransform(toView.multiply(dnaScreen));

  if (!xray) {
    const membrane = layers.membrane;
    const membraneScreen = membrane?.getScreenCTM();
    if (!membrane || !membraneScreen) return;
    const fromCell = toView.multiply(membraneScreen);
    const toCell = fromCell.inverse();
    const dna = endpoint.matrixTransform(toCell);
    const contact = membraneContact(membrane, start.matrixTransform(toCell), dna);
    if (landed && !blocked) {
      effect.contact = { membrane: contact, dna };
      return { layer: layers.membraneEffects, markup: uvImpact(effect.contact, age, hit) };
    }
    endpoint = contact.matrixTransform(fromCell);
    if (blocked) {
      const distance = Math.hypot(endpoint.x - start.x, endpoint.y - start.y);
      endpoint = interpolate(start, endpoint, Math.max(0, 1 - 15 / distance));
      if (landed) return { layer: layers.exposure, markup: radiationImpact(endpoint, hit, "UV blocked", 8) };
    }
  }

  const travel = progress(age, 0, TRAVEL_END);
  const { x, y } = interpolate(start, endpoint, travel);
  return {
    layer: layers.exposure,
    markup: travellingWave(start, endpoint, travel, 32, xray ? 2.7 : 3.6) +
      label(xray ? "X-rays" : "UV", x - 9, y + 8, .96, "end"),
  };
}

function heat(t: number) {
  const opacity = Math.sin(Math.PI * t) * .88;
  const waves = [0, 1, 2].map(index => {
    const x = 7 + 13 * index + t * 26;
    const path = wavePath(27, 2.8 + index * .3, t * 10 + index);
    return `<path d="${path}" transform="translate(${x} ${121 + index * 11}) rotate(-58)" class="csl-effect-wave" opacity="${opacity}"/>`;
  }).join("");
  return waves + label("Heat", 17, 150, opacity);
}

function repair(effect: MolecularEffect, t: number) {
  const { pathway, index } = effect;
  const point = lesionPoint(pathway);
  const before = lesionPoint(pathway, -1);
  const after = lesionPoint(pathway, 1);
  const approach = ease(progress(t, 0, .31));
  const cut = progress(t, .32, .69);
  const release = ease(progress(t, .72, 1));
  const x = point.x + (1 - approach) * 18 + release * 9;
  const y = point.y - (1 - approach) * 13 + release * 7;
  const opacity = 1 - progress(t, .87, 1);
  const strand = `M${before.x} ${before.y}L${point.x} ${point.y}L${after.x} ${after.y}`;
  const fragment = pathway === "ner"
    ? `<path class="csl-effect-fragment" d="M${point.x} ${point.y}L${after.x} ${after.y}"/>`
    : `<circle cx="${point.x}" cy="${point.y}" r="1.6" class="csl-base-damage"/>`;
  const removed = pathway !== "breaks" && cut < 1 ? `<g opacity="${1 - cut}"
    transform="translate(${cut * -10} ${cut * -9})">${fragment}</g>` : "";
  const patch = cut > 0 ? `<g transform="translate(${point.x} ${point.y})">${ring(5.1 + cut * 6, 1 - cut)}</g>
    <path class="csl-effect-patch" opacity="${1 - release}" d="${strand}"/>${removed}` : "";
  return patch + `<g transform="translate(${x} ${y})" opacity="${opacity}">
    <path class="csl-repair-enzyme" fill-rule="evenodd"
      d="M-5.6-1.5q0-4 4.1-4h4.2q3.4 0 3.4 3.8v2.9q0 4.3-4.5 4.3h-3q-4.2 0-4.2-3.7ZM-2.7.1a2.7 2.4 0 1 0 5.4 0 2.7 2.4 0 1 0-5.4 0Z"/>
    <path class="csl-repair-notch" d="M-3.5-3.3q.7-.9 1.9-.9m4.3 8.1q1-.2 1.4-1.3"/>
  </g><g transform="translate(${point.x} ${point.y}) rotate(${-DNA_SEGMENTS[index].angle})">
    ${label(pathway === "ner" ? "UV repair" : pathway === "ber" ? "Base repair" : "Break repair", 11, -13, 1 - progress(t, .72, .86))}
  </g>`;
}

function folding(effect: ProteinEffect, t: number) {
  const { kind, index } = effect;
  const refolding = kind === "refold";
  const fold = refolding ? ease(progress(t, .27, .73)) : 1 - ease(progress(t, .04, .80));
  const close = ease(progress(t, .06, .36));
  const release = ease(progress(t, .73, 1));
  const opacity = 1 - progress(t, .86, 1);
  const jaw = (1 - close) * 7 + release * 6;
  const clamp = refolding ? `<path class="csl-hsp-jaw" transform="translate(${-jaw} 0)" d="M-4.1-7.6c-3.6.2-5.6 2.8-5.6 7.3 0 4.4 2.1 7.2 5.6 7.7"/>
    <path class="csl-hsp-jaw" transform="translate(${jaw} 0)" d="M4.1-7.6c3.6.2 5.6 2.8 5.6 7.3 0 4.4-2.1 7.2-5.6 7.7"/>` : "";
  const labelText = refolding ? "HSP70 refolding" : "Unfolding";
  return `<g opacity="${opacity}">
    ${clamp}
    <path class="csl-live-protein" d="${proteinStrand(fold)}" style="stroke:${fold > .55 ? "var(--csl-ochre)" : "var(--csl-stain)"}"/>
    <g transform="rotate(${-proteinSites[index].angle})">${label(labelText, 0, refolding ? -14 : 16, 1, "middle")}</g>
  </g>`;
}

function render(effect: Effect, layers: EffectLayers): LayerMarkup | undefined {
  const t = effect.age / durations[effect.kind];
  switch (effect.kind) {
    case "uv":
    case "uv-block":
    case "xray": return radiation(effect, layers);
    case "heat": return { layer: layers.exposure, markup: heat(t) };
    case "damage": {
      const point = lesionPoint(effect.pathway);
      return { layer: layers.dna[effect.index], markup: `<g class="csl-dna-impact" transform="translate(${point.x} ${point.y})">${impact(t, 8)}</g>` };
    }
    case "repair": return { layer: layers.dna[effect.index], markup: repair(effect, t) };
    case "unfold":
    case "refold": return { layer: layers.proteins[effect.index], markup: folding(effect, t) };
  }
}

export const cellViews = {
  cell: { x: 0, y: 0, scale: 1 },
  dna: { x: -127, y: -46, scale: 2 },
  proteins: { x: -53, y: -135, scale: 2 },
} as const;

function effectInView(effect: Effect, focus: Focus) {
  if (effect.kind === "unfold" || effect.kind === "refold") return proteinInView(effect.index, focus);
  return focus !== "proteins" && (focus === "cell" || effect.kind !== "heat");
}

function responseAllowsEffect(effect: Effect, responses: CellSample["responses"]) {
  if (effect.kind === "repair") return responses[effect.pathway];
  return effect.kind !== "refold" || responses.hsp;
}

function stillFrame(effect: Effect): Effect {
  const age = effect.kind === "uv" || effect.kind === "uv-block" || effect.kind === "xray"
    ? TRAVEL_END + 60
    : durations[effect.kind] * (effect.kind === "damage" ? .25 : .53);
  return { ...effect, age };
}

function drawEffects(layers: EffectLayers, painted: Map<SVGGElement, string>, effects: readonly Effect[], focus: Focus) {
  const next = new Map<SVGGElement, string>();
  for (const effect of effects) {
    if (effect.age < 0 || !effectInView(effect, focus)) continue;
    const frame = render(effect, layers);
    if (!frame?.layer) continue;
    const pathway = "pathway" in effect ? ` data-pathway="${effect.pathway}"` : "";
    const markup = `<g class="csl-effect" data-effect="${effect.kind}"${pathway}>${frame.markup}</g>`;
    next.set(frame.layer, (next.get(frame.layer) ?? "") + markup);
  }
  // React owns the molecules and the empty effect groups. The frame loop fills those groups.
  for (const [layer, markup] of next) {
    if (painted.get(layer) !== markup) layer.innerHTML = markup;
  }
  for (const layer of painted.keys()) {
    if (!next.has(layer)) layer.replaceChildren();
  }
  return next;
}

export function useCellEffects(
  layers: RefObject<EffectLayers>,
  sample: CellSample,
  running: boolean,
  focus: Focus,
) {
  const active = useRef<Effect[]>([]);
  const still = useRef<Effect[] | undefined>(undefined);
  const painted = useRef(new Map<SVGGElement, string>());
  const lastTick = useRef(-1);
  const lastActivity = useRef<readonly CellActivity[]>([]);

  useEffect(() => {
    const allowed = (effect: Effect) => responseAllowsEffect(effect, sample.responses);
    active.current = active.current.filter(allowed);
    still.current = still.current?.filter(allowed);
    // Editing a case can replace the preview with a different cell at the same tick.
    if (sample.tick <= lastTick.current && sample.activity !== lastActivity.current) {
      active.current = [];
      still.current = undefined;
      lastTick.current = -1;
    }
    lastActivity.current = sample.activity;
    if (!sample.activity.length) {
      active.current = [];
      still.current = undefined;
      lastTick.current = sample.tick;
      painted.current = drawEffects(layers.current, painted.current, [], focus);
      return;
    }
    const unseen = sample.activity.filter(activity => activity.tick > lastTick.current);
    lastTick.current = sample.tick;
    const additions = [];
    for (const step of unseen) {
      const effects = effectBatch(step, sample, focus, active.current);
      if (effects.length) {
        additions.push(...effects);
        active.current = [...active.current, ...effects].slice(-LIMIT);
      }
    }
    if (!running) {
      if (additions.length) still.current = additions.map(stillFrame);
      painted.current = drawEffects(layers.current, painted.current, still.current ?? active.current, focus);
    }
  }, [focus, layers, running, sample]);

  useEffect(() => {
    if (!running) return;
    still.current = undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let previous = 0;

    function draw(now: number) {
      if (document.hidden) {
        previous = 0;
        frame = requestAnimationFrame(draw);
        return;
      }
      const elapsed = previous ? Math.min(now - previous, 60) : 0;
      previous = now;
      active.current = active.current.filter(effect => {
        effect.age += elapsed;
        return effect.age < durations[effect.kind];
      });
      const effects = reducedMotion.matches ? active.current.map(stillFrame) : active.current;
      painted.current = drawEffects(layers.current, painted.current, effects, focus);
      frame = requestAnimationFrame(draw);
    }

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [focus, layers, running]);
}
