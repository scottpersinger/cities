import { execa, type Options, type ResultPromise } from "execa";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * The sandbox-disabled Chrome wrapper baked into the agent-dev-desktop image
 * (see cities/.devcontainer/Dockerfile). Spawning this directly puts the page
 * on the XFCE desktop (DISPLAY :1) that the user sees over KasmVNC.
 */
export const CHROME = "/usr/local/bin/google-chrome";

/** Home for wizard state and any other coderbots-local files. */
export const CODERBOTS_HOME = path.join(os.homedir(), ".coderbots");

/** Are we actually inside the Codespace desktop (vs. a dev machine)? */
export const inDesktop = process.platform === "linux" && existsSync(CHROME);

/**
 * Run a command, streaming its output to the terminal. Use for long or
 * interactive commands (installs, `git clone`, `claude` itself).
 */
export function run(
  cmd: string,
  args: string[] = [],
  opts: Options = {},
): ResultPromise {
  return execa(cmd, args, { stdio: "inherit", ...opts });
}

/**
 * Run a command and capture stdout (trimmed). Throws on non-zero exit unless
 * `reject: false` is passed.
 */
export async function capture(
  cmd: string,
  args: string[] = [],
  opts: Options = {},
): Promise<string> {
  const res = await execa(cmd, args, { stdio: "pipe", ...opts });
  return typeof res.stdout === "string" ? res.stdout.trim() : "";
}

/** True if a binary is resolvable on PATH. */
export async function which(bin: string): Promise<boolean> {
  try {
    await execa("which", [bin], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Spawn `claude`, forcing BROWSER to the desktop Chrome so its OAuth/login
 * links open where the user can see them. The image's bashrc shim does this
 * for interactive shells, but child processes don't inherit shell functions,
 * so we set it explicitly here.
 */
export function claude(args: string[] = [], opts: Options = {}): ResultPromise {
  return run("claude", args, {
    ...opts,
    env: { ...process.env, BROWSER: CHROME, ...(opts.env ?? {}) },
  });
}

/**
 * Open a URL in the desktop Chrome (or the host browser when developing off
 * the Codespace). Fire-and-forget — never blocks the wizard.
 *
 * Notes that bit us before:
 *  - $BROWSER is deliberately ignored on Linux: VS Code overrides it with a
 *    helper that opens links on the *client* machine, not the in-codespace
 *    desktop the user is viewing over KasmVNC.
 *  - DISPLAY must point at the desktop X server (:1). It's set via containerEnv
 *    for normal shells, but can be missing when the wizard runs over
 *    `gh codespace ssh`, so default it here.
 *  - execa() reports a bad binary asynchronously, so we existsSync() the Chrome
 *    wrapper instead of relying on a try/catch around a detached spawn.
 */
export async function openUrl(url: string): Promise<void> {
  // macOS dev convenience.
  if (process.platform === "darwin") {
    execa("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }

  const env = { ...process.env, DISPLAY: process.env.DISPLAY || ":1" };

  // In the Codespace desktop, force the sandbox-disabled Chrome wrapper.
  if (existsSync(CHROME)) {
    execa(CHROME, [url], { detached: true, stdio: "ignore", env }).unref();
    return;
  }

  // Fallback for non-desktop Linux.
  execa("xdg-open", [url], { detached: true, stdio: "ignore", env }).unref();
}
