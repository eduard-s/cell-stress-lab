"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  beginRescue, clearStress, compareRescueResponse, findRescuePlan, isRescueRunning, isTerminal, prepareScenario,
  pulseCell, randomRescueCase, RESCUE_RESPONSE_LIMIT, RESCUE_TICK_MS,
  rescueResponseCount, RESPONSES, responseMatch, STRESSORS, stepCell, stepRescue,
  type CellSample, type RescueCase, type RescueResponseEffect, type ResponseSettings, type ScenarioId, type StressMix, type StressorId,
} from "../core/index.js";
import { StressControls, ResponseControls } from "./CellControls.js";
import { CellDiagram } from "./CellDiagram.js";
import { CellLegend, CellReadouts, CellStatus, CellViewControls, CellViewDescription, type CellView } from "./CellReadouts.js";
import { LabMode, RescueSetup, RescueStatus, type RescueSession } from "./RescueControls.js";
import { SOURCES } from "./sources.js";
import { useCellPlayback } from "./useCellPlayback.js";

export type CellStressLabProps = { seed?: number; initialScenario?: ScenarioId };
type LabState = {
  sample: CellSample;
  revision: number;
  rescue: RescueSession | null;
  paused: boolean;
  responseEffect?: RescueResponseEffect;
  freePlay?: { sample: CellSample; paused: boolean };
};

function canAdvance(state: LabState) {
  if (!state.rescue) return !isTerminal(state.sample.cell.fate);
  return state.rescue.phase === "run" && isRescueRunning(state.rescue.progress);
}

function previewCase(current: LabState, cause: RescueCase): LabState {
  const { sample } = beginRescue(cause);
  return { ...current, sample, revision: current.revision + 1, rescue: { phase: "setup", cause }, paused: false, responseEffect: undefined };
}

function editCase(current: LabState, cause: RescueCase, mix: StressMix): LabState {
  const edited = { ...cause, name: "Custom case", mix };
  const { sample } = beginRescue(edited);
  return { ...current, sample: { ...sample, responses: current.sample.responses }, rescue: { phase: "setup", cause: edited }, responseEffect: undefined };
}

