import { memo, useId, useRef } from "react";
import {
  CELL_MEMBRANE, CELL_NUCLEUS, CELL_VIEW_HEIGHT, CELL_VIEW_WIDTH, cellTone, dnaBackbone,
  DNA_DAMAGE_RUNG, DNA_RUNG_COUNT, DNA_SEGMENTS, dnaRung, isTerminal, MITOCHONDRIA,
  proteinStrand, randomAt, type Cell, type CellSample,
} from "../core/index.js";
import { lesionPoint, proteinSites, showsLesion, showsUnfolding } from "./molecular-sites.js";
import { cellViews, useCellEffects, type EffectLayers } from "./useCellEffects.js";

const ER = [
  "M112 49C102 51 100 58 101 68c1 7-2 13-5 18",
  "M125 37C113 35 107 41 103 46c-5 7-9 11-8 22 1 6-3 13-6 18",
  "M115 34c-13 2-17 9-23 17-7 9-3 16-5 24-1 4-5 8-5 14 1 5 6 7 12 9",
  "M101 38c-11 6-20 15-22 25-2 7 2 12-3 19M87 98c5 5 13 8 20 8",
  "M150 36c9 2 16 6 22 12 5 6 5 13 10 16",
  "M163 33c10 5 15 7 20 14 5 8 6 14 12 20",
  "M166 44c3 6 9 9 10 16 1 9-4 13 3 22",
  "M178 86c-4 12-13 18-24 21-9 2-18 1-23 5",
  "M169 93c-4 5-10 8-15 9-7 1-16 1-22 5",
  "M165 105c-7 6-16 8-28 9-5 0-8 3-13 4",
] as const;
const smoothER = [
  "M176 93c8-1 7 7 13 10 6 4 14-2 19 3s-3 9-3 16M188 103c5-5 6-11 12-12 8-2 10 4 17 0",
  "M176 109c10-9 18 1 18 9 0 7-8 8-8 14m8-14c9-2 13 4 19 1",
  "M82 90c-9 4-12 0-18 6s-3 10-10 12m13-14c-6-5-11-2-17-5",
] as const;
const nuclearOutline = "M101 72C100 60 106 49 116 44c9-5 19-6 30-1 9 4 19 11 22 22 4 12-2 25-12 31-9 6-21 7-31 4-14-4-23-14-24-28Z";
const chromatin = [
  "M106 70c0-9 6-16 14-19m-13 27c0 7 8 14 16 17m-2-47c8-6 17-4 23 0m3 1c7 1 13 7 15 13m-3 19c-3 4-5 6-10 8m-9 8c10-3 17-6 21-14",
  "M114 57c6 4 2 13 9 15s8-5 12-4 4 9 9 9 7-6 12-8m-20 13c-4 6-10 4-14 3s-6 1-5 6m22-39c-5 3-3 8 0 10s7-6 11-4",
  "M115 68c-5 3-1 8 5 9s6 6 12 6m18-32c-5 4 5 7 6 12m-24 32c5 1 6-5 11-5s9 1 12-4",
] as const;
const nuclearPores = [[104, 58], [102, 70], [105, 82], [112, 91], [121, 97], [132, 100], [143, 100],
  [153, 96], [161, 89], [166, 80], [169, 70], [165, 60], [159, 53], [151, 48], [142, 43], [129, 41], [117, 44], [110, 49]] as const;
const ribosomeSites = [[102, 42], [105, 39], [109, 36], [114, 35], [119, 35], [97, 47], [94, 53], [92, 58],
  [83, 59], [82, 64], [84, 69], [85, 78], [80, 85], [79, 90], [82, 94], [88, 101], [94, 105],
  [101, 108], [106, 108], [173, 37], [178, 40], [183, 44], [186, 49], [188, 55], [191, 61], [195, 64],
  [176, 92], [171, 97], [164, 103], [157, 107], [149, 110], [145, 113], [139, 116], [132, 116], [127, 119]] as const;
