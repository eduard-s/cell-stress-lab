import type { CSSProperties } from "react";
import { RESCUE_RESPONSE_LIMIT, rescueResponseCount, RESPONSES, STRESSORS, type RescueResponseEffect, type ResponseSettings, type StressMix, type StressorId } from "../core/index.js";
import { RescueEffect } from "./RescueControls.js";
import { formatStressLevel } from "./units.js";

const stressGroups = [
  { name: "Exposure", ids: ["uv", "heat", "xray", "oxidants"] },
  { name: "Cell environment", ids: ["oxygen", "glucose", "crowding"] },
  { name: "Internal stress", ids: ["er", "replication", "growth"] },
] as const;

const responseGroups = [
  { name: "DNA repair", ids: ["ner", "ber", "breaks"] },
  { name: "Protein recovery", ids: ["hsp", "upr", "clearance"] },
  { name: "Cell defenses", ids: ["glutathione", "checkpoint"] },
  { name: "External support", ids: ["filter", "supply"] },
] as const;

export function StressControls({ id, mix, disabled, canStop, change, stop, clearingSetup, pulse }: {
  id: string;
  mix: StressMix;
  disabled: boolean;
  canStop: boolean;
  change: (stressor: StressorId, value: number) => void;
  stop?: () => void;
  clearingSetup: boolean;
  pulse?: (stressor: "uv" | "heat") => void;
}) {
  return <section className="csl-controls csl-stressors" aria-labelledby={id + "-stressors"}>
    <div className="csl-controls-heading">
      <h2 id={id + "-stressors"}>Stressors</h2>
      {stop && <button className="csl-text-action" type="button" disabled={disabled || !canStop} onClick={stop}>
        {clearingSetup ? "Clear stressors" : "Stop all stress"}
      </button>}
    </div>
    {!stop && <p className="csl-control-note">Starting stress levels are fixed for this run.</p>}
    {stressGroups.map(group => <fieldset key={group.name} disabled={disabled}>
      <legend>{group.name}</legend>
      {group.ids.map(key => {
        const { label, effect } = STRESSORS.find(item => item.id === key)!;
        const inputId = id + "-" + key;
        const value = Math.round(mix[key] * 100);
        return <div className="csl-factor" key={key} data-factor={key}>
          <label htmlFor={inputId}>{label}</label>
          <output htmlFor={inputId} aria-live="off">{formatStressLevel(key, mix[key])}</output>
          <p id={inputId + "-effect"}>{effect}</p>
          <div className="csl-factor-adjustment">
            <input type="range" id={inputId} min={0} max={100} value={value}
              aria-describedby={inputId + "-effect"}
              aria-valuetext={formatStressLevel(key, mix[key], true)}
              style={{ "--csl-level": String(value) + "%" } as CSSProperties}
              onChange={event => change(key, event.currentTarget.valueAsNumber / 100)} />
            {pulse && (key === "uv" || key === "heat") && <button type="button" className="csl-pulse-button" data-pulse={key}
              onClick={() => pulse(key)}>Pulse {key === "uv" ? "UV" : "heat"}</button>}
          </div>
        </div>;
      })}
    </fieldset>)}
  </section>;
}

export function ResponseControls({ id, responses, disabled, limited, change, effect }: {
  id: string;
  responses: ResponseSettings;
  disabled: boolean;
  limited: boolean;
  change: (response: keyof ResponseSettings, enabled: boolean) => void;
  effect?: RescueResponseEffect;
}) {
  const used = rescueResponseCount(responses);
  return <section className="csl-controls csl-responses" aria-labelledby={id + "-responses"}>
    <div className="csl-controls-heading">
      <h2 id={id + "-responses"}>Cell responses</h2>
      {limited && <span className="csl-response-count" aria-live="polite">{used} / {RESCUE_RESPONSE_LIMIT} active</span>}
    </div>
    {limited && !disabled && <p className="csl-control-note">{used >= RESCUE_RESPONSE_LIMIT
      ? "Turn off a response to free a slot." : "Choose up to three responses. You can swap them during the run."}</p>}
    {responseGroups.map(group => <fieldset key={group.name} disabled={disabled}>
      <legend>{group.name}</legend>
      {group.ids.map(key => {
        const { label, description } = RESPONSES.find(item => item.id === key)!;
        const inputId = id + "-response-" + key;
        return <div key={key}>
          <label className="csl-response" data-response={key} htmlFor={inputId}>
            <input type="checkbox" id={inputId} checked={responses[key]} disabled={limited && used >= RESCUE_RESPONSE_LIMIT && !responses[key]}
              aria-describedby={effect?.response === key ? inputId + "-effect " + inputId + "-estimate" : inputId + "-effect"}
              onChange={event => change(key, event.currentTarget.checked)} />
            <span><strong>{label}</strong><small id={inputId + "-effect"} aria-hidden="true">{description}</small></span>
          </label>
          {effect?.response === key && <div className="csl-response-estimate" id={inputId + "-estimate"}><RescueEffect effect={effect} /></div>}
          {key === "glutathione" && <label className="csl-response csl-cysteine" htmlFor={id + "-cysteine"}>
            <input type="checkbox" id={id + "-cysteine"} checked={responses.cysteineSupport && responses.glutathione}
              disabled={!responses.glutathione}
              aria-describedby={effect?.response === "cysteineSupport" ? id + "-cysteine-effect " + id + "-cysteine-estimate" : id + "-cysteine-effect"}
              onChange={event => change("cysteineSupport", event.currentTarget.checked)} />
            <span><strong>Add cysteine</strong><small id={id + "-cysteine-effect"} aria-hidden="true">
              {limited ? "Glutathione add-on. Uses its response slot." : "Supports glutathione buffering."}
            </small></span>
          </label>}
          {key === "glutathione" && effect?.response === "cysteineSupport" &&
            <div className="csl-response-estimate csl-cysteine-estimate" id={id + "-cysteine-estimate"}><RescueEffect effect={effect} /></div>}
        </div>;
      })}
    </fieldset>)}
  </section>;
}
