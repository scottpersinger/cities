import type { Step } from "../types.js";
import { installAgent } from "./install-agent.js";
import { authenticateAgent } from "./authenticate-agent.js";
import { installExtension } from "./install-extension.js";
import { testAndListen } from "./test-and-listen.js";
import { pickRepo } from "./pick-repo.js";

/** Ordered list of wizard steps. */
export const steps: Step[] = [
  installAgent,
  authenticateAgent,
  installExtension,
  testAndListen,
  pickRepo,
];
