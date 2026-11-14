import { createRoot } from "react-dom/client";
import { CellStressLab } from "../src/react/index.js";
import "../src/react/styles.css";
import "./page.css";

createRoot(document.getElementById("root")!).render(
  <>
    <h1>Cell Stress Lab</h1>
    <p>Change the conditions around one cell and watch it respond as the simulation runs.</p>
    <CellStressLab />
  </>,
);
