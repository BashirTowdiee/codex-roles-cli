import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const DEFAULT_IGNORES = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "DerivedData",
  "derived data",
  "vendor",
];

const SENSITIVE_EXTENSIONS = new Set([".env", ".key", ".pem", ".crt", ".p12", ".pfx", ".cer"]);
const SENSITIVE_FILENAMES = new Set([".env", ".env.local", ".env.production", ".env.development"]);

export async function readPrompt(name: string): Promise<string> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidatePaths = [
    path.resolve(moduleDir, "prompts", name),
    path.resolve(process.cwd(), "src", "prompts", name),
    path.resolve(process.cwd(), "dist", "prompts", name),
    path.resolve(process.cwd(), "tools", "codex-roles-cli", "src", "prompts", name),
  ];
  for (const promptPath of candidatePaths) {
    try {
      return await fs.readFile(promptPath, "utf8");
    } catch {
      continue;
    }
  }
  throw new Error(`Prompt not found: ${name}`);
}

export async function buildRepoMap(root: string, depth = 3): Promise<string> {
  const lines: string[] = [];
  async function walk(current: string, currentDepth: number): Promise<void> {
    if (currentDepth > depth) {
      return;
    }
    const entries = await fs.readdir(current, { withFileTypes: true });
    const rel = path.relative(root, current) || ".";
    lines.push(`${"  ".repeat(currentDepth)}${rel}/`);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (shouldIgnore(entry.name)) {
          continue;
        }
        await walk(path.join(current, entry.name), currentDepth + 1);
      } else if (entry.isFile()) {
        lines.push(`${"  ".repeat(currentDepth + 1)}${entry.name}`);
      }
    }
  }
  await walk(root, 0);
  return lines.join("\n");
}

export async function searchRepo(root: string, token: string): Promise<string> {
  const args = [
    "-n",
    "--no-heading",
    "--color",
    "never",
    "--glob",
    "!**/.env*",
    "--glob",
    "!**/*.key",
    "--glob",
    "!**/*.pem",
    "--glob",
    "!**/*.crt",
    "--glob",
    "!**/*.p12",
    "--glob",
    "!**/*.pfx",
    "--glob",
    "!**/*.cer",
  ];
  for (const ignore of DEFAULT_IGNORES) {
    args.push("--glob", `!**/${ignore}/**`);
  }
  args.push(token, ".");
  const { stdout } = await execFileAsync("rg", args, { cwd: root, maxBuffer: 5 * 1024 * 1024 });
  return stdout.slice(0, 20000);
}

export async function readFilesSafe(root: string, files: string[]): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  for (const file of files) {
    const resolved = resolveSafePath(root, file);
    results[file] = await readFileCapped(resolved, 60000);
  }
  return results;
}

export async function readFileCapped(filePath: string, limit: number): Promise<string> {
  const data = await fs.readFile(filePath, "utf8");
  if (data.length <= limit) {
    return data;
  }
  return data.slice(0, limit);
}

export function resolveSafePath(root: string, inputPath: string): string {
  const resolved = path.resolve(root, inputPath);
  if (!resolved.startsWith(root)) {
    throw new Error(`Refusing to access path outside repo: ${inputPath}`);
  }
  if (isSensitivePath(resolved)) {
    throw new Error(`Refusing to access sensitive path: ${inputPath}`);
  }
  if (containsIgnoredSegment(resolved)) {
    throw new Error(`Refusing to access ignored path: ${inputPath}`);
  }
  return resolved;
}

export function isSensitivePath(resolvedPath: string): boolean {
  const base = path.basename(resolvedPath).toLowerCase();
  if (SENSITIVE_FILENAMES.has(base)) {
    return true;
  }
  const ext = path.extname(base);
  if (SENSITIVE_EXTENSIONS.has(ext)) {
    return true;
  }
  return base.includes("secret") || base.includes("certificate") || base.includes("private");
}

export function containsIgnoredSegment(resolvedPath: string): boolean {
  const segments = resolvedPath.split(path.sep).map((segment) => segment.toLowerCase());
  return DEFAULT_IGNORES.some((ignore) => segments.includes(ignore.toLowerCase()));
}

export async function runCommand(command: string, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }>
{
  try {
    const { stdout, stderr } = await execFileAsync(command, { cwd, shell: true, maxBuffer: 10 * 1024 * 1024 });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    if (error && typeof error === "object" && "stdout" in error && "stderr" in error) {
      const err = error as { stdout: string; stderr: string; code?: number };
      return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", exitCode: err.code ?? 1 };
    }
    throw error;
  }
}

export function extractFilePaths(output: string): string[] {
  const matches = output.match(/(?:^|\s)([\w./-]+\.[\w]+)(?::\d+)?/gm) ?? [];
  const cleaned = matches.map((match) => match.trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}

function shouldIgnore(name: string): boolean {
  return DEFAULT_IGNORES.some((ignore) => ignore.toLowerCase() === name.toLowerCase());
}
