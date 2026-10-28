import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Decision } from "./domain.ts";

/** Append-only record of decisions and their outcomes. The learning artifact. */
export interface Journal {
  append(decision: Decision): Promise<void>;
  read(): Promise<Decision[]>;
}

export class MemoryJournal implements Journal {
  #items: Decision[] = [];

  async append(decision: Decision): Promise<void> {
    this.#items.push(decision);
  }

  async read(): Promise<Decision[]> {
    return [...this.#items];
  }
}

export class FileJournal implements Journal {
  #path: string;

  constructor(directory: string) {
    this.#path = join(directory, "journal.jsonl");
  }

  get path(): string {
    return this.#path;
  }

  async append(decision: Decision): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    await appendFile(this.#path, `${JSON.stringify(decision)}\n`, "utf8");
  }

  async read(): Promise<Decision[]> {
    try {
      const raw = await readFile(this.#path, "utf8");
      return raw
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Decision);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
}
