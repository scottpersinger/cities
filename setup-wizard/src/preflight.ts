import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import net from "node:net";
import { inDesktop, capture } from "./env.js";

/**
 * The desktop bring-up script baked into the image (the repo's .devcontainer/
 * Dockerfile copies start-desktop.sh here). Idempotent: returns fast if KasmVNC
 * is already serving on the web port, otherwise launches XFCE+KasmVNC (a cold
 * start can take up to ~2 min while the boot-time port forwarder releases 6080).
 * Always exits 0, so we verify the port ourselves below.
 */
const DESKTOP_SCRIPT = "/usr/local/bin/start-desktop.sh";
const WEB_PORT = 6080;

// Detect "already serving" with a plain TCP connect rather than shelling out to
// `ss`. `ss` lives in /usr/sbin, which is usually NOT on a non-login shell's
// PATH (which is what the wizard runs under), so `ss` would ENOENT and we'd
// wrongly conclude the desktop is down — then run the script, whose own ss-based
// check fails the same way and needlessly kills+relaunches the desktop. A
// connect has no PATH dependency and can't be fooled that way.
function canConnect(port: number, host: string, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    sock.connect(port, host);
  });
}

async function portServing(): Promise<boolean> {
  // KasmVNC binds all interfaces; try IPv4 then IPv6 loopback.
  return (await canConnect(WEB_PORT, "127.0.0.1")) || (await canConnect(WEB_PORT, "::1"));
}

/**
 * Pre-step: make sure the XFCE/KasmVNC desktop is up before any browser- or
 * agent-auth step runs (those open Chrome on DISPLAY :1, which only exists when
 * the desktop is running). No-op off the Codespace desktop (e.g. local dev).
 */
export async function ensureDesktop(): Promise<void> {
  if (!inDesktop) {
    p.log.info("Skipping desktop start — not inside the Codespace desktop.");
    return;
  }
  if (!existsSync(DESKTOP_SCRIPT)) {
    p.log.warn(`Desktop start script not found at ${DESKTOP_SCRIPT}; continuing.`);
    return;
  }

  if (await portServing()) {
    p.log.success("Desktop already running (KasmVNC on :6080).");
    return;
  }

  const s = p.spinner();
  s.start("Starting the desktop (KasmVNC) — this can take a minute on a cold start…");
  // reject:false because the script always exits 0; the port check is the real
  // signal. Generous timeout covers the cold-start port-forwarder contention.
  // Ensure /usr/sbin (and /sbin) are on PATH so the script's own `ss`-based
  // serving check resolves — otherwise it can't tell it's already up and would
  // kill+relaunch the desktop.
  const PATH = `/usr/sbin:/sbin:${process.env.PATH ?? ""}`;
  await capture("bash", [DESKTOP_SCRIPT], {
    reject: false,
    timeout: 180_000,
    env: { ...process.env, PATH },
  });

  if (await portServing()) {
    s.stop("Desktop is running (KasmVNC on :6080).");
  } else {
    s.stop(
      "Desktop didn't come up — continuing anyway. Re-run /usr/local/bin/start-desktop.sh if browser steps fail.",
    );
  }
}