const vesicles = [[47, 102, 3.7], [53, 85, 2.1], [88, 118, 2.7], [93, 134, 4.1], [149, 30, 2.4], [198, 55, 3.4],
  [200, 83, 1.9], [171, 112, 3.1], [184, 133, 5.2], [228, 107, 4.1], [223, 70, 2.5], [160, 146, 2.8], [108, 123, 1.8]] as const;
const golgi = { x: 70, y: 54, angle: 18 };
const golgiAngle = golgi.angle * Math.PI / 180;
// Midpoint of the first cubic in the top cisterna.
const golgiCisterna = [-5.625, 1.375] as const;
const golgiAnchor = [
  golgi.x + golgiCisterna[0] * Math.cos(golgiAngle) - golgiCisterna[1] * Math.sin(golgiAngle),
  golgi.y + golgiCisterna[0] * Math.sin(golgiAngle) + golgiCisterna[1] * Math.cos(golgiAngle),
] as const;
const apoptoticBodies = [
  { x: 96, y: 80, scale: 1, rotation: -12, chromatin: true },
  { x: 160, y: 93, scale: .76, rotation: 32, chromatin: true },
  { x: 126, y: 128, scale: .57, rotation: -22, chromatin: false },
  { x: 196, y: 64, scale: .43, rotation: 35, chromatin: false },
  { x: 186, y: 122, scale: .31, rotation: 19, chromatin: false },
  { x: 61, y: 115, scale: .29, rotation: -32, chromatin: false },
  { x: 128, y: 43, scale: .25, rotation: 22, chromatin: false },
] as const;
const rungs = Array.from({ length: DNA_RUNG_COUNT }, (_, index) => dnaRung(index));
const leftBackbone = dnaBackbone("left");
const rightBackbone = dnaBackbone("right");
const rightPoints = rightBackbone.split(" ");
const brokenBackbone = [
  rightPoints.slice(0, DNA_DAMAGE_RUNG).join(" "),
  rightPoints.slice(DNA_DAMAGE_RUNG + 1).join(" "),
];
const proteinOpen = proteinStrand(0);
const proteinRibbons = [
  "M-6 2c-3-5 2-9 6-7 3 2-3 6 1 8 4 3 8-2 5-6M-4 4c2 3 6 2 7 0",
  "M-6 2c-1-3 1-5 4-6 4-2 6 3 2 4s-5 3-3 5c3 2 6-1 8-6",
  "M-5 3c-3-6 4-9 7-6 2 2-4 4-3 7 1 2 7 0 7-3",
] as const;
const aggregateShape = [[0, 0, 2.6], [-3, 2, 1.8], [3, 1.8, 2.1], [-1, -2.8, 1.9],
  [1.5, 4, 1.4], [4.5, -1.5, 1.6], [-4.5, -1.4, 1.3], [3.2, -3.4, 1.3]] as const;
function granules(count: number, seed: number) {
  return Array.from({ length: count }, (_, index) => ({
    cx: randomAt(seed, index),
    cy: randomAt(seed + 55, index),
    r: .17 + randomAt(seed + 103, index) ** 2 * .72,
    opacity: .1 + randomAt(seed + 243, index) * .75,
  }));
}

