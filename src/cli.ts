#!/usr/bin/env node
import { configureCodex } from "./codex.js";
import { run } from "./orchestrator.js";

const args = process.argv.slice(2);
const { task, root, skipGitRepoCheck, verbose, sessionId, error } = parseArgs(args);

if (error) {
  console.error(error);
  process.exit(1);
}

if (!task) {
  console.error(
    "Usage: pnpm codex-roles \"<task>\" [--cwd <path>] [--session <id>] [--skip-git-repo-check] [--verbose]",
  );
  process.exit(1);
}

configureCodex({ workingDirectory: root, skipGitRepoCheck });
run(task, root, { verbose, sessionId }).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});

function parseArgs(args: string[]): {
  task: string;
  root: string;
  skipGitRepoCheck: boolean;
  verbose: boolean;
  sessionId: string;
  error?: string;
} {
  let root = process.cwd();
  let skipGitRepoCheck = false;
  let verbose = false;
  let sessionId = "default";
  const taskParts: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--cwd") {
      const value = args[i + 1];
      if (!value) {
        return { task: "", root, skipGitRepoCheck, error: "Missing value for --cwd." };
      }
      root = value;
      i += 1;
      continue;
    }
    if (arg === "--skip-git-repo-check") {
      skipGitRepoCheck = true;
      continue;
    }
    if (arg === "--session") {
      const value = args[i + 1];
      if (!value) {
        return { task: "", root, skipGitRepoCheck, verbose, sessionId, error: "Missing value for --session." };
      }
      sessionId = value;
      i += 1;
      continue;
    }
    if (arg === "--verbose") {
      verbose = true;
      continue;
    }
    taskParts.push(arg);
  }
  return { task: taskParts.join(" ").trim(), root, skipGitRepoCheck, verbose, sessionId };
}
