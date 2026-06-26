import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { claude } from "../env.js";
import { ask } from "../prompt.js";
import type { Step } from "../types.js";

const CREDENTIALS = path.join(os.homedir(), ".claude", ".credentials.json");

/** Step 2 — authenticate the agent against the user's Claude account. */
export const authenticateAgent: Step = {
  id: "authenticate-agent",
  title: "Authenticate agent",
  summary: "Log in to Claude (email + verification code) via the desktop browser",

  async check() {
    // Best-effort: Claude Code persists OAuth credentials here once logged in.
    return existsSync(CREDENTIALS) || Boolean(process.env.ANTHROPIC_API_KEY);
  },

  async run() {
    p.note(
      [
        "Claude Code will open its login page in the desktop Chrome.",
        "1. Enter your email and submit.",
        "2. Check your inbox and enter the verification code.",
        "3. Approve access.",
        "",
        "When you're logged in, type /exit in Claude to return to the wizard.",
      ].join("\n"),
      "Authenticate Claude Code",
    );

    const go = await ask(p.confirm({ message: "Ready to start the login?" }));
    if (!go) throw new Error("Login not started — re-run this step when ready.");

    // Hand the terminal over to interactive `claude` so the user can complete
    // the OAuth flow. BROWSER is forced to the desktop Chrome by env.claude()
    // so the auth link (and its localhost callback) lands on the desktop the
    // user is viewing over KasmVNC — not the VS Code client machine.
    //
    // TODO: if a confirmed non-interactive login command exists in the pinned
    // Claude Code version, prefer it over this interactive hand-off.
    await claude([]);

    if (!existsSync(CREDENTIALS) && !process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "Still not logged in — no credentials found. Re-run this step to try again.",
      );
    }
    p.log.success("Claude Code is authenticated.");
  },
};