const cytoplasmGranules = granules(380, 772).map(point => ({ ...point, cx: 18 + point.cx * 240, cy: 20 + point.cy * 145 }));
const chromatinGranules = granules(170, 539).map(point => ({ ...point, cx: 101 + point.cx * 68, cy: 41 + point.cy * 60 }));
const mitochondrialProfiles = [
  ...MITOCHONDRIA.map(([x, y, angle], index) => ({ x, y, angle, size: [1.12, 1.22, 1.03, .91][index], depth: 1 })),
  { x: 44, y: 109, angle: 69, size: .66, depth: .56 },
  { x: 209, y: 133, angle: -31, size: .92, depth: .89 },
  { x: 229, y: 93, angle: 47, size: .72, depth: .68 },
  { x: 114, y: 138, angle: 25, size: .62, depth: .55 },
] as const;
const mitochondrialSections = [
  {
    outer: "M-15 1c0-4 4-7 9-6 4 1 10-2 15-1 5 0 7 2 7 5-1 4-7 6-12 6-4 0-8 2-12 1-4-1-7-2-7-5Z",
    inner: "M-12 1c0-3 3-4 6-3 5 1 10-2 15-2 3 0 5 1 5 3-1 3-5 4-10 4-5 0-9 2-13 1-2 0-3-1-3-3Z",
    cristae: "M-10-2q-1 5 2 5t2-5m2 0q-1 5 2 5t2-5m2-1q-1 5 2 5t2-6m2 0q-1 5 2 4t2-4",
  },
  {
    outer: "M-15-1c1-4 6-6 11-6 5 0 7 3 11 4 4 2 8 3 9 6 0 4-5 6-10 5C1 7-1 4-6 5c-6 0-10-2-9-6Z",
    inner: "M-12-1c1-3 5-4 9-4 4 1 5 3 9 4 3 2 7 3 7 5-1 2-4 3-7 2-5-1-8-4-12-4-3 1-7 0-6-3Z",
    cristae: "M-10-4q1 5 4 5t2-5m1 0q2 5 4 5t2-3m3 1q-1 5 2 5t3-2",
  },
  {
    outer: "M-10 0c0-5 5-8 10-8 6 0 10 5 10 9-1 5-4 7-10 7-4 0-9-3-10-8Z",
    inner: "M-8 0c0-4 4-6 8-6 4 0 7 3 8 7-1 4-5 5-8 5-4 0-7-2-8-6Z",
    cristae: "M-5-4q-1 6 3 7t2-8m2 0q-1 5 2 7t2-4",
  },
] as const;

const CellGradients = memo(function CellGradients({ id }: { id: string }) {
  return <>
    <clipPath id={id + "-clip"}><path d={CELL_MEMBRANE} /></clipPath>
    <clipPath id={id + "-nuclear-clip"}><path d={nuclearOutline} /></clipPath>
    <radialGradient id={id + "-cytoplasm"} cx="39%" cy="38%" r="67%">
      <stop offset="0" className="csl-cytoplasm-center" />
      <stop offset=".56" className="csl-cytoplasm-mid" />
      <stop offset="1" className="csl-cytoplasm-rim" />
    </radialGradient>
    <radialGradient id={id + "-nucleus"} cx="39%" cy="37%" r="67%">
      <stop offset="0" stopColor="oklch(88% .057 319)" />
      <stop offset=".56" stopColor="oklch(75% .085 316)" />
      <stop offset=".88" stopColor="oklch(59% .108 311)" />
      <stop offset="1" stopColor="oklch(44% .100 310)" />
    </radialGradient>
    <radialGradient id={id + "-nucleolus"} cx="37%" cy="27%" r="78%">
      <stop offset="0" stopColor="oklch(69% .110 335)" />
      <stop offset=".58" stopColor="oklch(49% .110 322)" />
      <stop offset="1" stopColor="oklch(35% .108 315)" />
    </radialGradient>
    <linearGradient id={id + "-mitochondrion"} x2="15%" y2="100%">
      <stop offset="0" stopColor="oklch(89% .051 169)" />
      <stop offset=".48" stopColor="oklch(73% .088 174)" />
      <stop offset="1" stopColor="oklch(46% .076 174)" />
    </linearGradient>
    <radialGradient id={id + "-vesicle"} cx="35%" cy="31%" r="73%">
      <stop offset="0" stopColor="oklch(92% .04 66)" />
      <stop offset=".64" stopColor="oklch(75% .071 54)" />
      <stop offset="1" stopColor="oklch(55% .088 43)" />
    </radialGradient>
    <radialGradient id={id + "-lysosome"} cx="37%" cy="31%" r="71%">
      <stop offset="0" stopColor="oklch(84% .078 52)" />
      <stop offset=".55" stopColor="oklch(66% .113 35)" />
      <stop offset="1" stopColor="oklch(43% .097 25)" />
    </radialGradient>
    <radialGradient id={id + "-volume"} cx="38%" cy="26%" r="70%">
      <stop offset="0" stopColor="oklch(99% .012 69)" stopOpacity=".46" />
      <stop offset=".58" stopColor="oklch(87% .031 40)" stopOpacity="0" />
      <stop offset="1" stopColor="oklch(35% .065 315)" stopOpacity=".22" />
    </radialGradient>
    <radialGradient id={id + "-condensed"} cx="34%" cy="31%" r="77%">
      <stop offset="0" stopColor="oklch(78% .081 22)" />
      <stop offset="1" stopColor="oklch(51% .112 16)" />
    </radialGradient>
    <radialGradient id={id + "-rupture"} cx="40%" cy="37%" r="68%">
      <stop offset="0" stopColor="oklch(85% .015 256)" stopOpacity=".93" />
      <stop offset=".76" stopColor="oklch(67% .043 240)" stopOpacity=".83" />
      <stop offset="1" stopColor="oklch(54% .049 240)" stopOpacity=".36" />
    </radialGradient>
    <filter id={id + "-texture"} x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".64" numOctaves="3" seed="52" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
  </>;
});

