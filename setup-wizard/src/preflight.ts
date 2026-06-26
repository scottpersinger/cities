import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { inDesktop, capture } from "./env.js";

/**
 * The desktop bring-up script baked into the image (cities/.devcontainer/
 * Dockerfile copies start-desktop.sh here). Idempotent: returns fast if KasmVNC
 * is already serving on the web port, otherwise launches XFCE+KasmVNC (a cold
 * start can take up to ~2 min while the boot-time port forwarder releases 6080).
 * Always exits 0, so we verify the port ourselves below.
 */
const DESKTOP_SCRIPT = "/usr/local/bin/start-desktop.sh";
const WEB_PORT = "6080";

async function portServing(): Promise<boolean> {
  try {
    const out = await capture("ss", ["-ltn"]);
    return out.includes(`:${WEB_PORT} `);
  } catch {
    return false;
  }
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
  await capture("bash", [DESKTOP_SCRIPT], { reject: false, timeout: 180_000 });

  if (await portServing()) {
    s.stop("Desktop is running (KasmVNC on :6080).");
  } else {
    s.stop(
      "Desktop didn't come up — continuing anyway. Re-run /usr/local/bin/start-desktop.sh if browser steps fail.",
    );
  }
}
