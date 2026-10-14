import { join } from "node:path";
import { FileStore } from "./store.ts";
import { GoalEngine } from "./engine.ts";
import type { GateMeans } from "./types.ts";

const dir = process.env.PASS_AI_GOAL_DIR ?? join(process.cwd(), ".pass-ai-goal");
const engine = new GoalEngine(new FileStore(dir));

const TOOLS = [
  {
    name: "get_goal",
    description: "Return the goal for one scope. Does not touch other scopes.",
    inputSchema: {
      type: "object",
      properties: { scope: { type: "string" } },
      required: ["scope"],
    },
  },
  {
    name: "create_goal",
    description:
      "Create an ACTIVE goal. Refuses empty plan/dod or an unfinished goal in the same scope.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string" },
        title: { type: "string" },
        plan: { type: "string" },
        dod: { type: "array", items: { type: "string" } },
        approvedFiles: { type: "array", items: { type: "string" } },
      },
      required: ["scope", "title", "plan", "dod", "approvedFiles"],
    },
  },
  {
    name: "execute_approved_implementation",
    description: "Allow work only on files already in approvedFiles.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string" },
        files: { type: "array", items: { type: "string" } },
      },
      required: ["scope", "files"],
    },
  },
  {
    name: "verify_and_record_gate",
    description:
      "Stage 1 (impact/failure) or stage 2 (independent accept). stop=true pauses. 3 consecutive fails block.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string" },
        stage: { type: "integer", enum: [1, 2] },
        means: {
          type: "string",
          enum: [
            "UNIT_TEST",
            "INTEGRATION_TEST",
            "E2E_CHECK",
            "IMPACT",
            "FAILURE_SCENARIO",
          ],
        },
        passed: { type: "boolean" },
        evidence: { type: "string" },
        stop: { type: "boolean" },
      },
      required: ["scope", "stage", "means", "passed", "evidence"],
    },
  },
  {
    name: "diagnose_and_remediate_block",
    description: "Required before resume from BLOCKED.",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string" },
        analysis: { type: "string" },
        actions: { type: "string" },
      },
      required: ["scope", "analysis", "actions"],
    },
  },
  {
    name: "resume_goal",
    description: "PAUSED -> ACTIVE. BLOCKED only after diagnose.",
    inputSchema: {
      type: "object",
      properties: { scope: { type: "string" } },
      required: ["scope"],
    },
  },
  {
    name: "run_full_completion_check",
    description: "COMPLETE only if stage 1 and stage 2 both passed.",
    inputSchema: {
      type: "object",
      properties: { scope: { type: "string" } },
      required: ["scope"],
    },
  },
];

function send(msg: unknown): void {
  const body = JSON.stringify(msg);
  process.stdout.write(
    `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
}

function ok(id: unknown, result: unknown): void {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id: unknown, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function toolText(id: unknown, payload: unknown, isError = false): void {
  ok(id, {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError,
  });
}

function callTool(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case "get_goal":
      return engine.getGoal(String(args.scope)) ?? { error: "not found" };
    case "create_goal":
      return engine.createGoal({
        scope: String(args.scope),
        title: String(args.title),
        plan: String(args.plan),
        dod: (args.dod as string[]) ?? [],
        approvedFiles: (args.approvedFiles as string[]) ?? [],
      });
    case "execute_approved_implementation":
      return engine.executeApproved(
        String(args.scope),
        (args.files as string[]) ?? [],
      );
    case "verify_and_record_gate":
      return engine.verifyGate({
        scope: String(args.scope),
        stage: args.stage === 2 ? 2 : 1,
        means: args.means as GateMeans,
        passed: Boolean(args.passed),
        evidence: String(args.evidence ?? ""),
        stop: Boolean(args.stop),
      });
    case "diagnose_and_remediate_block":
      return engine.diagnose(
        String(args.scope),
        String(args.analysis ?? ""),
        String(args.actions ?? ""),
      );
    case "resume_goal":
      return engine.resume(String(args.scope));
    case "run_full_completion_check":
      return engine.fullCheck(String(args.scope));
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

function handle(msg: any): void {
  if (!msg || typeof msg !== "object") return;
  if (msg.method === "notifications/initialized" || msg.method?.startsWith("notifications/")) {
    return;
  }
  const id = msg.id;
  try {
    if (msg.method === "initialize") {
      ok(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "pass-ai-goal", version: "0.1.0" },
      });
      return;
    }
    if (msg.method === "tools/list") {
      ok(id, { tools: TOOLS });
      return;
    }
    if (msg.method === "tools/call") {
      try {
        const result = callTool(msg.params.name, msg.params.arguments ?? {});
        toolText(id, result);
      } catch (e) {
        toolText(id, { error: (e as Error).message }, true);
      }
      return;
    }
    if (msg.method === "ping") {
      ok(id, {});
      return;
    }
    fail(id, -32601, `method not found: ${msg.method}`);
  } catch (e) {
    fail(id, -32603, (e as Error).message);
  }
}

let buf = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (true) {
    const headerEnd = buf.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const header = buf.subarray(0, headerEnd).toString("utf8");
    const m = /Content-Length:\s*(\d+)/i.exec(header);
    if (!m) {
      buf = buf.subarray(headerEnd + 4);
      break;
    }
    const len = Number(m[1]);
    const start = headerEnd + 4;
    if (buf.length < start + len) break;
    const json = buf.subarray(start, start + len).toString("utf8");
    buf = buf.subarray(start + len);
    handle(JSON.parse(json));
  }
});

process.stdin.resume();
