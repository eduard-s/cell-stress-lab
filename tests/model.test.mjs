import assert from "node:assert/strict";
import test from "node:test";
import {
  activeLesions, clearStress, prepareScenario, pulseCell, RESPONSES, responseMatch,
  responseSettings, STRESSORS, stepCell, stressMix,
} from "../dist/core/index.js";

function advance(sample, ticks) {
  let current = sample;
  for (let index = 0; index < ticks; index++) current = stepCell(current);
  return current;
}

test("the same sample accepts all ten stressors and their response pairs", () => {
  const ids = STRESSORS.map(({ id }) => id);
  const mix = stressMix(Object.fromEntries(ids.map(id => [id, 1])));
  assert.equal(ids.length, 10);
  assert.equal(RESPONSES.length, 10);
  const sample = { ...prepareScenario("blank"), mix };
  const next = stepCell(sample);
  assert(next.cell.photolesions > 0 && next.cell.breaks > 0 && next.cell.unfolded > 0);
  assert(next.cell.erLoad > 0 && next.cell.energy < 1 && next.cell.pressure > 0);
  assert.deepEqual(next.mix, mix);
  for (const { id } of RESPONSES) {
    for (const stressor of ids) {
      const match = responseMatch(stressor, id);
      assert(match === undefined || ["Direct", "Conditional"].includes(match[0]));
    }
  }
  assert.equal(responseMatch("uv", "ner")[0], "Direct");
  assert.equal(responseMatch("uv", "hsp"), undefined);
});

test("clearing heat allows refolding and HSP70 changes recovery", () => {
  const sample = prepareScenario("heat");
  assert(sample.cell.unfolded > .2);
  const cleared = clearStress(sample);
  assert.strictEqual(cleared.cell, sample.cell);
  assert.equal(cleared.mix.heat, 0);
  const refolded = advance(cleared, 5).cell;
  const noChaperone = advance({ ...cleared, responses: responseSettings({ hsp: false }) }, 5).cell;
  assert(refolded.unfolded < noChaperone.unfolded);
});

test("a pulse acts on the current cell and fades without changing its settings", () => {
  const sample = prepareScenario("blank");
  const pulsed = pulseCell(sample, "uv");
  assert(pulsed.cell.photolesions > 0);
  assert.equal(pulsed.cell.breaks, 0);
  assert.strictEqual(pulsed.mix, sample.mix);
  assert(pulsed.pulse.uv > 0);
  const recovered = advance(pulsed, 30);
  assert.equal(recovered.pulse.uv, 0);
  assert(recovered.cell.photolesions < pulsed.cell.photolesions);
});

test("UV filters prevent new lesions and repair preserves fixed mutations", () => {
  const sample = { ...prepareScenario("blank"), mix: stressMix({ uv: 1 }) };
  const filtered = stepCell({ ...sample, responses: responseSettings({ filter: true }) }).cell;
  assert(filtered.photolesions < stepCell(sample).cell.photolesions);
  const exposed = prepareScenario("uv");
  const copied = advance({ ...exposed, responses: responseSettings({ checkpoint: false }) }, 13);
  assert(copied.cell.mutations > 0);
  const pausedForRepair = { ...copied, responses: responseSettings() };
  const recovered = advance(clearStress(pausedForRepair), 32);
  assert(activeLesions(recovered.cell) < activeLesions(copied.cell));
  assert.equal(recovered.cell.mutations, copied.cell.mutations);
});

test("the live view can distinguish ongoing damage from ongoing repair and refolding", () => {
  const sample = advance(prepareScenario("uv-heat"), 25);
  const current = sample.activity.at(-1);
  assert(Math.abs(current.formed.photolesions - current.repaired.photolesions) < .002);
  assert(current.formed.photolesions > .08 && current.repaired.photolesions > .08);
  assert(current.unfolded > .10 && current.refolded > .05);

  const stopped = stepCell({ ...sample, responses: responseSettings({ ner: false, hsp: false, filter: true }) });
  const activity = stopped.activity.at(-1);
  assert.equal(activity.repaired.photolesions, 0);
  assert.equal(activity.refolded, 0);
  assert(activity.uvBlocked > activity.uv);
  assert(activity.formed.photolesions < current.formed.photolesions);
});

test("brief ER stress can resolve and sustained overload can cause irreversible apoptosis", () => {
  const sample = prepareScenario("er");
  const recovered = advance(clearStress(sample), 12).cell;
  assert(recovered.erLoad < sample.cell.erLoad);
  assert.equal(recovered.fate, "cycling");
  const sustained = advance(sample, 22);
  assert.equal(sustained.cell.fate, "apoptotic");
  assert.equal(sustained.cell.deathCause, "er-overload");
  assert.equal(advance(clearStress(sustained), 20).cell.fate, "apoptotic");
  assert.strictEqual(pulseCell(sustained, "heat"), sustained);
});

test("restored fuel and cysteine support affect their own channels", () => {
  const deprived = prepareScenario("energy");
  const restored = advance({ ...deprived, responses: responseSettings({ supply: true }) }, 6);
  assert(restored.cell.energy > advance(deprived, 6).cell.energy);
  assert.equal(advance(deprived, 22).cell.deathCause, "energy-failure");
  const baseline = { ...prepareScenario("blank"), mix: stressMix({ oxidants: 1 }) };
  const supported = advance({ ...baseline, responses: responseSettings({ cysteineSupport: true }) }, 4);
  assert(supported.cell.oxidation < advance(baseline, 4).cell.oxidation);
});

test("compression relaxes and the altered sample follows a daughter across division", () => {
  const compressed = advance(prepareScenario("crowding"), 8);
  assert(compressed.cell.pressure > .6);
  assert(advance(clearStress(compressed), 8).cell.pressure < .2);
  const altered = prepareScenario("lineage");
  const next = advance(altered, 12);
  assert(next.cell.generation > altered.cell.generation);
  assert(next.cell.altered && next.cell.mutations >= altered.cell.mutations);
  assert(next.events.some(event => event.text.includes("follows one daughter")));
});
