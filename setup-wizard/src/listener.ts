import { CODERBOTS_HOME } from "./env.js";
import path from "node:path";

/**
 * The "coding agent event listener" started in step 4.
 *
 * Intended contract (NET-NEW — depends on Central work that does not exist
 * yet): a long-lived client that opens a connection to Central's event
 * dispatcher and, for each inbound event, drives a Claude Code run inside this
 * codespace. This is the codespace-side counterpart of central's Slack bridge
 * (today central only *enqueues* events; nothing dispatches them outward yet).
 *
 * For now this module documents the contract and provides a stub so the wizard
 * flow is complete end-to-end. Wire up the real transport once Central exposes
 * a dispatch endpoint.
 *
 * Expected env when implemented:
 *   CENTRAL_URL    base URL of the control plane
 *   CENTRAL_TOKEN  per-codespace auth token issued by Central
 */

export const LISTENER_PID_FILE = path.join(CODERBOTS_HOME, "listener.pid");

export interface ListenerConfig {
  centralUrl?: string;
  token?: string;
}

export function listenerConfigFromEnv(): ListenerConfig {
  return {
    centralUrl: process.env.CENTRAL_URL,
    token: process.env.CENTRAL_TOKEN,
  };
}

/**
 * Start the listener as a managed background process. STUB: returns a status
 * describing what is/isn't wired up rather than actually connecting.
 *
 * TODO(central-dispatch): replace with a real connection (SSE/WebSocket) to
 * Central's dispatcher, spawn `claude` per event, and daemonize (pm2 / user
 * systemd) writing its pid to LISTENER_PID_FILE.
 */
export async function startListener(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const cfg = listenerConfigFromEnv();
  if (!cfg.centralUrl || !cfg.token) {
    return {
      ok: false,
      reason:
        "CENTRAL_URL / CENTRAL_TOKEN are not set, and Central's event dispatcher is not implemented yet. Skipping for now.",
    };
  }
  // Placeholder until the dispatcher contract lands.
  return {
    ok: false,
    reason:
      "Listener transport is not implemented yet (see src/listener.ts TODO). Config is present but there is nothing to connect to.",
  };
}