function paint(id: string, gradient: string) {
  return "url(#" + id + "-" + gradient + ")";
}

const CellInterior = memo(function CellInterior({ id }: { id: string }) {
  return <>
    <g className="csl-cytoplasm-grain">
      {cytoplasmGranules.map((point, index) => <circle key={index} {...point} />)}
    </g>
    <g className="csl-cytoskeleton">
      <path d="M47 111C69 98 88 111 109 112c44 2 69-15 114-62M44 120c39 12 74 6 109-1 30-6 54 4 76 18M61 60c12 13 33 19 57 31 22 12 70 24 119 18" />
      <path d="M68 141c22-11 53-13 83-15 32-2 68-18 90-38M55 99c25 44 70 39 112 48M83 50c-21 13-39 39-34 63m123 36c30-4 55-21 68-39" />
    </g>
    <g className="csl-vesicles" fill={paint(id, "vesicle")}>
      {vesicles.map(([cx, cy, r]) => <g key={cx}>
        <circle cx={cx} cy={cy} r={r} />
        <path className="csl-vesicle-edge" d="M-.54-.22q.23-.55 .72-.48"
          transform={`translate(${cx} ${cy}) scale(${r})`} vectorEffect="non-scaling-stroke" />
      </g>)}
    </g>
    <g className="csl-lysosomes" fill={paint(id, "lysosome")}>
      <path d="M211 61c-1-4 3-7 6-7s6 3 5 7c-1 4-4 6-7 4-2 0-4-2-4-4Z" />
      <path d="M159 135c-1-3 3-7 7-7 4 1 6 3 5 7-1 3-3 5-7 5-2 0-4-2-5-5Z" />
      <path d="M57 123q-3-5 2-8t7 4q1 5-4 6-3 1-5-2Z" />
      <g className="csl-lysosome-granules">
        <circle cx="215" cy="58" r="1" /><circle cx="219" cy="61" r=".75" />
        <circle cx="164" cy="133" r="1.05" /><circle cx="167" cy="135" r=".86" /><circle cx="164.5" cy="137" r=".58" />
        <circle cx="61" cy="118" r=".85" /><circle cx="63" cy="121" r=".59" />
      </g>
    </g>
    <g className="csl-golgi" transform={`translate(${golgi.x} ${golgi.y}) rotate(${golgi.angle})`}>
      {[0, 1, 2, 3, 4, 5].map(layer => <g key={layer} transform={"translate(0 " + layer * 2.55 + ") scale(" + (1 - layer * .055) + " 1)"}>
        <path className="csl-golgi-rim" d="M-14-3C-10 1-5 3 0 2c5-1 8-4 12-7" />
        <path className="csl-golgi-lumen" d="M-14-3C-10 1-5 3 0 2c5-1 8-4 12-7" />
      </g>)}
      <circle cx="-17" cy="1" r="1.45" /><circle cx="14" cy="5" r="1.05" />
      <circle cx="-14.5" cy="12" r="1.1" /><circle cx="9" cy="12" r="1.52" />
      <circle cx="19" cy="2" r=".87" /><circle cx="18" cy="10" r="1.12" />
    </g>
  </>;
});

