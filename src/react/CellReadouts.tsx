import {
  FATE_LABELS, isTerminal, RESCUE_EXPOSURE_TICKS, RESCUE_TOTAL_TICKS,
  type Cell, type CellActivity, type CellSample, type DeathCause, type LesionAmounts, type RescueProgress,
} from "../core/index.js";
import { formatQuantity, formatStressLevel, type ReadoutUnit } from "./units.js";

export type CellView = "cell" | "dna" | "proteins";

const views: { id: CellView; name: string; title: string; description: string }[] = [
  { id: "cell", name: "Whole cell", title: "Live cell", description: "" },
  { id: "dna", name: "DNA", title: "DNA in the nucleus", description: "UV can link neighboring bases on one strand. Nucleotide excision repair removes the damaged segment, then the cell copies the intact strand to fill the gap." },
  { id: "proteins", name: "Proteins", title: "Protein refolding", description: "Heat can unfold a protein. HSP70 uses ATP to bind and release the chain, helping some proteins fold again." },
];

const measures = [
  { label: "UV photolesions", key: "photolesions", tone: "dna", unit: "dna" },
  { label: "Oxidized bases", key: "oxidizedBases", tone: "dna", unit: "dna" },
  { label: "DNA breaks", key: "breaks", tone: "dna", unit: "dna" },
  { label: "Unfolded proteins", key: "unfolded", tone: "protein", unit: "protein" },
  { label: "Oxidized proteins", key: "damagedProteins", tone: "protein", unit: "protein" },
  { label: "Aggregates", key: "aggregates", tone: "protein", unit: "protein" },
  { label: "ER folding load", key: "erLoad", tone: "protein", unit: "er" },
  { label: "Available ATP", key: "energy", tone: "energy", unit: "atp" },
  { label: "Replication stress", key: "forkStress", tone: "dna", unit: "replication" },
  { label: "Membrane pressure", key: "pressure", tone: "protein", unit: "pressure" },
  { label: "Fixed mutations", key: "mutations", tone: "dna", unit: "count" },
] as const satisfies readonly { label: string; key: keyof Cell; tone: string; unit: ReadoutUnit | "count" }[];

const keyItems = [
  { id: "uv", label: "UV", path: "M1 6q2-7 4 0t4 0 4 0" },
  { id: "lesion", label: "DNA lesion", path: "m3 3 8 6m0-6L3 9" },
  { id: "repair", label: "DNA repair", path: "M4 6h6M7 3v6m0-8a5 5 0 1 1 0 10 5 5 0 1 1 0-10" },
  { id: "refold", label: "HSP70", path: "M4 2C.8 2 .8 10 4 10m6-8c3.2 0 3.2 8 0 8M4.6 7.5Q7 3 9.4 7.5" },
] as const;

function amount(lesions: LesionAmounts | undefined) {
  return lesions ? lesions.photolesions + lesions.oxidizedBases + lesions.breaks : 0;
}

export function CellViewControls({ view, select, terminal }: {
  view: CellView; select: (view: CellView) => void; terminal: boolean;
}) {
  return <div className="csl-views" role="group" aria-label="Cell view">
    {views.map(item => <button key={item.id} type="button" aria-pressed={item.id === view}
      disabled={terminal && item.id !== "cell"} onClick={() => select(item.id)}>{item.name}</button>)}
  </div>;
}

export function CellLegend() {
  return <ul className="csl-legend" aria-label="Live effect key">
    {keyItems.map(({ id, label, path }) => <li key={id} data-key={id}>
      <svg viewBox="0 0 14 12" width="15" height="13" aria-hidden="true"><path d={path} /></svg>{label}
    </li>)}
  </ul>;
}

const deathDetails: Record<DeathCause, string> = {
  "er-overload": "Persistent folding overload in the endoplasmic reticulum triggered apoptosis.",
  "dna-breaks": "Too many DNA strand breaks persisted and triggered apoptosis.",
  "protein-damage": "Unfolded and aggregated proteins overwhelmed the cell and triggered apoptosis.",
  "energy-failure": "ATP stayed too low to sustain the cell.",
};

