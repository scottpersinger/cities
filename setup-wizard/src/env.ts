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
 */
export async function openUrl(url: string): Promise<void> {
  const candidates =
    process.platform === "darwin"
      ? ["open"]
      : [process.env.BROWSER, CHROME, "xdg-open"].filter(Boolean) as string[];

  for (const bin of candidates) {
    try {
      execa(bin, [url], { detached: true, stdio: "ignore" }).unref();
      return;
    } catch {
      // try the next candidate
    }
  }
}
