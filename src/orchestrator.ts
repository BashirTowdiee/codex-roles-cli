import { callCodex } from "./codex.js";
import { classifyTask } from "./classify.js";
import { applyPatch } from "./patch.js";
import {
  buildRepoMap,
  DEFAULT_IGNORES,
  extractFilePaths,
  readFilesSafe,
  readPrompt,
  resolveSafePath,
  runCommand,
  searchRepo,
} from "./retrieve.js";
import {
  parseJson,
  validateCodeReview,
  validatePlan,
  validateTextReview,
} from "./schema.js";
import { addEntry, loadSession, saveSession } from "./session.js";

const DOC_EXTENSIONS = [".md", ".mdx"];

type RunOptions = {
  verbose?: boolean;
  sessionId?: string;
};

export async function run(
  task: string,
  root: string = process.cwd(),
  options: RunOptions = {},
): Promise<void> {
  const log = createLogger(options);
  const sessionId = options.sessionId ?? "default";
  const session = await loadSession(root, sessionId);
  addEntry(session, { at: new Date().toISOString(), type: "task", content: task });
  log.stage(`Session loaded: ${session.id}`);

  const classification = await classifyTask(task);
  log.stage("Classification complete.");
  log.detail("Classification", classification);
  addEntry(session, { at: new Date().toISOString(), type: "classification", content: classification });

  const repoMap = await buildRepoMap(root, 3);
  log.stage("Repo map ready.");
  const plannerPrompt = await readPlannerPrompt(classification.taskType);
  const planRaw = await callCodex(plannerPrompt, {
    task,
    taskType: classification.taskType,
    notes: classification.notes,
    repoMap,
    ignores: DEFAULT_IGNORES,
    sessionSummary: session.summary,
  });
  const plan = validatePlan(parseJson(planRaw, "Planner output"));
  log.stage("Plan ready.");
  log.detail("Plan", plan);
  addEntry(session, { at: new Date().toISOString(), type: "plan", content: plan });

  const retrieval = await retrieveContext(root, plan, classification.taskType);
  log.stage("Retrieval complete.");
  log.detail("Retrieval", {
    searchKeys: Object.keys(retrieval.searchResults ?? {}),
    files: Object.keys(retrieval.files ?? {}),
  });
  addEntry(session, { at: new Date().toISOString(), type: "retrieval", content: {
    searchKeys: Object.keys(retrieval.searchResults ?? {}),
    files: Object.keys(retrieval.files ?? {}),
  } });
  const implementerPrompt = await readImplementerPrompt(classification.taskType);
  const implementerRaw = await callCodex(implementerPrompt, {
    task,
    taskType: classification.taskType,
    plan,
    repoMap,
    retrieval,
    sessionSummary: session.summary,
  });
  addEntry(session, { at: new Date().toISOString(), type: "output", content: implementerRaw });

  if (classification.taskType === "code.change") {
    log.stage("Applying patch.");
    await applyPatch(implementerRaw, { root });
    log.stage("Reviewing changes.");
    const review = await reviewCode(task, plan, implementerRaw);
    log.detail("Review", review);
    addEntry(session, { at: new Date().toISOString(), type: "review", content: review });
    if (review.blocking.length > 0) {
      log.stage("Applying fixes.");
      const fixerPrompt = await readPrompt("fixer.code.txt");
      const fixRaw = await callCodex(fixerPrompt, {
        task,
        plan,
        diff: implementerRaw,
        blocking: review.blocking,
        nonBlocking: review.nonBlocking,
      });
      await applyPatch(fixRaw, { root });
    }
    log.stage("Verifying commands.");
    await verifyCommands(root, task, plan, implementerRaw);
    log.stage("Done.");
    await refreshSessionSummary(session, task, classification.taskType, plan, implementerRaw);
    await saveSession(root, session);
    return;
  }

  if (classification.taskType === "docs.write") {
    log.stage("Applying patch.");
    await applyPatch(implementerRaw, { root, allowedExtensions: DOC_EXTENSIONS });
    log.stage("Reviewing output.");
    await reviewText(task, classification.taskType, implementerRaw);
    await refreshSessionSummary(session, task, classification.taskType, plan, implementerRaw);
    await saveSession(root, session);
    log.stage("Done.");
    return;
  }

  log.stage("Reviewing output.");
  await reviewText(task, classification.taskType, implementerRaw);
  await refreshSessionSummary(session, task, classification.taskType, plan, implementerRaw);
  await saveSession(root, session);
  log.stage("Done.");
  process.stdout.write(implementerRaw);
}

