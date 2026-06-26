import * as p from "@clack/prompts";
import net from "node:net";
import { openUrl, capture } from "../env.js";
import { upsertBridgeEnv, restartBridge } from "../bridge-ctl.js";
import { ask } from "../prompt.js";
import type { Step, StepContext } from "../types.js";

// Chrome Web Store search for the Claude-in-Chrome extension.
const EXTENSION_URL = "https://chromewebstore.google.com/search/claude%20chrome";
// The desktop Chrome's remote-debugging endpoint (enabled by the image's
// google-chrome wrapper, --remote-debugging-port=9222).
const DEBUG_PORT = 9222;
const DEBUG_URL = `http://127.0.0.1:${DEBUG_PORT}`;

// Is something listening on the Chrome debug port? (no PATH/binary dependency)
function debugPortOpen(timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
    sock.connect(DEBUG_PORT, "127.0.0.1");
  });
}

// Option A: the Claude-in-Chrome extension (CLAUDE_CHROME on -> claude --chrome).
async function setupExtension(ctx: StepContext): Promise<void> {
  p.note(
    [
      "Opening a Chrome Web Store search for the Claude extension.",
      "1. Open the “Claude in Chrome” (by Anthropic) result.",
      "2. Click “Add to Chrome”, then confirm.",
      "3. Open the extension and sign in / pair it with your Claude account.",
      "4. Grant the permissions it requests.",
    ].join("\n"),
    "Install the browser extension",
  );

  await openUrl(EXTENSION_URL);

  const installed = await ask(
    p.confirm({ message: "Did the extension install and pair successfully?" }),
  );
  if (!installed) {
    throw new Error(
      "Extension not confirmed installed. Re-run this step once it's added and paired.",
    );
  }

  upsertBridgeEnv("CLAUDE_CHROME", "1"); // bot runs claude with --chrome
  process.env.CLAUDE_CHROME = "1";
  ctx.state.browser = "extension";
  await ctx.save();
  await restartBridge();
  p.log.success("Claude-in-Chrome is installed.");
}

// Option B: the Chrome DevTools MCP — no extension; the agent drives the desktop
// Chrome over the DevTools Protocol via the debug port.
async function setupDevtoolsMcp(ctx: StepContext): Promise<void> {
  p.note(
    [
      "The Chrome DevTools MCP drives Chrome over the DevTools Protocol — no",
      "extension to install. It connects to the desktop Chrome on its debug",
      `port (${DEBUG_URL}), which the image enables.`,
    ].join("\n"),
    "Chrome DevTools MCP",
  );

  // Warn early if Chrome isn't exposing the debug port — the MCP can register
  // fine but won't be able to connect at runtime until this is up.
  if (!(await debugPortOpen())) {
    p.log.warn(
      `Chrome's debug port (${DEBUG_PORT}) isn't responding. The agent can't ` +
        "drive Chrome over CDP until it is — usually because the codespace " +
        "image hasn't been rebuilt with --remote-debugging-port, or the desktop " +
        "Chrome isn't running. Rebuild the container (or start the desktop) and " +
        "re-run this step. Registering the MCP anyway.",
    );
  } else {
    p.log.success(`Chrome debug port ${DEBUG_PORT} is open.`);
  }

  const s = p.spinner();
  s.start("Registering the chrome-devtools MCP server (user scope)…");
  // Idempotent: drop any prior registration, then add.
  await capture("claude", ["mcp", "remove", "chrome-devtools", "--scope", "user"], {
    reject: false,
  });
  try {
    await capture("claude", [
      "mcp",
      "add",
      "chrome-devtools",
      "--scope",
      "user",
      "--",
      "npx",
      "-y",
      "chrome-devtools-mcp@latest",
      `--browser-url=${DEBUG_URL}`,
    ]);
    s.stop("Registered the chrome-devtools MCP server.");
  } catch (err) {
    s.stop("Could not register the MCP server.");
    throw new Error(
      `\`claude mcp add chrome-devtools\` failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  // This path doesn't use the extension, so the bot must NOT pass --chrome
  // (that loads the Claude-in-Chrome MCP); the chrome-devtools MCP provides the
  // browser tools instead.
  upsertBridgeEnv("CLAUDE_CHROME", "0");
  process.env.CLAUDE_CHROME = "0";
  ctx.state.browser = "devtools";
  await ctx.save();
  await restartBridge();
  p.log.success(
    "Chrome DevTools MCP is set up — the agent will drive Chrome over CDP.",
  );
}

/** Step 3 — set up how the agent controls the browser. */
export const installExtension: Step = {
  id: "install-extension",
  title: "Set up browser control",
  summary: "Claude-in-Chrome extension, or the Chrome DevTools MCP",
  ownsSkip: true, // the method select below carries its own "Skip" option

  // No reliable programmatic check from outside the browser; always offer it.
  async run(ctx) {
    const method = await ask(
      p.select({
        message: "How should the agent control the browser?",
        options: [
          {
            value: "extension",
            label: "Claude-in-Chrome extension",
            hint: "install + pair the extension",
          },
          {
            value: "devtools",
            label: "Chrome DevTools MCP",
            hint: "no extension; drives Chrome over the debug port",
          },
          { value: "skip", label: "Skip this step", hint: "set this up later" },
        ],
        initialValue: "extension",
      }),
    );

    if (method === "skip") return { skipped: true };
    if (method === "devtools") await setupDevtoolsMcp(ctx);
    else await setupExtension(ctx);
  },
};
