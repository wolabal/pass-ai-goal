export type Status = "ACTIVE" | "PAUSED" | "BLOCKED" | "COMPLETE";

export type GateMeans =
  | "UNIT_TEST"
  | "INTEGRATION_TEST"
  | "E2E_CHECK"
  | "IMPACT"
  | "FAILURE_SCENARIO";

export type Gate = {
  stage: 1 | 2 | "full";
  means: GateMeans;
  passed: boolean;
  evidence: string;
  at: string;
};

export type Goal = {
  id: string;
  scope: string;
  title: string;
  plan: string;
  dod: string[];
  approvedFiles: string[];
  status: Status;
  stallReason?: string;
  stallCount: number;
  gates: Gate[];
  remediated?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StateFile = {
  goals: Record<string, Goal>;
};

export type CreateGoalInput = {
  scope: string;
  title: string;
  plan: string;
  dod: string[];
  approvedFiles: string[];
};

export type VerifyGateInput = {
  scope: string;
  stage: 1 | 2;
  means: GateMeans;
  passed: boolean;
  evidence: string;
  stop?: boolean;
};
