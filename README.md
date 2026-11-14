# Cell Stress Lab

Watch one live epithelial cell as it responds to ten stressors and ten cellular responses. The model starts when the field is visible.

## Run locally

Use Node.js 22.12 or later.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:4184/. Use `npm run build:demo` to export the demo to `demo-dist/`.

## Use the lab

- The cell starts under UV and heat so you can see DNA damage, repair, and protein refolding. Select Whole cell, DNA, or Proteins to change the view. Turn on Cell labels to identify structures in the whole-cell view.
- Use each slider to set ongoing stress. The display uses temperature in °C, dose per tick for radiation, concentrations for nutrients and oxidants, pressure in kPa, and baseline multiples for internal stressors. Pulse UV and Pulse heat sit next to their sliders and apply brief exposures.
- Toggle cell responses to see how damage and recovery change. Stop all stress clears the inputs so you can watch the existing damage recover.
- Use Pause to inspect the current cell, or Reset to restore the starting cell and settings. The lab starts paused when the system requests reduced motion.
- Open the stressor and response guide to see which responses act on each type of stress.

## Save the cell

Select Save the cell to draw a case. Use Random case to draw another, or adjust the stressor sliders to set your own starting condition. The preview shows the same model after four ticks of exposure. Choose up to three responses before starting. Each response can be swapped while the clock runs or while paused.

The exposure lasts ten more ticks, then the model clears the stress. The cell must meet the six recovery targets for three consecutive ticks within the 36-tick run. The result distinguishes a recovered cell, cell death, and a cell that survived without recovering in time. Reset returns to the same case. Free play brings back the cell you left there.

The diagnosis next to the cell shows its current readings and the recovery targets. Toggling a response compares two short runs from the current cell using the old and new settings. After a loss, the diagnosis shows the cause or missed targets. When the model finds a combination that works, **Retry with suggested responses** starts from the same damage and exposure settings with the suggested responses enabled.

During the retry, the diagnosis compares its readings with the actual failed run at each shared tick. After the failed run ends, the panel shows the live retry readings and keeps the two sets of readings from the last shared tick available for review.

## Embed the lab

Install the published package in your React project.

```sh
npm install @esmirnov.ai/cell-stress-lab
```

To test a local build, run `npm pack` in this repository and install the resulting archive from your app directory.

```tsx
import { CellStressLab } from "@esmirnov.ai/cell-stress-lab";
import "@esmirnov.ai/cell-stress-lab/styles.css";

export function LabPage() {
  return <CellStressLab seed={42} initialScenario="heat" />;
}
```

The `@esmirnov.ai/cell-stress-lab/core` entry works without React or a browser. Use `prepareScenario`, `pulseCell`, `stepCell`, and `clearStress` to run the same model. The core supports seeded replay.

## Model

Exposures act on separate pools for UV photolesions, oxidized bases, DNA breaks, unfolded proteins, oxidized proteins, aggregates, endoplasmic reticulum folding load, and ATP. DNA lesions can stall DNA copying. A sequence change that persists after copying becomes a fixed mutation and passes to daughter cells. A cell with persistent stress may arrest or become senescent. Sustained folding overload can cause apoptosis. Compression deforms the membrane.

The `lineage` scenario starts with a pre-existing change in growth control. The view follows one daughter after each division. Compare its behavior with an ordinary cell exposed to oncogenic signaling.

Damage and repair use qualitative rules. Display scales are illustrative conversions from the model's normalized state. The ATP display uses 3 mM as its full-scale reference, and DNA and protein burdens use lesion and concentration equivalents. A tick is one simulation step. Activity shows damage formed, damage repaired, and refolding separately. The live effects show representative events drawn from those amounts. Terminal views show condensed chromatin and apoptotic bodies in apoptosis, and a diffuse cell with a disrupted membrane in the energy-failure outcome. Research links in the lab support the individual mechanisms. Rescue targets are game rules.

## Checks

```sh
npm test
npm run typecheck
npm run build:demo
```
