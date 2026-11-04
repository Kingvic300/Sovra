import "@fontsource-variable/hanken-grotesk";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Deck } from "./deck";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Deck />
  </StrictMode>,
);
