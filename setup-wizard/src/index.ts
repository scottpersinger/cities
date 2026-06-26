#!/usr/bin/env node
import * as p from "@clack/prompts";
import { inspect } from "node:util";
import { ask } from "./prompt.js";
import { inDesktop } from "./env.js";
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

  // Resume support: if some steps are already done, offer to jump in.
  const doneCount = state.completed.length;
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

    // Idempotency: offer to skip already-satisfied steps.
    if (step.check) {
      try {
        if (await step.check(ctx)) {
          const skip = await ask(
            p.confirm({
              message: `"${step.title}" looks already done. Skip it?`,
              initialValue: true,
            }),
          );
          if (skip) {
            markComplete(state, step.id);
            await ctx.save();
            continue;
          }
        }
      } catch {
        // check failures are non-fatal — just run the step
      }
    }

    try {
      await step.run(ctx);
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
