import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Goal, StateFile } from "./types.ts";

export class FileStore {
  dir: string;
  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
  }

  private statePath(): string {
    return join(this.dir, "state.json");
  }

  load(): StateFile {
    const p = this.statePath();
    if (!existsSync(p)) return { goals: {} };
    return JSON.parse(readFileSync(p, "utf8")) as StateFile;
  }

  private save(state: StateFile): void {
    const p = this.statePath();
    const tmp = p + ".tmp";
    writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n");
    renameSync(tmp, p);
  }

  getGoal(scope: string): Goal | undefined {
    return this.load().goals[scope];
  }

  putGoal(goal: Goal): void {
    const state = this.load();
    state.goals[goal.scope] = goal;
    this.save(state);
    appendFileSync(
      join(this.dir, "audit-history.jsonl"),
      JSON.stringify({
        at: goal.updatedAt,
        scope: goal.scope,
        status: goal.status,
        id: goal.id,
      }) + "\n",
    );
  }
}
