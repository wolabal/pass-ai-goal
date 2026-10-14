import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const serverPath = join(root, "mcp-server.ts");

function send(child: ReturnType<typeof spawn>, msg: unknown): void {
  const body = JSON.stringify(msg);
  child.stdin!.write(
    `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
}

function readMsg(child: ReturnType<typeof spawn>): Promise<any> {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const t = setTimeout(() => {
      child.stdout!.off("data", onData);
      reject(new Error("timeout"));
    }, 3000);
    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk]);
      const headerEnd = buf.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = buf.subarray(0, headerEnd).toString();
      const m = /Content-Length:\s*(\d+)/i.exec(header);
      if (!m) {
        clearTimeout(t);
        child.stdout!.off("data", onData);
        reject(new Error("no Content-Length"));
        return;
      }
      const len = Number(m[1]);
      const start = headerEnd + 4;
      if (buf.length < start + len) return;
      const json = buf.subarray(start, start + len).toString();
      clearTimeout(t);
      child.stdout!.off("data", onData);
      resolve(JSON.parse(json));
    };
    child.stdout!.on("data", onData);
  });
}

test("mcp initialize and create_goal/get_goal", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pag-mcp-"));
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PASS_AI_GOAL_DIR: dir },
    stdio: ["pipe", "pipe", "pipe"],
  });
  try {
    send(child, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    });
    const init = await readMsg(child);
    assert.equal(init.result.serverInfo.name, "pass-ai-goal");

    send(child, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "create_goal",
        arguments: {
          scope: "app",
          title: "t",
          plan: "p",
          dod: ["d"],
          approvedFiles: ["a.ts"],
        },
      },
    });
    const created = await readMsg(child);
    const createdBody = JSON.parse(created.result.content[0].text);
    assert.equal(createdBody.status, "ACTIVE");

    send(child, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_goal", arguments: { scope: "app" } },
    });
    const got = await readMsg(child);
    const gotBody = JSON.parse(got.result.content[0].text);
    assert.equal(gotBody.title, "t");
  } finally {
    child.kill();
  }
});
