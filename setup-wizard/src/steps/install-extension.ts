import * as p from "@clack/prompts";
import { openUrl } from "../env.js";
import { ask } from "../prompt.js";
import type { Step } from "../types.js";

// Chrome Web Store search for the Claude-in-Chrome extension.
const EXTENSION_URL =
  "https://chromewebstore.google.com/search/claude%20chrome";

/** Step 3 — install and pair the Claude-in-Chrome extension. */
export const installExtension: Step = {
  id: "install-extension",
  title: "Install Claude-in-Chrome extension",
  summary: "Add the extension in the desktop Chrome and pair it with Claude Code",

  // No reliable programmatic check from outside the browser; always guide.
  async run() {
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
    p.log.success("Claude-in-Chrome is installed.");
  },
};
