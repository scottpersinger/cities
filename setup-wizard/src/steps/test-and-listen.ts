import * as p from "@clack/prompts";
import { claude } from "../env.js";
import { startListener } from "../listener.js";
import { ask } from "../prompt.js";
import type { Step } from "../types.js";

/**
 * Step 4 — smoke-test that Claude Code works (ideally driving Chrome via the
 * extension), then start the agent event listener that connects to Central.
 */
export const testAndListen: Step = {
  id: "test-and-listen",
  title: "Test the agent + start the listener",
  summary: "Run a Claude Code + Chrome smoke test and connect to Central",

  async run(ctx) {
    // --- Smoke test ---------------------------------------------------------
    // Adapt to how step 3 set up browser control. Keep CLAUDE_CHROME in sync so
    // claude() passes --chrome only in extension mode.
    const devtools = ctx.state.browser === "devtools";
    process.env.CLAUDE_CHROME = devtools ? "0" : "1";

    p.note(
      [
        devtools
          ? "Claude Code will run a one-shot prompt that uses the Chrome DevTools"
          : "Claude Code will run a one-shot prompt that uses the Chrome extension",
        "to open a page and report its title. Watch the desktop browser.",
      ].join("\n"),
      "Smoke test",
    );

    const doTest = await ask(p.confirm({ message: "Run the smoke test now?" }));

    if (doTest) {
      const prompt = devtools
        ? [
            "Using the chrome-devtools MCP tools, open https://example.com and",
            "tell me the page title. If you cannot reach the browser, say so.",
          ].join(" ")
        : [
            "Using the Claude-in-Chrome extension, open https://example.com and",
            "tell me the page title.",
            "If more than one browser is connected, do NOT ask me to choose —",
            "automatically select the one running on Linux (this codespace's",
            "desktop); a macOS/Windows browser, if present, is the user's laptop",
            "and must be ignored. If exactly one is connected, just use it.",
            "If you cannot reach any browser, say so.",
          ].join(" ");
      try {
        await claude(["-p", prompt]);
        const ok = await ask(
          p.confirm({ message: "Did Claude open the page and report the title?" }),
        );
        if (!ok) {
          p.log.warn(
            "Smoke test not confirmed — re-check the browser-control setup (step 3) and retry.",
          );
        } else {
          p.log.success("Claude Code + Chrome are working.");
        }
      } catch {
        p.log.warn("Smoke test command failed; continuing.");
      }
    }

    // --- Start the listener -------------------------------------------------
    const s = p.spinner();
    s.start("Starting the agent event listener…");
    const res = await startListener();
    if (res.ok) {
      s.stop("Listener connected to Central.");
    } else {
      s.stop("Listener not started.");
      p.log.warn(res.reason);
    }
  },
};
