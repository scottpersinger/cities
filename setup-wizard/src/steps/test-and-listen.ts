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

  async run() {
    // --- Smoke test ---------------------------------------------------------
    p.note(
      [
        "Claude Code will run a one-shot prompt that uses the Chrome extension",
        "to open a page and report its title. Watch the desktop browser.",
      ].join("\n"),
      "Smoke test",
    );

    const doTest = await ask(p.confirm({ message: "Run the smoke test now?" }));

    if (doTest) {
      try {
        await claude([
          "-p",
          "Using the Claude-in-Chrome extension, open https://example.com, " +
            "then tell me the page title. If you cannot reach the browser, say so.",
        ]);
        const ok = await ask(
          p.confirm({ message: "Did Claude open the page and report the title?" }),
        );
        if (!ok) {
          p.log.warn(
            "Smoke test not confirmed — check the extension pairing (step 3) and retry.",
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
