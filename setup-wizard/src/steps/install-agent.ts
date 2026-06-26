import * as p from "@clack/prompts";
import { run, which } from "../env.js";
import { ask } from "../prompt.js";
import type { Step } from "../types.js";

/** Step 1 — install the coding agent (currently only Claude Code). */
export const installAgent: Step = {
  id: "install-agent",
  title: "Install your agent",
  summary: "Install Claude Code (the only agent supported today)",

  async check() {
    // The agent-dev-desktop image installs Claude Code at container create,
    // so on a fresh codespace this is usually already satisfied.
    return which("claude");
  },
  // Claude Code is pre-installed by the image, so when it's present just skip
  // silently — no need to ask the user to confirm.
  autoSkip: true,

  async run(ctx) {
    const agent = await ask(
      p.select({
        message: "Which coding agent do you want to install?",
        options: [
          { value: "claude-code", label: "Claude Code", hint: "recommended" },
        ],
        initialValue: "claude-code",
      }),
    );

    if (await which("claude")) {
      p.log.success("Claude Code is already installed.");
    } else {
      const s = p.spinner();
      s.start("Installing Claude Code (npm i -g @anthropic-ai/claude-code)…");
      try {
        await run("npm", ["install", "-g", "@anthropic-ai/claude-code"], {
          stdio: "pipe",
        });
        s.stop("Claude Code installed.");
      } catch (err) {
        s.stop("Install failed.");
        throw err;
      }
    }

    ctx.state.agent = String(agent);
  },
};
