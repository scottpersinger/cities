/** Persisted wizard progress. Lives at ~/.coderbots/setup-state.json so the
 *  wizard can be re-run and resume where it left off (Codespaces get rebuilt,
 *  auth expires, steps are individually re-runnable). */
export interface WizardState {
  /** ids of steps that have completed at least once */
  completed: string[];
  /** which agent the user installed (only "claude-code" today) */
  agent?: string;
  /** repo selected in step 5, "owner/name" */
  repo?: string;
  /** local checkout path for the selected repo */
  repoPath?: string;
  /** last time the state was written (ISO); set by the saver */
  updatedAt?: string;
}

export interface StepContext {
  state: WizardState;
  /** persist the current state to disk */
  save: () => Promise<void>;
}

export interface Step {
  id: string;
  title: string;
  /** one-line description shown in the resume menu */
  summary: string;
  /**
   * Best-effort idempotency check. Return true if the step is already
   * satisfied so the runner can offer to skip it. Omit if a step should
   * always run.
   */
  check?: (ctx: StepContext) => Promise<boolean>;
  /**
   * When true, a satisfied `check()` skips the step silently instead of asking
   * the user to confirm. Use for steps the environment guarantees (e.g. an
   * agent the image pre-installs) where the "looks done, skip it?" prompt is
   * just noise.
   */
  autoSkip?: boolean;
  /** Do the work. Throw to signal failure; the runner handles reporting. */
  run: (ctx: StepContext) => Promise<void>;
}
