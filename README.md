# pass-ai-goal

State-machine goal engine + MCP stdio server. Stops scope creep, skipped verification, and no-progress loops.

Zero npm deps. Node 22+.

```
npm test
node src/mcp-server.ts
```

State: `.pass-ai-goal/state.json` (or `PASS_AI_GOAL_DIR`). Audit: `audit-history.jsonl`.

Tools: `get_goal`, `create_goal`, `execute_approved_implementation`, `verify_and_record_gate`, `diagnose_and_remediate_block`, `resume_goal`, `run_full_completion_check`.

Claude Code:

```
claude mcp add pass-ai-goal -- node /Users/wolabal/github/pass-ai-goal/src/mcp-server.ts
```

Skipped: `evaluate_and_feedback` (add when you want auto write-back into the instruction file).
