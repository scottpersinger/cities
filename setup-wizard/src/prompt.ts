import * as p from "@clack/prompts";

/**
 * Await a clack prompt and exit the whole wizard if the user cancels
 * (Escape or Ctrl+C). Centralizing this guarantees Escape = quit setup,
 * everywhere, with no per-call isCancel boilerplate.
 *
 *   const name = await ask(p.text({ message: "Name?" }));
 */
export async function ask<T>(value: T | Promise<T>): Promise<Exclude<T, symbol>> {
  const v = await value;
  if (p.isCancel(v)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }
  return v as Exclude<T, symbol>;
}
