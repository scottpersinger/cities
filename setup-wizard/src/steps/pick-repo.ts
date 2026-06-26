import * as p from "@clack/prompts";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { capture, claude, openUrl, run } from "../env.js";
import { ask } from "../prompt.js";
import type { Step } from "../types.js";

interface RepoEntry {
  nameWithOwner: string;
}

/** Parse a .env file body into key/value pairs (handles `export`, quotes, #). */
function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    let key = line.slice(0, eq).trim();
    if (key.startsWith("export ")) key = key.slice("export ".length).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

/** Step 5 — choose a repo, load its env, clone it, set it up, and open it. */
export const pickRepo: Step = {
  id: "pick-repo",
  title: "Pick a repo to work on",
  summary: "Choose a repo, push its .env to Codespace secrets, clone, set up, open",

  async run(ctx) {
    // --- Choose a repo ------------------------------------------------------
    const s = p.spinner();
    s.start("Loading your repositories (gh repo list)…");
    let repos: RepoEntry[] = [];
    try {
      const json = await capture("gh", [
        "repo",
        "list",
        "--json",
        "nameWithOwner",
        "--limit",
        "100",
      ]);
      repos = JSON.parse(json) as RepoEntry[];
      // gh returns most-recently-pushed first; sort alphabetically (case-
      // insensitive) so the list is easy to scan.
      repos.sort((a, b) =>
        a.nameWithOwner.localeCompare(b.nameWithOwner, undefined, {
          sensitivity: "base",
        }),
      );
      s.stop(`Found ${repos.length} repositories.`);
    } catch {
      s.stop("Could not list repos via gh.");
      throw new Error("`gh repo list` failed — is gh authenticated?");
    }

    const repo = await ask(
      p.select({
        message: "Which repository do you want to work on?",
        options: repos.map((r) => ({ value: r.nameWithOwner, label: r.nameWithOwner })),
        maxItems: 12,
      }),
    );
    const repoName = String(repo);

    // --- Load + apply .env --------------------------------------------------
    const envPathInput = await ask(
      p.text({
        message: "Path to the .env file to apply (leave blank to skip)",
        placeholder: "./.env",
      }),
    );

    let env: Record<string, string> = {};
    const envPath = String(envPathInput || "").trim();
    if (envPath) {
      try {
        env = parseEnv(await readFile(envPath, "utf8"));
      } catch {
        throw new Error(`Could not read env file at ${envPath}`);
      }

      const keys = Object.keys(env);
      if (keys.length) {
        const s2 = p.spinner();
        s2.start(`Pushing ${keys.length} vars to Codespace secrets for ${repoName}…`);
        for (const key of keys) {
          // Store as a Codespaces secret scoped to this repo (takes effect on
          // the next codespace start)…
          await run(
            "gh",
            ["secret", "set", key, "--app", "codespaces", "--repo", repoName, "--body", env[key]],
            { stdio: "pipe" },
          ).catch(() => p.log.warn(`Failed to set secret ${key}`));
          // …and export into the current process env so this session can use it.
          process.env[key] = env[key];
        }
        s2.stop("Secrets pushed and loaded into the current environment.");
      }
    }

    // --- Clone --------------------------------------------------------------
    const projects = path.join(os.homedir(), "projects");
    const dest = path.join(projects, repoName.split("/")[1] ?? "repo");
    const sClone = p.spinner();
    sClone.start(`Cloning ${repoName} into ${dest}…`);
    try {
      await run("gh", ["repo", "clone", repoName, dest], { stdio: "pipe" });
      sClone.stop(`Cloned to ${dest}.`);
    } catch {
      sClone.stop("Clone skipped (already present or failed).");
    }
    // Drop a local .env into the checkout too, so the app sees it immediately.
    if (Object.keys(env).length) {
      const body =
        Object.entries(env)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n") + "\n";
      await writeFile(path.join(dest, ".env"), body, "utf8").catch(() => {});
    }

    ctx.state.repo = repoName;
    ctx.state.repoPath = dest;
    await ctx.save();

    // --- Let Claude set up + run the app ------------------------------------
    const setup = await ask(
      p.confirm({ message: "Run Claude Code to set up and start the app?" }),
    );
    if (setup) {
      p.note(
        "Claude Code will run in the repo. When the app is up, type /exit to return.",
        "Setting up the app",
      );
      await claude(
        [
          "Set up this project and run it locally. Install dependencies, " +
            "apply any required setup, then start the dev server. Tell me the " +
            "local URL and port it is listening on.",
        ],
        { cwd: dest },
      ).catch(() => p.log.warn("Claude Code exited; you can re-run this step."));
    }

    // --- Open the app -------------------------------------------------------
    const portInput = await ask(
      p.text({
        message: "What port is the app listening on?",
        placeholder: "3000",
        defaultValue: "3000",
      }),
    );
    const port = String(portInput || "3000").trim();
    await openUrl(`http://localhost:${port}`);
    p.log.success(`Opened http://localhost:${port} in the desktop browser.`);
  },
};
