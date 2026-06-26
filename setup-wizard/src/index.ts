#!/usr/bin/env node
import * as p from "@clack/prompts";
import { inspect } from "node:util";
import { ask } from "./prompt.js";
import { inDesktop } from "./env.js";
import { ensureDesktop } from "./preflight.js";
import { loadState, markComplete, saveState } from "./state.js";
import { steps } from "./steps/index.js";
import type { StepContext } from "./types.js";

async function main() {
  console.clear();
  p.intro("🤖 coderbots — Codespace setup wizard");

  if (!inDesktop) {
    p.log.warn(
      "Not running inside an agent-dev-desktop Codespace — browser/agent steps may not behave as expected.",
    );
  }

  const state = await loadState();
  const ctx: StepContext = {
    state,
    save: () => saveState(state),
  };

  // Auto-start (folderOpen task): once every step is done, don't nag on each
  // editor open — print a hint and exit. Manual runs (no autostart flag) still
  // fall through and re-offer the steps.
  const autostart =
    process.env.CODERBOTS_AUTOSTART === "1" || process.argv.includes("--auto");
  const doneCount = state.completed.length;
  if (autostart && doneCount >= steps.length) {
    p.outro(
      "✅ Setup already complete. Run `npm run dev` in setup-wizard to re-run.",
    );
    return;
  }

  // Pre-step: bring up the desktop before any browser/agent-auth step (they open
  // Chrome on DISPLAY :1, which only exists while KasmVNC is running).
  await ensureDesktop();

  // Resume support: if some steps are already done, offer to jump in.
  let startIndex = 0;
  if (doneCount > 0 && doneCount < steps.length) {
    const choice = await ask(
      p.select({
        message: `You've completed ${doneCount}/${steps.length} steps. Where do you want to start?`,
        options: [
          {
            value: "resume",
            label: "Resume",
            hint: `continue from "${steps[doneCount]?.title}"`,
          },
          { value: "restart", label: "Start over from step 1" },
        ],
      }),
    );
    startIndex = choice === "resume" ? doneCount : 0;
  }

  for (let i = startIndex; i < steps.length; i++) {
    const step = steps[i];
    p.log.step(`Step ${i + 1}/${steps.length} — ${step.title}`);

    // Is the step already satisfied? (best-effort; check failures aren't fatal)
    let satisfied = false;
    if (step.check) {
      try {
        satisfied = await step.check(ctx);
      } catch {
        /* ignore — treat as not satisfied */
      }
    }

    // autoSkip steps the environment guarantees skip silently when satisfied.
    if (satisfied && step.autoSkip) {
      p.log.info(`"${step.title}" is already done — skipping.`);
      markComplete(state, step.id);
      await ctx.save();
      continue;
    }

    // Steps that already prompt for a choice carry their own "Skip this step"
    // option (ownsSkip) so we don't ask twice. Everything else gets a universal
    // Run/Skip prompt here, defaulting to skip when it already looks done.
    if (!step.ownsSkip) {
      const action = await ask(
        p.select({
          message: "Run this step?",
          options: [
            {
              value: "run",
              label: satisfied ? "Run it again" : "Run it",
              hint: step.summary,
            },
            {
              value: "skip",
              label: "Skip this step",
              hint: satisfied ? "looks already done" : "do it later",
            },
          ],
          initialValue: satisfied ? "skip" : "run",
        }),
      );
      if (action === "skip") {
        // Only mark complete if it's actually satisfied — skipping an unsatisfied
        // step is "later", so it's re-offered next run (setup isn't "complete").
        if (satisfied) {
          markComplete(state, step.id);
          await ctx.save();
        }
        continue;
      }
    }

    try {
      const result = await step.run(ctx);
      if (result?.skipped) {
        // User skipped from within the step's own prompt — don't mark complete.
        continue;
      }
      markComplete(state, step.id);
      await ctx.save();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      p.log.error(`Step failed: ${msg}`);
      const retry = await ask(
        p.select({
          message: "What now?",
          options: [
            { value: "retry", label: "Retry this step" },
            { value: "skip", label: "Skip and continue" },
            { value: "quit", label: "Quit (progress is saved)" },
          ],
        }),
      );
      if (retry === "quit") {
        p.outro("Progress saved. Re-run the wizard to resume.");
        return;
      }
      if (retry === "retry") {
        i--; // run the same step again
        continue;
      }
      // skip: fall through without marking complete
    }
  }

  p.outro("✅ Setup complete. Your agent is ready to work.");
}

main().catch((err) => {
  console.error(inspect(err));
  process.exit(1);
});
