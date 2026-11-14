import {
  compareRescueReadings, isRescueRunning, RESCUE_EXPOSURE_TICKS, RESCUE_STABLE_TICKS, RESCUE_TOTAL_TICKS, rescueFailureReading, rescueReadiness,
  RESPONSES, STRESSORS, type CellSample, type RescueCase, type RescueComparisonReading, type RescueFrame, type RescuePlan,
  type RescueProgress, type RescueResponseEffect,
} from "../core/index.js";
import { formatFailureReading, formatQuantity, formatReading, formatRescueReading, formatRescueTarget, formatStressLevel } from "./units.js";

type RescueComparison = { history: readonly RescueFrame[]; plan: RescuePlan; status: RescueProgress["status"] };
export type RescueSession =
  | { phase: "setup"; cause: RescueCase }
  | { phase: "run"; cause: RescueCase; progress: RescueProgress; history: readonly RescueFrame[]; comparison?: RescueComparison };

export function LabMode({ rescue, select }: { rescue: boolean; select: (rescue: boolean) => void }) {
  return <div className="csl-mode" role="group" aria-label="Lab mode">
    <button type="button" aria-pressed={!rescue} onClick={() => select(false)}>Free play</button>
    <button type="button" aria-pressed={rescue} onClick={() => select(true)}>Save the cell</button>
  </div>;
}

export function RescueSetup({ session, randomize, begin }: {
  session: RescueSession;
  randomize: () => void;
  begin: () => void;
}) {
  const { cause } = session;
  const caseLine = STRESSORS.filter(({ id }) => cause.mix[id] > 0)
    .map(({ id, label }) => label + " " + formatStressLevel(id, cause.mix[id])).join(" · ");
  return <div className="csl-rescue-setup">
    <div>
      <h2>{cause.name}</h2>
      <p>{caseLine || "Set a stressor above zero to start."}</p>
      {session.phase === "setup" && <p className="csl-rescue-instruction">Adjust the sliders for a custom case. Get the cell through {RESCUE_EXPOSURE_TICKS} ticks of exposure, then help it recover.</p>}
    </div>
    <div className="csl-rescue-actions">
      <button type="button" onClick={randomize}>Random case</button>
      {session.phase === "setup" && <button type="button" className="csl-primary csl-start-desktop" onClick={begin} disabled={!caseLine}>Start rescue</button>}
    </div>
  </div>;
}

function responseName(id: keyof CellSample["responses"]) {
  if (id === "cysteineSupport") return "Add cysteine";
  return RESPONSES.find(response => response.id === id)!.label;
}

export function RescueEffect({ effect, showResponse = false }: { effect: RescueResponseEffect; showResponse?: boolean }) {
  const better = effect.changes.filter(change => change.better);
  const worse = effect.changes.filter(change => !change.better);
  const highlights = [better[0], worse[0]].filter(change => change !== undefined);
  return <div className="csl-rescue-effect">
    {showResponse && <strong>{responseName(effect.response)} {effect.enabled ? "on" : "off"}</strong>}
    <p>Model estimate after {effect.ticks === 1 ? "1 tick" : effect.ticks + " ticks"}. Previous settings → new settings.</p>
    {highlights.map(change => <EffectReading key={change.label} change={change} />)}
    {effect.fate && <p>Cell state · {effect.fate.before} → {effect.fate.after}</p>}
    {!highlights.length && !effect.fate && <p>No measurable change at these stress levels.</p>}
    {showResponse && effect.changes.length > highlights.length && <details>
      <summary>Other changes</summary>
      {effect.changes.filter(change => !highlights.includes(change)).map(change => <EffectReading key={change.label} change={change} />)}
    </details>}
  </div>;
}

function EffectReading({ change }: { change: RescueResponseEffect["changes"][number] }) {
  return <p data-impact={change.better ? "better" : "worse"}>
    {change.better ? "Better" : "Worse"} · {change.label} <b>{formatReading(change.unit, change.beforeFraction)} → {formatQuantity(change.unit, change.afterFraction)}</b>
  </p>;
}

function RescueDebrief({ sample, progress, retryPlan, onRetry }: {
  sample: CellSample;
  progress: RescueProgress;
  retryPlan?: RescuePlan;
  onRetry: () => void;
}) {
  const missed = rescueReadiness(sample.cell).filter(target => !target.ready);
  const failure = rescueFailureReading(sample.cell);
  return <div className="csl-rescue-debrief">
    <h3>What needed fixing</h3>
    {failure && <p><strong>{failure.label} was {formatFailureReading(failure)} when the cell died.</strong></p>}
    {!failure && missed.length > 0 && <p>{missed.map(target => target.label).join(", ")} still needed attention.</p>}
    {!failure && !missed.length && <p>The cell reached its targets too late. It held them for {progress.stableTicks} of the {RESCUE_STABLE_TICKS} required ticks.</p>}
    {retryPlan ? <>
      <h3>Try on the next run</h3>
      {retryPlan.responses.length ? <>
        <p>This combination saved the same case in the model.</p>
        <ul className="csl-rescue-plan">{retryPlan.responses.map(id => <li key={id}>{responseName(id)}</li>)}</ul>
      </> : <p>The same case recovered with all responses off.</p>}
      <button type="button" className="csl-primary csl-rescue-retry" onClick={onRetry}>Retry with suggested responses</button>
    </> : <p>No fixed combination of up to three responses saved this setup in the model. Lower the stressors or try swapping responses during the run.</p>}
  </div>;
}

