import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { claude } from "../env.js";
import { upsertBridgeEnv, restartBridge } from "../bridge-ctl.js";
import { ask } from "../prompt.js";
import type { Step } from "../types.js";

const CREDENTIALS = path.join(os.homedir(), ".claude", ".credentials.json");

// Persist the API key so (a) the rest of this wizard run (the step-4 smoke test)
// can use it, and (b) the bot picks it up: app.py / bridge.py load the bridge
// .env, and the claude subprocess they spawn inherits ANTHROPIC_API_KEY.
function persistApiKey(key: string): { wroteEnv: boolean } {
  process.env.ANTHROPIC_API_KEY = key;
  return { wroteEnv: upsertBridgeEnv("ANTHROPIC_API_KEY", key) };
}

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
    const method = await ask(
      p.select({
        message: "How do you want to authenticate Claude Code?",
        options: [
          {
            value: "browser",
            label: "Log in with your Claude account",
            hint: "email + verification code, in the desktop browser",
          },
          {
            value: "apikey",
            label: "Enter an Anthropic API key",
            hint: "sk-ant-… — no browser needed",
          },
        ],
        initialValue: "browser",
      }),
    );

    if (method === "apikey") {
      const key = await ask(
        p.password({
          message: "Paste your Anthropic API key",
          validate: (v) =>
            v && v.trim().startsWith("sk-ant-")
              ? undefined
              : "Expected a key starting with sk-ant-",
        }),
      );
      const { wroteEnv } = persistApiKey(key.trim());
      p.log.success(
        wroteEnv
          ? "API key saved to the bot's .env and this session — Claude Code will use it."
          : "API key set for this session (bridge dir not found, so nothing persisted to disk).",
      );
      if (wroteEnv) await restartBridge();
      return;
    }

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
    // Bounce the bridge so existing sessions re-spawn claude with the new login.
    await restartBridge();
  },
};