const NuclearStructure = memo(function NuclearStructure({ id }: { id: string }) {
  const { x, y, rx, ry } = CELL_NUCLEUS;
  return <>
    <path d={nuclearOutline} className="csl-detail-nucleus" fill={paint(id, "nucleus")} />
    <g clipPath={paint(id, "nuclear-clip")}>
      <ellipse className="csl-nuclear-inner" cx={x} cy={y} rx={rx - 2} ry={ry - 1.6} />
      <g className="csl-chromatin-granules">
        {chromatinGranules.map((point, index) => <circle key={index} {...point} />)}
        <path opacity=".44" d="M103 61q3-9 9-12-4 5-3 9t-6 3Zm4 23q3-3 5 2 2 4 8 8-8-1-13-10Zm35 15q8-3 12-8 2-2 5-1-7 9-17 9Zm17-46q9 6 9 14-3-3-5-6t-4-8Z" />
      </g>
      <g className="csl-nuclear-texture">{chromatin.map(path => <path key={path} d={path} />)}</g>
      <g className="csl-nucleolus" fill={paint(id, "nucleolus")}>
        <path d="M124 73c-1-4 4-8 8-8 3 0 3 2 7 2 5 2 7 5 5 8-2 4-8 7-13 5-4-1-6-3-7-7Z" />
        <path className="csl-nucleolar-grain" d="M127 73q6-5 10-2t4 5m-11-7q2-2 6-1m-5 10 5 1" />
      </g>
    </g>
    <g className="csl-nuclear-pores" fill="none">
      {nuclearPores.map(([cx, cy]) => <circle key={cx + "," + cy} cx={cx} cy={cy} r=".82" />)}
    </g>
  </>;
});

function Nucleus({ cell, id, effects }: { cell: Cell; id: string; effects: EffectLayers }) {
  const damaged = lesionPoint("ner");
  const neighbor = lesionPoint("ner", 1);
  const base = lesionPoint("ber");
  return <g className="csl-nucleus">
    <NuclearStructure id={id} />
    {DNA_SEGMENTS.map(({ x, y, angle }, index) => {
      const dimer = showsLesion("ner", index, cell.photolesions);
      const broken = showsLesion("breaks", index, cell.breaks);
      const oxidized = showsLesion("ber", index, cell.oxidizedBases);
      return <g className="csl-dna-segment" data-dna-site={index} data-damaged={broken || dimer || oxidized} key={index}
        transform={`translate(${x} ${y}) rotate(${angle})`}>
        <g className="csl-dna-strand">
          <polyline points={leftBackbone} className="csl-dna-backbone" />
          {(broken ? brokenBackbone : [rightBackbone]).map(points =>
            <polyline key={points} points={points} className="csl-dna-backbone" />)}
          {rungs.map(({ left, right }, rung) => rung !== DNA_DAMAGE_RUNG || !broken
            ? <line className="csl-dna-rung" key={rung} x1={left.x} y1={left.y} x2={right.x} y2={right.y}
              stroke={rung % 3 === 1 ? "var(--csl-stain)" : "var(--csl-purple)"} />
            : null)}
          {broken && <path className="csl-lesion" d={`M${damaged.x - 1.8} ${damaged.y + 1.8}l3.6-3.6m-1.5 4.4 2.8-2.8`} />}
          {dimer && <g className="csl-uv-lesion">
            <path d={`M${damaged.x} ${damaged.y}L${neighbor.x} ${neighbor.y}`} />
            <circle cx={damaged.x} cy={damaged.y} r="1.45" />
            <circle cx={neighbor.x} cy={neighbor.y} r="1.45" />
          </g>}
          {oxidized && <circle className="csl-base-damage" cx={base.x} cy={base.y} r="1.6" />}
          {cell.mutations > 0 && index === 0 && <circle className="csl-fixed-mutation" cx={rungs[6].left.x} cy={rungs[6].left.y} r="1.9" />}
        </g>
        <g className="csl-effects" ref={node => { effects.dna[index] = node; }} />
      </g>;
    })}
  </g>;
}

