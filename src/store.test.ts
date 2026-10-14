import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "./store.ts";
import type { Goal } from "./types.ts";

function goal(scope: string, title: string): Goal {
  const now = "2026-10-14T00:00:00.000Z";
  return {
    id: `${scope}-1`,
    scope,
    title,
    plan: "p",
    dod: ["d"],
    approvedFiles: ["a.ts"],
    status: "ACTIVE",
    stallCount: 0,
    gates: [],
    createdAt: now,
    updatedAt: now,
  };
}

test("putGoal leaves other scopes untouched", () => {
  const dir = mkdtempSync(join(tmpdir(), "pag-"));
  const store = new FileStore(dir);
  store.putGoal(goal("alpha", "A"));
  store.putGoal(goal("beta", "B"));
  store.putGoal({ ...goal("alpha", "A2"), title: "A2" });
  assert.equal(store.getGoal("beta")?.title, "B");
  assert.equal(store.getGoal("alpha")?.title, "A2");
  assert.equal(store.getGoal("gamma"), undefined);
});
