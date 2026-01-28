import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { containsIgnoredSegment, isSensitivePath } from "./retrieve.js";

const execFileAsync = promisify(execFile);

export type PatchOptions = {
  root: string;
  allowDelete?: boolean;
  allowedExtensions?: string[];
};

export async function applyPatch(diff: string, options: PatchOptions): Promise<void> {
  const { root, allowDelete = false, allowedExtensions } = options;
  const files = extractFilesFromDiff(diff);
  if (files.length === 0) {
    throw new Error("No files found in diff output.");
  }
  for (const file of files) {
    if (isSensitivePath(file)) {
      throw new Error(`Refusing to patch sensitive path: ${file}`);
    }
    if (containsIgnoredSegment(file)) {
      throw new Error(`Refusing to patch ignored path: ${file}`);
    }
    if (allowedExtensions && !allowedExtensions.some((ext) => file.endsWith(ext))) {
      throw new Error(`Refusing to patch non-allowed file: ${file}`);
    }
  }
  if (!allowDelete && diff.includes("deleted file mode")) {
    throw new Error("Refusing to delete files without an explicit request.");
  }
  await applyViaStdin(diff, root);
}

function extractFilesFromDiff(diff: string): string[] {
  const matches = diff.match(/^diff --git a\/(.+?) b\/(.+)$/gm) ?? [];
  const files = matches.map((line) => {
    const parts = line.split(" ");
    return parts[2]?.replace("b/", "") ?? "";
  });
  return files.filter(Boolean);
}

function applyViaStdin(diff: string, root: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["apply", "--whitespace=nowarn", "-"], {
      cwd: root,
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 10000) {
        stderr = stderr.slice(0, 10000);
      }
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const message = stderr.trim() || `git apply exited with code ${code ?? "unknown"}.`;
      reject(new Error(`Failed to apply patch. ${message}`));
    });
    child.stdin.end(diff);
  });
}