const EndoplasmicReticulum = memo(function EndoplasmicReticulum({ loaded }: { loaded: boolean }) {
  return <g className="csl-er" data-loaded={loaded}>
    <g className="csl-er-smooth">{smoothER.map(path => <path key={path} d={path} />)}</g>
    {ER.map(path => <g key={path}>
      <path className="csl-er-wall" d={path} />
      <path className="csl-er-lumen" d={path} />
    </g>)}
    <g className="csl-ribosomes">{ribosomeSites.map(([cx, cy]) => <circle key={cx + "," + cy} cx={cx} cy={cy} r=".61" />)}</g>
    {loaded && <path d="M84 81q-8-5-6-13t-2-11m99 39q10-2 15-12t5-13" className="csl-er-load" />}
  </g>;
});

const Mitochondria = memo(function Mitochondria({ id, energy, labels }: { id: string; energy: number; labels: boolean }) {
  return <g className="csl-mitochondria">
    {mitochondrialProfiles.map(({ x, y, angle, size, depth }, index) => {
      const section = mitochondrialSections[index % mitochondrialSections.length];
      return <g key={x} transform={`translate(${x} ${y})`}>
        <g className="csl-mitochondrion" style={{ animationDelay: `${-index * .63}s` }}>
          <g transform={`rotate(${angle}) scale(${size})`} opacity={depth * (.32 + energy * .68)}>
            <path d={section.outer} className="csl-mito-shadow" transform="translate(.6 1.6)" />
            <path d={section.outer} className="csl-mito-shell" fill={paint(id, "mitochondrion")} />
            <path d={section.inner} className="csl-mito-inner" />
            <path d={section.cristae} className="csl-mito-folds" />
          </g>
          {labels && index === 1 && <AnatomyLabel name="Mitochondrion" anchor={[0, 0]}
            from={[77, 28]} elbow={[49, 28]} text={[103, 35]} align="end" />}
        </g>
      </g>;
    })}
  </g>;
});

function CellBody({ cell, id, labels, effects }: { cell: Cell; id: string; labels: boolean; effects: EffectLayers }) {
  const scale = cell.fate === "senescent" ? 1.035 : 1;
  const stretch = (1 + cell.pressure * .06) * scale;
  const squeeze = (1 - cell.pressure * .32) * scale;

  return <g className="csl-deformation" style={{ transform: `scale(${stretch}, ${squeeze})` }}>
    <g className="csl-cell-drift">
      <path className="csl-cell-shadow" d={CELL_MEMBRANE} transform="translate(1 4)" />
      <path className="csl-membrane-edge" d={CELL_MEMBRANE} />
      <path ref={node => { effects.membrane = node; }} className="csl-detail-membrane" d={CELL_MEMBRANE} fill={paint(id, "cytoplasm")} />
      <g clipPath={paint(id, "clip")}>
        <rect width={CELL_VIEW_WIDTH} height={CELL_VIEW_HEIGHT} className="csl-cell-grain-filter" filter={paint(id, "texture")} />
        <CellInterior id={id} />
        <EndoplasmicReticulum loaded={cell.erLoad > .25} />
        <Nucleus cell={cell} id={id} effects={effects} />
        <path className="csl-inner-membrane" d={CELL_MEMBRANE} transform="translate(137.5 94) scale(.972 .949) translate(-137.5 -94)" />
        <path className="csl-membrane-highlight" d="M26 88c8-11 10-34 33-42 12-4 20-1 34-5 21-5 41-16 59-16 13 0 27 6 35 10" />
        <g className="csl-protein-layer">
          {proteinSites.map(({ x, y, angle }, index) => {
            const unfolded = showsUnfolding(index, cell.unfolded);
            const damaged = cell.damagedProteins > randomAt(667, index);
            const strand = proteinRibbons[index % proteinRibbons.length];
            return <g key={x} transform={`translate(${x} ${y}) rotate(${angle})`}>
              <g className="csl-protein-motion" data-protein-site={index} style={{ animationDelay: `${-index * .47}s` }}>
                <g className="csl-protein-resting">
                  {!unfolded && !damaged && <path className="csl-protein-shadow" d={strand} />}
                  <path className={"csl-protein" + (unfolded ? " csl-unfolded" : "") + (damaged ? " csl-damaged-protein" : "")}
                    d={unfolded || damaged ? proteinOpen : strand} />
                  {!unfolded && !damaged && <path className="csl-protein-glint" d={strand} />}
                </g>
                <g className="csl-effects" ref={node => { effects.proteins[index] = node; }} />
              </g>
            </g>;
          })}
          {cell.aggregates > .05 && <g className="csl-aggregate" fill={paint(id, "lysosome")}
            transform={`translate(203 115) scale(${.55 + cell.aggregates * 1.1})`} opacity={Math.min(1, .60 + cell.aggregates)}>
            {aggregateShape.map(([cx, cy, r]) => <circle key={cx} cx={cx} cy={cy} r={r} />)}
          </g>}
        </g>
        <path d={CELL_MEMBRANE} fill={paint(id, "volume")} />
      </g>
      <Mitochondria id={id} energy={cell.energy} labels={labels} />
      {labels && <CellAnatomy />}
      <g className="csl-effects csl-membrane-effects" ref={node => { effects.membraneEffects = node; }} />
    </g>
  </g>;
}

