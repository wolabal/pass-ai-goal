import { randomUUID } from "node:crypto";
import type { FileStore } from "./store.ts";
import type { CreateGoalInput, Goal, VerifyGateInput } from "./types.ts";

function err(msg: string): never {
  throw new Error(msg);
}

export class GoalEngine {
  store: FileStore;
  now: () => Date;

  constructor(store: FileStore, now?: () => Date) {
    this.store = store;
    this.now = now ?? (() => new Date());
  }

  private stamp(): string {
    return this.now().toISOString();
  }

  private require(scope: string): Goal {
    return this.store.getGoal(scope) ?? err(`no goal for scope ${scope}`);
  }

  private save(goal: Goal): Goal {
    goal.updatedAt = this.stamp();
    this.store.putGoal(goal);
    return goal;
  }

  getGoal(scope: string): Goal | undefined {
    return this.store.getGoal(scope);
  }

  createGoal(input: CreateGoalInput): Goal {
    if (!input.scope?.trim()) err("scope required");
    if (!input.title?.trim()) err("title required");
    if (!input.plan?.trim()) err("plan required");
    if (!input.dod?.length) err("dod required");
    const existing = this.store.getGoal(input.scope);
    if (existing && existing.status !== "COMPLETE") {
      err(`goal exists for scope ${input.scope}`);
    }
    const at = this.stamp();
    const goal: Goal = {
      id: randomUUID(),
      scope: input.scope,
      title: input.title,
      plan: input.plan,
      dod: input.dod,
      approvedFiles: input.approvedFiles ?? [],
      status: "ACTIVE",
      stallCount: 0,
      gates: [],
      createdAt: at,
      updatedAt: at,
    };
    this.store.putGoal(goal);
    return goal;
  }

  executeApproved(scope: string, files: string[]): Goal {
    const goal = this.require(scope);
    if (goal.status !== "ACTIVE") err(`cannot implement in ${goal.status}`);
    const extra = files.filter((f) => !goal.approvedFiles.includes(f));
    if (extra.length) err(`files not approved: ${extra.join(", ")}`);
    return this.save(goal);
  }

  verifyGate(input: VerifyGateInput): Goal {
    const goal = this.require(input.scope);
    if (goal.status !== "ACTIVE") err(`cannot verify in ${goal.status}`);
    goal.gates.push({
      stage: input.stage,
      means: input.means,
      passed: input.passed,
      evidence: input.evidence,
      at: this.stamp(),
    });
    if (input.stop) {
      goal.status = "PAUSED";
      return this.save(goal);
    }
    if (!input.passed) {
      const reason = `${input.stage}:${input.means}`;
      if (goal.stallReason === reason) goal.stallCount += 1;
      else {
        goal.stallReason = reason;
        goal.stallCount = 1;
      }
      if (goal.stallCount >= 3) {
        goal.status = "BLOCKED";
        goal.remediated = false;
      }
    } else {
      goal.stallCount = 0;
      goal.stallReason = undefined;
    }
    return this.save(goal);
  }

  diagnose(scope: string, analysis: string, actions: string): Goal {
    const goal = this.require(scope);
    if (goal.status !== "BLOCKED") err("diagnose only when BLOCKED");
    if (!analysis.trim() || !actions.trim()) err("analysis and actions required");
    goal.remediated = true;
    return this.save(goal);
  }

  resume(scope: string): Goal {
    const goal = this.require(scope);
    if (goal.status === "BLOCKED") {
      if (!goal.remediated) err("diagnose required before resume");
    } else if (goal.status !== "PAUSED") {
      err(`cannot resume from ${goal.status}`);
    }
    goal.status = "ACTIVE";
    goal.stallCount = 0;
    goal.stallReason = undefined;
    goal.remediated = false;
    return this.save(goal);
  }

  fullCheck(scope: string): Goal {
    const goal = this.require(scope);
    if (goal.status !== "ACTIVE") err(`cannot complete from ${goal.status}`);
    const stage1 = goal.gates.some((g) => g.stage === 1 && g.passed);
    const stage2 = goal.gates.some((g) => g.stage === 2 && g.passed);
    if (!stage1 || !stage2) err("gate evidence missing");
    goal.gates.push({
      stage: "full",
      means: "E2E_CHECK",
      passed: true,
      evidence: "both stages passed",
      at: this.stamp(),
    });
    goal.status = "COMPLETE";
    return this.save(goal);
  }
}
