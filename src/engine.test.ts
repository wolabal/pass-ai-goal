import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileStore } from "./store.ts";
import { GoalEngine } from "./engine.ts";

function engine(): GoalEngine {
  const dir = mkdtempSync(join(tmpdir(), "pag-e-"));
  return new GoalEngine(new FileStore(dir), () => new Date("2026-10-14T00:00:00.000Z"));
}

function create(e: GoalEngine) {
  return e.createGoal({
    scope: "app",
    title: "t",
    plan: "do it",
    dod: ["tests pass"],
    approvedFiles: ["src/a.ts"],
  });
}

test("create_goal refuses empty plan or dod", () => {
  const e = engine();
  assert.throws(
    () =>
      e.createGoal({
        scope: "app",
        title: "t",
        plan: "",
        dod: ["x"],
        approvedFiles: [],
      }),
    /plan/i,
  );
  assert.throws(
    () =>
      e.createGoal({
        scope: "app",
        title: "t",
        plan: "p",
        dod: [],
        approvedFiles: [],
      }),
    /dod/i,
  );
});

test("create_goal then get_goal", () => {
  const e = engine();
  const g = create(e);
  assert.equal(g.status, "ACTIVE");
  assert.equal(e.getGoal("app")?.title, "t");
  assert.equal(e.getGoal("other"), undefined);
});

test("create_goal refuses when scope already active", () => {
  const e = engine();
  create(e);
  assert.throws(() => create(e), /exists/i);
});

test("execute_approved rejects files outside approved set", () => {
  const e = engine();
  create(e);
  assert.throws(() => e.executeApproved("app", ["src/b.ts"]), /approved/i);
  const g = e.executeApproved("app", ["src/a.ts"]);
  assert.equal(g.status, "ACTIVE");
});

test("three consecutive failed gates block", () => {
  const e = engine();
  create(e);
  e.verifyGate({
    scope: "app",
    stage: 1,
    means: "IMPACT",
    passed: false,
    evidence: "miss",
  });
  e.verifyGate({
    scope: "app",
    stage: 1,
    means: "IMPACT",
    passed: false,
    evidence: "miss",
  });
  const g = e.verifyGate({
    scope: "app",
    stage: 1,
    means: "IMPACT",
    passed: false,
    evidence: "miss",
  });
  assert.equal(g.status, "BLOCKED");
  assert.equal(g.stallCount, 3);
});

test("blocked cannot resume without diagnose", () => {
  const e = engine();
  create(e);
  for (let i = 0; i < 3; i++) {
    e.verifyGate({
      scope: "app",
      stage: 1,
      means: "IMPACT",
      passed: false,
      evidence: "miss",
    });
  }
  assert.throws(() => e.resume("app"), /diagnose/i);
  e.diagnose("app", "root cause", "fix it");
  const g = e.resume("app");
  assert.equal(g.status, "ACTIVE");
  assert.equal(g.stallCount, 0);
});

test("explicit stop pauses; resume without diagnose", () => {
  const e = engine();
  create(e);
  const p = e.verifyGate({
    scope: "app",
    stage: 1,
    means: "IMPACT",
    passed: true,
    evidence: "ok",
    stop: true,
  });
  assert.equal(p.status, "PAUSED");
  assert.equal(e.resume("app").status, "ACTIVE");
});

test("full check completes only after both stages pass", () => {
  const e = engine();
  create(e);
  assert.throws(() => e.fullCheck("app"), /gate/i);
  e.verifyGate({
    scope: "app",
    stage: 1,
    means: "IMPACT",
    passed: true,
    evidence: "impact ok",
  });
  assert.throws(() => e.fullCheck("app"), /gate/i);
  e.verifyGate({
    scope: "app",
    stage: 2,
    means: "UNIT_TEST",
    passed: true,
    evidence: "tests ok",
  });
  const g = e.fullCheck("app");
  assert.equal(g.status, "COMPLETE");
});