export function CellStatus({ sample, running, paused, setup, progress, labels, toggleLabels, view }: {
  sample: CellSample; running: boolean; paused: boolean; setup: boolean; progress?: RescueProgress;
  labels: boolean; toggleLabels: (labels: boolean) => void; view: CellView;
}) {
  const { cell, tick } = sample;
  const fate = cell.altered && cell.fate === "cycling" ? "Altered growth control" : FATE_LABELS[cell.fate];
  const terminal = isTerminal(cell.fate);
  if (terminal) return <div className="csl-cell-death" role="alert">
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 12a7 7 0 0 1 4-6.3m6 .1a7 7 0 0 1 4 6.2m-4.2 6.4a7 7 0 0 1-5.6 0M9.5 9.5l5 5m0-5-5 5" /></svg>
    <div><strong>Cell died · {fate}</strong><p>{cell.deathCause ? deathDetails[cell.deathCause] : "Cell activity has stopped."}</p></div>
    <output aria-label="Model tick" aria-live="off">Tick {tick}</output>
  </div>;

  const state = setup ? "Preview" : progress?.status === "saved" ? "Cell saved" :
    progress?.status === "unrecovered" ? "Recovery incomplete" : paused ? "Paused" : running ? "Live" : "On hold";
  const phase = progress?.status === "exposure" ? "Exposure ends in " + (RESCUE_EXPOSURE_TICKS - progress.elapsed) + " ticks" :
    progress?.status === "recovery" ? "Recovery · " + (RESCUE_TOTAL_TICKS - progress.elapsed) + " ticks left" : undefined;
  return <div className="csl-cell-status">
    <span className="csl-live-state"><i data-running={running} aria-hidden="true" /><strong>{state}</strong><span>{fate}</span></span>
    {phase && <span className="csl-cell-phase">{phase}</span>}
    <output aria-label="Model tick" aria-live="off">Tick {tick}</output>
    {view === "cell" && <label className="csl-label-switch">
      <input type="checkbox" checked={labels} onChange={event => toggleLabels(event.currentTarget.checked)} />Cell labels
    </label>}
  </div>;
}

export function CellViewDescription({ view, sample }: { view: CellView; sample: CellSample }) {
  if (view === "cell") return null;
  const { cell, activity } = sample;
  const current = activity.at(-1);
  const { title, description } = views.find(item => item.id === view)!;
  return <div className="csl-focus-detail">
    <h2>{title}</h2>
    <p>{description}</p>
    {view === "dna" && <p className="csl-focus-reading">UV photolesions <strong>{formatQuantity("dna", cell.photolesions)}</strong>
      <span>DNA repair <strong>{formatQuantity("dna", amount(current?.repaired), true)}</strong></span>
    </p>}
    {view === "proteins" && <p className="csl-focus-reading">Unfolded proteins <strong>{formatQuantity("protein", cell.unfolded)}</strong>
      <span>HSP70 refolding <strong>{formatQuantity("protein", current?.refolded ?? 0, true)}</strong></span>
    </p>}
  </div>;
}

const processes: { label: string; tone: string; format: (activity?: CellActivity) => string }[] = [
  { label: "UV reaching cell", tone: "uv", format: step => formatStressLevel("uv", step?.uv ?? 0) },
  { label: "DNA damage formed", tone: "lesion", format: step => formatQuantity("dna", amount(step?.formed), true) },
  { label: "DNA repair", tone: "repair", format: step => formatQuantity("dna", amount(step?.repaired), true) },
  { label: "HSP70 refolding", tone: "refold", format: step => formatQuantity("protein", step?.refolded ?? 0, true) },
];

export function CellReadouts({ id, sample }: { id: string; sample: CellSample }) {
  const { cell, events, activity } = sample;
  const current = activity.at(-1);
  const terminal = isTerminal(cell.fate);
  return <section className="csl-readouts" aria-labelledby={id + "-readouts"}>
    <header className="csl-readout-heading">
      <h2 id={id + "-readouts"}>Readouts</h2>
      <span>Illustrative scales</span>
    </header>
    <dl className="csl-measures">
      {measures.map(({ label, key, tone, unit }) => <div key={key} className="csl-readout" data-tone={tone}>
        <dt>{label}</dt>
        <dd>{unit === "count" ? cell.mutations + (cell.mutations === 1 ? " mutation" : " mutations") : <>
          <span className="csl-meter" aria-hidden="true"><span style={{ width: `${cell[key] * 100}%` }} /></span>
          {formatQuantity(unit, cell[key])}
        </>}</dd>
      </div>)}
    </dl>
    {!terminal && <><h3 className="csl-activity-title">Activity this tick</h3>
    <dl className="csl-processes">
      {processes.map(({ label, tone, format }) => <div key={tone} className="csl-process" data-key={tone}>
        <dt>{label}</dt><dd>{format(current)}</dd>
      </div>)}
    </dl></>}
    <p className="csl-generation">Generation {cell.generation}</p>
    {!terminal && events.length > 0 && <p className="csl-last-event" aria-live="polite">{events.at(-1)?.text}</p>}
  </section>;
}