function ApoptoticCell({ id }: { id: string }) {
  return <g className="csl-apoptotic-cell">
    {apoptoticBodies.map(({ x, y, scale, rotation, chromatin }) => <g className="csl-apoptotic-body" key={x}
      transform={"translate(" + x + " " + y + ") rotate(" + rotation + ") scale(" + scale + ")"}>
      <path className="csl-apoptotic-rim" fill={paint(id, "condensed")} d="M-29-1c-1-10 6-17 16-20 9-2 14-6 24-3 13 4 19 10 20 21 1 12-7 20-17 23-8 2-14 2-23 0-12-3-20-8-20-21Z" />
      <path className="csl-apoptotic-interior" d="M-25 1c-2-12 7-18 18-20 12-3 23 1 29 7 6 6 6 16-1 22-8 7-14 8-26 6-12-2-19-8-20-15Z" />
      <path className="csl-apoptotic-glint" d="M-24-4c1-8 7-13 15-15m20 36c7-3 10-5 13-11" />
      <g className="csl-apoptotic-grain">
        <circle cx="-14" cy="-12" r="1.2" /><circle cx="16" cy="-10" r="1.7" /><circle cx="-20" cy="1" r="1" />
        <circle cx="-14" cy="9" r="1.8" /><circle cx="17" cy="7" r="1.35" /><circle cx="4" cy="13" r="1.1" />
      </g>
      {chromatin ? <>
        <path className="csl-condensed-chromatin" d="M-12-3q3-7 11-7 5-1 9 3 3 3-1 7-8 6-15 2-6-2-4-5Zm19 9q6-3 8 0 2 3-3 5-6 2-5-5Z" />
        <circle className="csl-condensed-chromatin" cx="-12" cy="6" r="2.6" />
      </> : <path className="csl-dead-material" d="M-12 2q8-9 20-7m-6 10q9 2 12-5" />}
    </g>)}
  </g>;
}