async function retrieveContext(root: string, plan: ReturnType<typeof validatePlan>, taskType: string) {
  const searchResults: Record<string, string> = {};
  const files: Record<string, string> = {};
  if (taskType.startsWith("code")) {
    for (const token of plan.search ?? []) {
      searchResults[token] = await searchRepo(root, token);
    }
    if (plan.read && plan.read.length > 0) {
      Object.assign(files, await readFilesSafe(root, plan.read));
    }
  } else {
    if (plan.read && plan.read.length > 0) {
      Object.assign(files, await readFilesSafe(root, plan.read));
    }
  }
  return { searchResults, files };
}

async function readPlannerPrompt(taskType: string): Promise<string> {
  if (taskType === "code.change" || taskType === "code.analysis") {
    return readPrompt("planner.code.txt");
  }
  if (taskType === "docs.write" || taskType === "docs.analysis") {
    return readPrompt("planner.docs.txt");
  }
  return readPrompt("planner.research.txt");
}

async function readImplementerPrompt(taskType: string): Promise<string> {
  if (taskType === "code.change") {
    return readPrompt("implementer.code.txt");
  }
  if (taskType === "docs.write") {
    return readPrompt("implementer.docs.txt");
  }
  return readPrompt("implementer.docs.txt");
}

async function reviewCode(task: string, plan: ReturnType<typeof validatePlan>, diff: string) {
  const reviewPrompt = await readPrompt("reviewer.code.txt");
  const reviewRaw = await callCodex(reviewPrompt, { task, plan, diff });
  return validateCodeReview(parseJson(reviewRaw, "Reviewer output"));
}

async function reviewText(task: string, taskType: string, output: string) {
  const reviewPrompt = await readPrompt("reviewer.text.txt");
  const reviewRaw = await callCodex(reviewPrompt, { task, taskType, output });
  validateTextReview(parseJson(reviewRaw, "Reviewer output"));
}

async function verifyCommands(root: string, task: string, plan: ReturnType<typeof validatePlan>, diff: string) {
  const commands = plan.commands ?? [];
  if (commands.length === 0) {
    return;
  }
  let attempt = 0;
  while (attempt < 3) {
    attempt += 1;
    let failed = false;
    for (const command of commands) {
      const result = await runCommand(command, root);
      if (result.exitCode !== 0) {
        failed = true;
        const files = extractFilePaths(`${result.stdout}\n${result.stderr}`);
        const safeFiles = files.filter((file) => {
          try {
            resolveSafePath(root, file);
            return true;
          } catch {
            return false;
          }
        });
        const context = safeFiles.length > 0 ? await readFilesSafe(root, safeFiles) : {};
        const fixerPrompt = await readPrompt("fixer.code.txt");
        const fixRaw = await callCodex(fixerPrompt, {
          task,
          plan,
          diff,
          command,
          output: result.stdout,
          errors: result.stderr,
          context,
        });
        await applyPatch(fixRaw, { root });
        break;
      }
    }
    if (!failed) {
      return;
    }
    const rerunSucceeded = await runAll(commands, root);
    if (rerunSucceeded) {
      return;
    }
  }
  throw new Error("Verification failed after three attempts.");
}

async function runAll(commands: string[], root: string): Promise<boolean> {
  for (const command of commands) {
    const result = await runCommand(command, root);
    if (result.exitCode !== 0) {
      return false;
    }
  }
  return true;
}

async function refreshSessionSummary(
  session: Awaited<ReturnType<typeof loadSession>>,
  task: string,
  taskType: string,
  plan: ReturnType<typeof validatePlan>,
  output: string,
) {
  const prompt = await readPrompt("summarise.txt");
  const summaryRaw = await callCodex(prompt, {
    previousSummary: session.summary,
    task,
    taskType,
    plan,
    output,
  });
  session.summary = summaryRaw.trim();
}

function createLogger(options: RunOptions) {
  const verbose = options.verbose ?? false;
  return {
    stage(message: string) {
      process.stderr.write(`[codex-roles] ${message}\n`);
    },
    detail(label: string, value: unknown) {
      if (!verbose) {
        return;
      }
      const body = JSON.stringify(value, null, 2);
      process.stderr.write(`[codex-roles] ${label}:\n${body}\n`);
    },
  };
}
