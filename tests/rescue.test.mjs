import assert from "node:assert/strict";
import test from "node:test";
import {
  beginRescue, compareRescueReadings, compareRescueResponse, findRescuePlan, randomRescueCase, RESCUE_CASES, RESCUE_EXPOSURE_TICKS,
  RESCUE_RESPONSE_LIMIT, RESCUE_STABLE_TICKS, RESCUE_TOTAL_TICKS, rescueFailureReading, rescueReadiness,
  rescueResponseCount, stepRescue, stressMix,
} from "../dist/core/index.js";

const solutions = [
  ["ner", "hsp", "clearance"], ["hsp", "ber", "clearance"], ["ner", "breaks", "ber"],
  ["supply", "hsp", "upr"], ["upr", "clearance", "supply"], ["checkpoint", "breaks", "ber"],
  ["ber", "glutathione", "clearance"], ["ner", "filter", "breaks"],
];

function finish(run, selected = []) {
  let current = {
    ...run,
    sample: {
      ...run.sample,
      responses: { ...run.sample.responses, ...Object.fromEntries(selected.map(id => [id, true])) },
    },
  };
  for (let tick = 0; tick < RESCUE_TOTAL_TICKS; tick++) current = stepRescue(current);
  return current;
}

test("every random case has a rescue within the response budget and fails without help", () => {
  const visited = new Set();
  for (let seed = 0; seed < 256; seed++) {
    const cause = randomRescueCase(seed);
    visited.add(cause.index);
    assert.notEqual(randomRescueCase(seed, cause.index).index, cause.index);
    const start = beginRescue(cause);
    assert.deepEqual(start, beginRescue(cause), "retry should reproduce the starting cell");
    assert.equal(rescueResponseCount(start.sample.responses), 0);
    const saved = finish(start, solutions[cause.index]);
    assert.equal(rescueResponseCount(saved.sample.responses), 3);
    assert.equal(saved.progress.status, "saved", cause.name);
    assert(rescueReadiness(saved.sample.cell).every(({ ready }) => ready));
    assert.equal(saved.progress.stableTicks, RESCUE_STABLE_TICKS);
    assert.notEqual(finish(start).progress.status, "saved", cause.name);
  }
  assert.equal(visited.size, RESCUE_CASES.length);
});

test("a custom exposure ends on schedule and the outcome freezes the run", () => {
  const cause = { name: "Custom case", mix: stressMix({ uv: .26 }), seed: 42 };
  let run = beginRescue(cause);
  assert(run.sample.cell.photolesions > 0);
  for (let tick = 1; tick < RESCUE_EXPOSURE_TICKS; tick++) {
    run = stepRescue(run);
    assert.equal(run.sample.mix.uv, .26);
  }
  run = stepRescue(run);
  assert.equal(run.progress.status, "recovery");
  assert.equal(run.sample.mix.uv, 0);
  assert(run.sample.cell.photolesions > 0);
  const outcome = finish(run);
  assert.equal(outcome.progress.status, "unrecovered");
  assert.equal(outcome.progress.elapsed, RESCUE_TOTAL_TICKS);
  assert.strictEqual(stepRescue(outcome), outcome);
});

test("response comparisons use the same starting cell and detect help, harm, or no effect", () => {
  const run = beginRescue({ name: "UV and heat", mix: stressMix({ uv: .73, heat: .69 }), seed: 42 });
  const original = structuredClone(run);
  const withHsp = compareRescueResponse(run, { response: "hsp", enabled: true });
  const hsp = withHsp.changes.find(change => change.label === "Unfolded proteins");
  assert.equal(hsp.better, true);
  assert(hsp.after < hsp.before);

  const withoutHsp = compareRescueResponse({
    ...run, sample: { ...run.sample, responses: { ...run.sample.responses, hsp: true } },
  }, { response: "hsp", enabled: false });
  assert.equal(withoutHsp.changes.find(change => change.label === "Unfolded proteins").better, false);
  assert.deepEqual(compareRescueResponse(run, { response: "supply", enabled: true }).changes, []);
  assert.deepEqual(run, original);
});

test("a loss identifies the terminal reading and recommends a verified retry within the response limit", () => {
  for (const [index, label] of [[2, "DNA strand breaks"], [3, "ATP"], [4, "ER folding load"]]) {
    const preset = RESCUE_CASES[index];
    const cause = { name: preset.name, mix: stressMix(preset.mix), seed: 42 };
    const run = beginRescue(cause);
    const failed = finish(run);
    assert.equal(failed.progress.status, "lost");
    assert.equal(rescueFailureReading(failed.sample.cell).label, label);
    const plan = findRescuePlan(cause, failed.sample.responses);
    assert(plan);
    const retry = beginRescue(cause, plan);
    assert.deepEqual({ ...retry.sample, responses: run.sample.responses }, run.sample);
    assert.deepEqual(retry.progress, run.progress);
    assert.deepEqual(Object.keys(retry.sample.responses).filter(id => retry.sample.responses[id]).sort(), [...plan.responses].sort());
    assert(rescueResponseCount(retry.sample.responses) <= RESCUE_RESPONSE_LIMIT);
    assert.equal(finish(retry).progress.status, "saved");
  }
});

test("retry readings compare the same tick and stop comparing after the failed run ends", () => {
  const cause = { name: "Low energy", mix: stressMix({ oxygen: 1, glucose: 1 }), seed: 42 };
  let failed = beginRescue(cause);
  let retry = beginRescue(cause, { responses: ["supply"] });
  const history = [failed.sample];
  const reading = (sample, id) => compareRescueReadings(sample, history).find(entry => entry.id === id);

  assert.equal(reading(retry.sample, "energy").impact, undefined);
  while (failed.progress.status !== "lost") {
    failed = stepRescue(failed);
    history.push(failed.sample);
    retry = stepRescue(retry);
  }

  const energy = reading(retry.sample, "energy");
  assert.equal(retry.sample.tick, failed.sample.tick);
  assert.equal(energy.failed, Math.floor(failed.sample.cell.energy * 100));
  assert.equal(energy.impact, "better");
  assert.equal(reading(retry.sample, "protein").impact, "better");
  assert.equal(reading(retry.sample, "cycle").impact, "better");
  assert.equal(reading(failed.sample, "energy").impact, undefined);

  retry = stepRescue(retry);
  assert.equal(reading(retry.sample, "energy").failed, undefined);
  assert.equal(reading(retry.sample, "energy").impact, undefined);
  assert.equal(rescueFailureReading(retry.sample.cell, failed.sample.cell.deathCause).label, "ATP");
});