function EnergyFailureCell({ id }: { id: string }) {
  return <g className="csl-energy-cell">
    <path className="csl-energy-cloud" fill={paint(id, "rupture")} d="M20 98C18 68 56 39 93 35c20-2 30-13 55-13 40-1 58 14 77 27 16 11 31 21 31 45 2 23-16 41-32 53-16 15-45 17-70 17-42 1-79-7-106-24-19-12-29-23-28-42Z" />
    <path className="csl-ruptured-membrane" d="M24 113C8 86 41 48 75 39m9-2c38-1 45-21 84-12 33 7 44 20 66 33m5 7c12 10 18 21 15 35m-7 14c-22 34-47 49-89 47m-15-1c-52 0-85-12-109-35" />
    <path className="csl-energy-nucleus" d="M97 77q-3-25 22-35 22-10 41 8 18 16 10 34-7 22-34 20-25 1-34-14Z" />
    <path className="csl-dead-material" d="M108 64q12-9 21-7m-11 33q11-7 22 0m-81 22q15-8 28-1m85 23q16-9 29-3m-3-58q12 0 21 10" />
    <path className="csl-dead-material" d="M42 103q8-15 18-17m-8 26c8-4 18-3 23 2m130 3c8-5 18 0 17 8m-162-55c8-11 23-9 30-3m44 82q15 4 29-3m21-15q25-9 37-20" />
    {cytoplasmGranules.filter((_, index) => index % 4 === 0).map((point, index) =>
      <circle className="csl-energy-grain" key={index} {...point} />)}
    <g className="csl-energy-debris">
      <circle cx="259" cy="111" r="2.1" /><circle cx="267" cy="117" r="1.6" /><circle cx="249" cy="124" r="2.7" />
      <circle cx="22" cy="122" r="1.6" /><circle cx="16" cy="128" r="1" /><circle cx="9" cy="117" r="2.1" />
      <circle cx="149" cy="168" r="2" /><circle cx="158" cy="171" r="1.1" />
    </g>
  </g>;
}

type LabelPoint = readonly [number, number];

function AnatomyLabel({ name, anchor, from, elbow, text, align = "start" }: {
  name: string; anchor: LabelPoint; from: LabelPoint; elbow: LabelPoint; text: LabelPoint; align?: "start" | "end";
}) {
  return <g className="csl-anatomy" data-organelle={name}>
    <path d={`M${from.join(" ")}L${elbow.join(" ")} ${anchor.join(" ")}`} />
    <circle className={name === "Membrane" ? "csl-membrane-anchor" : undefined} cx={anchor[0]} cy={anchor[1]} r="1.15" />
    <text x={text[0]} y={text[1]} textAnchor={align}>{name}</text>
  </g>;
}

function CellAnatomy() {
  return <>
    <AnatomyLabel name="Nucleus" anchor={[CELL_NUCLEUS.x + 12, CELL_NUCLEUS.y - 14]}
      from={[193, 29]} elbow={[170, 29]} text={[195, 30.5]} />
    {/* This is the endpoint of the lower-left curve on CELL_MEMBRANE. */}
    <AnatomyLabel name="Membrane" anchor={[42, 145]} from={[30, 159]} elbow={[30, 152]} text={[18, 167]} />
    {/* This is a junction on the upper-right rough ER sheet. */}
    <AnatomyLabel name="Rough ER" anchor={[183, 47]} from={[216, 43]} elbow={[198, 43]} text={[218, 44.5]} />
    <AnatomyLabel name="Golgi" anchor={golgiAnchor} from={[47, 34]} elbow={[62, 34]} text={[44, 36]} align="end" />
  </>;
}

export function CellDiagram({ sample, animating, labels, focus }: {
  sample: CellSample;
  animating: boolean;
  labels: boolean;
  focus: keyof typeof cellViews;
}) {
  const id = useId();
  const effects = useRef<EffectLayers>({ membrane: null, membraneEffects: null, exposure: null, dna: [], proteins: [] });
  const { cell } = sample;
  const terminal = isTerminal(cell.fate);
  useCellEffects(effects, sample, animating && !terminal, focus);
  const viewport = cellViews[focus];

  return <svg className="csl-cell-diagram" viewBox={`0 0 ${CELL_VIEW_WIDTH} ${CELL_VIEW_HEIGHT}`}
    aria-hidden="true" data-tone={cellTone(cell)} data-motion={animating && !terminal} data-fate={cell.fate} data-focus={focus}>
    <defs><CellGradients id={id} /></defs>
    <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
      {cell.fate === "apoptotic" ? <ApoptoticCell id={id} /> : cell.fate === "energy-failure" ? <EnergyFailureCell id={id} />
        : <CellBody cell={cell} id={id} labels={labels && focus === "cell"} effects={effects.current} />}
      {!terminal && <g ref={node => { effects.current.exposure = node; }} className="csl-effects csl-exposure-effects" />}
    </g>
  </svg>;
}