export function CellStressLab({ seed = 42, initialScenario = "uv-heat" }: CellStressLabProps) {
  const id = useId();
  const field = useRef<HTMLDivElement>(null);
  const playback = useRef<HTMLButtonElement>(null);
  const focusPlayback = useRef(false);
  const [state, setState] = useState<LabState>(() => ({
    sample: prepareScenario(initialScenario, seed), revision: 0, rescue: null, paused: false,
  }));
  const [view, setView] = useState<CellView>("cell");
  const [labels, setLabels] = useState(true);
  const { sample, rescue, revision, responseEffect } = state;
  const { cell, mix, responses } = sample;
  const terminal = isTerminal(cell.fate);
  const active = canAdvance(state);
  const round = rescue?.phase === "run" ? rescue : undefined;
  const failedRound = round && (round.progress.status === "lost" || round.progress.status === "unrecovered") ? round : undefined;
  const retryPlan = useMemo(() => failedRound ? findRescuePlan(failedRound.cause, responses) : undefined, [failedRound, responses]);
  const step = useCallback(() => setState(current => {
    if (current.paused || !canAdvance(current)) return current;
    if (current.rescue?.phase === "run") {
      const { sample, progress } = stepRescue({ sample: current.sample, progress: current.rescue.progress });
      const history = [...current.rescue.history, { tick: sample.tick, cell: sample.cell }];
      return { ...current, sample, rescue: { ...current.rescue, progress, history } };
    }
    return { ...current, sample: stepCell(current.sample) };
  }), []);
  const { paused, running, releaseMotionHold } = useCellPlayback(field, step, active, state.paused, round ? RESCUE_TICK_MS : undefined);
  const activeView = terminal ? "cell" : view;
  const canClear = STRESSORS.some(({ id }) => mix[id] > 0 || sample.pulse[id] > 0);

  useEffect(() => {
    if (rescue?.phase === "run" && focusPlayback.current) {
      focusPlayback.current = false;
      field.current?.scrollIntoView({ block: "nearest" });
      playback.current?.focus({ preventScroll: true });
    }
  }, [rescue?.phase, revision]);

  function changeMode(enable: boolean) {
    if (enable === Boolean(rescue)) return;
    if (enable) {
      const cause = randomRescueCase(Math.floor(Math.random() * 2 ** 32));
      setState(current => previewCase({ ...current, freePlay: { sample: current.sample, paused } }, cause));
    } else {
      setState(current => current.freePlay ? { ...current.freePlay, rescue: null, revision: current.revision + 1 } : current);
    }
  }

  function newCase() {
    const caseSeed = Math.floor(Math.random() * 2 ** 32);
    setState(current => previewCase(current, randomRescueCase(caseSeed, current.rescue?.cause.index)));
  }

  function reset() {
    setState(current => current.rescue ? previewCase(current, current.rescue.cause) :
      { ...current, sample: prepareScenario(initialScenario, seed), revision: current.revision + 1 });
  }

  function startRescue() {
    focusPlayback.current = true;
    releaseMotionHold();
    setState(current => {
      if (current.rescue?.phase !== "setup" || !STRESSORS.some(({ id }) => current.sample.mix[id] > 0)) return current;
      const { cause } = current.rescue;
      const { tick, cell } = current.sample;
      const progress = { elapsed: 0, stableTicks: 0, status: "exposure" } as const;
      return { ...current, rescue: { phase: "run", cause, progress, history: [{ tick, cell }] }, paused: false };
    });
  }

  function retryWithSuggestedResponses() {
    if (!failedRound || !retryPlan) return;
    focusPlayback.current = true;
    releaseMotionHold();
    setState(current => {
      if (current.rescue !== failedRound) return current;
      const { sample, progress } = beginRescue(failedRound.cause, retryPlan);
      return {
        ...current,
        sample,
        rescue: {
          phase: "run", cause: failedRound.cause, progress,
          history: [{ tick: sample.tick, cell: sample.cell }],
          comparison: { history: failedRound.history, plan: retryPlan, status: failedRound.progress.status },
        },
        revision: current.revision + 1,
        paused: false,
        responseEffect: undefined,
      };
    });
  }

  function updateStress(key: StressorId, value: number) {
    setState(current => {
      if (current.rescue?.phase === "run" || isTerminal(current.sample.cell.fate)) return current;
      const mix = { ...current.sample.mix, [key]: value };
      if (!current.rescue) return { ...current, sample: { ...current.sample, mix } };
      return editCase(current, current.rescue.cause, mix);
    });
  }

  function stopStress() {
    setState(current => {
      if (!current.rescue) return { ...current, sample: clearStress(current.sample) };
      if (current.rescue.phase === "run") return current;
      return editCase(current, current.rescue.cause, clearStress(current.sample).mix);
    });
  }

  function changeResponse(key: keyof ResponseSettings, enabled: boolean) {
    setState(current => {
      if (isTerminal(current.sample.cell.fate) || (current.rescue?.phase === "run" && !canAdvance(current))) return current;
      const responses = { ...current.sample.responses, [key]: enabled };
      if (current.rescue && rescueResponseCount(responses) > RESCUE_RESPONSE_LIMIT) return current;
      let responseEffect: RescueResponseEffect | undefined;
      if (current.rescue) {
        const progress = current.rescue.phase === "run" ? current.rescue.progress : { elapsed: 0, stableTicks: 0, status: "exposure" } as const;
        responseEffect = compareRescueResponse({ sample: current.sample, progress }, { response: key, enabled });
      }
      return { ...current, sample: { ...current.sample, responses }, responseEffect };
    });
  }

  function pulse(stressor: "uv" | "heat") {
    setState(current => current.rescue ? current : { ...current, sample: pulseCell(current.sample, stressor) });
  }

  return <div className="csl-lab">
    <LabMode rescue={Boolean(rescue)} select={changeMode} />
    {rescue && <RescueSetup session={rescue} randomize={newCase} begin={startRescue} />}
    <div className="csl-workbench" data-rescue={Boolean(rescue)} data-rescue-setup={rescue?.phase === "setup"}>
      <section className="csl-stage" aria-label="Live cell">
        <div className="csl-cell-view">
          <div ref={field} className="csl-field" role="group" aria-label="Cell field" data-running={running} data-terminal={terminal}>
            <CellDiagram key={revision} sample={sample} animating={running} labels={labels} focus={activeView} />
          </div>
          <div className="csl-toolbar">
            <CellViewControls view={activeView} select={setView} terminal={terminal} />
            <div className="csl-time" role="group" aria-label="Time controls">
              <button ref={playback} type="button" className="csl-playback" disabled={!active} onClick={() => {
                releaseMotionHold();
                setState(current => ({ ...current, paused: !paused }));
              }}>{paused && active ? "Resume" : "Pause"}</button>
              <button type="button" title={rescue ? "Reset this case" : "Restore the starting cell and settings"} onClick={reset}>Reset</button>
            </div>
          </div>
          <CellStatus sample={sample} running={running} paused={paused} setup={rescue?.phase === "setup"}
            progress={round?.progress} labels={labels} toggleLabels={setLabels} view={activeView} />
        </div>
        {rescue && <RescueStatus sample={sample} progress={round?.progress} effect={responseEffect}
          comparison={round?.comparison} history={round?.history} retryPlan={retryPlan} onRetry={retryWithSuggestedResponses} />}
      </section>

      <StressControls id={id} mix={round?.cause.mix ?? mix} change={updateStress} disabled={terminal || Boolean(round)}
        canStop={canClear} stop={round ? undefined : stopStress} clearingSetup={rescue?.phase === "setup"} pulse={rescue ? undefined : pulse} />
      <ResponseControls id={id} responses={responses} change={changeResponse}
        disabled={terminal || (Boolean(round) && !active)} limited={Boolean(rescue)} effect={round && !active ? undefined : responseEffect} />
      {rescue?.phase === "setup" && <button type="button" className="csl-primary csl-start-mobile"
        disabled={!canClear} onClick={startRescue}>Start rescue</button>}
      <div className="csl-observation">
        <CellLegend />
        <CellViewDescription view={activeView} sample={sample} />
        <CellReadouts id={id} sample={sample} />
      </div>
    </div>

    <div className="csl-explanations">
      <section className="csl-guide" aria-labelledby={id + "-guide"}>
        <h2 id={id + "-guide"}>Compare damage and recovery</h2>
        <p>Lower UV light to watch lesions clear. Lower heat to watch HSP70 refold proteins.</p>
        <p className="csl-limits">The cutaway and measurements use illustrative scales. A tick is one model step, and eq. means equivalent within the model. The values are uncalibrated for lab use.</p>
      </section>
      <details className="csl-details">
        <summary>Stressor and response guide</summary>
        <div className="csl-pathways">
          {STRESSORS.map(stressor => <section className="csl-pathway" key={stressor.id}>
            <h3>{stressor.label}</h3>
            <dl className="csl-matches">
              {RESPONSES.map(({ id, label }) => {
                const match = responseMatch(stressor.id, id);
                return match ? <div key={id}><dt>{label}</dt><dd>{match[1]}</dd></div> : null;
              })}
              {stressor.id === "crowding" && <div><dt>Lower compression</dt><dd>Lets the membrane relax.</dd></div>}
            </dl>
          </section>)}
        </div>
      </details>
      <details className="csl-details">
        <summary>Research sources</summary>
        <ul className="csl-sources">
          {SOURCES.map(({ topic, title, url }) => <li key={url}>{topic} <a href={url} target="_blank" rel="noopener noreferrer">{title}</a></li>)}
        </ul>
      </details>
    </div>
  </div>;
}