function RescueComparisonTable({ sample, comparison, history, progress }: {
  sample: CellSample;
  comparison: RescueComparison;
  history?: readonly RescueFrame[];
  progress: RescueProgress;
}) {
  const failedFrame = comparison.history.at(-1);
  const readings = compareRescueReadings(sample, comparison.history);
  const pastFailure = failedFrame && sample.tick > failedFrame.tick;
  const failure = failedFrame && rescueFailureReading(failedFrame.cell);
  const retryAtFailure = failedFrame && history?.find(frame => frame.tick === failedFrame.tick);
  const matchedReading = failure && retryAtFailure && rescueFailureReading(retryAtFailure.cell, failedFrame.cell.deathCause);
  return <div className="csl-run-comparison">
    <p className="csl-retry-responses"><strong>Retry started with</strong>{" "}
      {comparison.plan.responses.map(responseName).join(", ") || "all responses off."}</p>
    {failedFrame && (sample.tick >= failedFrame.tick || !isRescueRunning(progress)) && <div className="csl-failed-run-end">
      <p><strong>{comparison.status === "lost" ? "Original cell died" : "Original run ran out of time"} at tick {failedFrame.tick}.</strong>
        {pastFailure && <> Later ticks are from the retry.</>}
      </p>
      {failure && matchedReading && <p>{failure.label} at that tick was <strong>{formatFailureReading(failure)}</strong> in the failed run and <strong>{formatFailureReading(matchedReading)}</strong> on retry.</p>}
    </div>}
    <ReadingTable tick={sample.tick} readings={readings} />
    {pastFailure && retryAtFailure && <details className="csl-comparison-history">
      <summary>Compare at tick {failedFrame.tick}</summary>
      <ReadingTable tick={failedFrame.tick} readings={compareRescueReadings(retryAtFailure, comparison.history)} />
    </details>}
  </div>;
}

function ReadingTable({ tick, readings }: { tick: number; readings: RescueComparisonReading[] }) {
  return <table className="csl-comparison-table">
    <caption>Tick {tick} <span>Illustrative scales</span></caption>
    <thead><tr><th scope="col">Reading</th><th scope="col">Failed run</th><th scope="col">Retry</th></tr></thead>
    <tbody>{readings.map(reading => {
      const value = formatRescueReading(reading);
      const previous = formatRescueReading(reading, true);
      const impact = value === previous ? undefined : reading.impact;
      const hasPrevious = reading.failed !== undefined;
      return <tr key={reading.id} data-target={reading.id} data-ready={reading.ready}>
        <th scope="row">{reading.label}<small>Target {formatRescueTarget(reading)}</small></th>
        <td aria-label={!hasPrevious ? "No reading at this tick" : undefined}>{previous}</td>
        <td className="csl-comparison-current" data-impact={impact}>
          <strong>{value}</strong>
          {impact && <small>{impact === "better" ? "Better" : "Worse"}</small>}
          {!hasPrevious && <small>{reading.ready ? "Met" : "Needs attention"}</small>}
        </td>
      </tr>;
    })}</tbody>
  </table>;
}

export function RescueStatus({ sample, progress, effect, comparison, history, retryPlan, onRetry }: {
  sample: CellSample;
  progress?: RescueProgress;
  effect?: RescueResponseEffect;
  comparison?: RescueComparison;
  history?: readonly RescueFrame[];
  retryPlan?: RescuePlan;
  onRetry: () => void;
}) {
  const { elapsed, stableTicks, status } = progress ?? { elapsed: 0, stableTicks: 0, status: "preview" };
  const failed = status === "lost" || status === "unrecovered";
  const targets = rescueReadiness(sample.cell);
  const ordered = [...targets.filter(target => !target.ready), ...targets.filter(target => target.ready)];
  return <section className="csl-rescue-status" data-result={status} aria-label="Cell diagnosis">
    <h2 aria-live="polite">{status === "saved" ? "Cell saved" : status === "lost" ? "Rescue failed" :
      status === "unrecovered" ? "Cell did not recover in time" : comparison ? "Run comparison" : "Cell diagnosis"}</h2>
    <p className="csl-rescue-summary">{status === "saved" ? `All targets met for ${RESCUE_STABLE_TICKS} consecutive ticks.` :
      failed ? (retryPlan ? "Final readings." : "Final readings. Reset to retry this case.") :
      status === "recovery" ? `Recovery · ${RESCUE_TOTAL_TICKS - elapsed} ticks left · ${stableTicks} / ${RESCUE_STABLE_TICKS} stable ticks` :
      status === "exposure" ? `Exposure · ${RESCUE_EXPOSURE_TICKS - elapsed} ticks left` : "Starting readings"}</p>
    {comparison && progress ? <RescueComparisonTable sample={sample} comparison={comparison} history={history} progress={progress} /> : <>
      <div className="csl-rescue-caption"><span>Recovery targets</span><span>Illustrative scales</span></div>
      <ul className="csl-rescue-targets" aria-label="Recovery targets">
        {ordered.map(reading => <li key={reading.id} data-target={reading.id} data-ready={reading.ready}>
          <div><strong>{reading.label}</strong><small>Target {formatRescueTarget(reading)}</small></div>
          <div className="csl-rescue-reading"><b>{formatRescueReading(reading)}</b><small>{reading.ready ? "Met" : "Needs attention"}</small></div>
        </li>)}
      </ul>
    </>}
    {failed && progress ? <RescueDebrief sample={sample} progress={progress} retryPlan={retryPlan} onRetry={onRetry} /> :
      <div aria-live="polite" aria-atomic="true">{effect && status !== "saved" && <RescueEffect effect={effect} showResponse />}</div>}
  </section>;
}
