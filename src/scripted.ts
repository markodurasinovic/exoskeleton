import type { Clock, VirtualClock } from "./clock.ts";
import type { Runtime, RuntimeEvent } from "./runtime.ts";

/** A scripted event, optionally advancing virtual time before it is emitted. */
export type ScriptStep = RuntimeEvent & { afterMs?: number };

/**
 * Replays a fixed script. It exists so the loop contract can be tested without
 * a model: every pace rule becomes a matter of arithmetic, not patience.
 */
export class ScriptedRuntime implements Runtime {
  readonly name = "scripted";

  #leases: ScriptStep[][];
  #clock: VirtualClock;
  #aborted = false;

  constructor(leases: ScriptStep[][], clock: VirtualClock) {
    this.#leases = leases;
    this.#clock = clock;
  }

  run(): AsyncIterable<RuntimeEvent> {
    const runtime = this;
    return (async function* () {
      runtime.#aborted = false;
      const steps = runtime.#leases.shift() ?? [];
      for (const step of steps) {
        if (runtime.#aborted) return;
        runtime.#clock.advance(step.afterMs ?? 0);
        const { afterMs: _afterMs, ...event } = step;
        yield event;
      }
    })();
  }

  async abort(): Promise<void> {
    this.#aborted = true;
  }
}
