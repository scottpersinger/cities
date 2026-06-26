import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CODERBOTS_HOME } from "./env.js";
import type { WizardState } from "./types.js";

const STATE_FILE = path.join(CODERBOTS_HOME, "setup-state.json");

const EMPTY: WizardState = { completed: [] };

export async function loadState(): Promise<WizardState> {
  try {
    const raw = await readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    return { ...EMPTY, ...parsed, completed: parsed.completed ?? [] };
  } catch {
    return { ...EMPTY };
  }
}

export async function saveState(state: WizardState): Promise<void> {
  state.updatedAt = new Date().toISOString();
  await mkdir(CODERBOTS_HOME, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function markComplete(state: WizardState, id: string): void {
  if (!state.completed.includes(id)) state.completed.push(id);
}
