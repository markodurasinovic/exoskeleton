/** Time is injected so every pace rule can be tested without waiting. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};

export class VirtualClock implements Clock {
  #now: number;

  constructor(start = 0) {
    this.#now = start;
  }

  now(): number {
    return this.#now;
  }

  advance(ms: number): void {
    this.#now += ms;
  }
}
