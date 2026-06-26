import * as p from "@clack/prompts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BRIDGE_DIR, inDesktop, capture } from "./env.js";

// Helpers for steps that need to change the bot's config and have it take
// effect: the running bridge only reads .env at startup, so after writing a var
// we restart it.

/** Upsert KEY=value into the bridge's .env, preserving other lines. Returns
 *  false if the bridge dir isn't present (e.g. running off the codespace). */
export function upsertBridgeEnv(key: string, value: string): boolean {
  if (!existsSync(BRIDGE_DIR)) return false;
  const file = path.join(BRIDGE_DIR, ".env");
  const lines = existsSync(file)
    ? readFileSync(file, "utf8").split("\n").filter((l) => !l.startsWith(`${key}=`))
    : [];
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  lines.push(`${key}=${value}`);
  writeFileSync(file, lines.join("\n") + "\n", { mode: 0o600 });
  return true;
}

/** Restart the bridge so it re-reads .env / re-spawns claude. Best-effort. */
export async function restartBridge(): Promise<void> {
  if (!inDesktop) return;
  const conf = path.join(BRIDGE_DIR, "supervisord.conf");
  try {
    await capture("supervisorctl", ["-c", conf, "restart", "bridge"]);
    p.log.success("Restarted the agent bridge to apply the change.");
  } catch {
    // supervisord may not be running yet; killing lets it (if up) autorestart.
    try {
      await capture("pkill", ["-f", "bridge.py"]);
    } catch {
      /* nothing to kill */
    }
    p.log.info("Signaled the agent bridge to restart.");
  }
}
