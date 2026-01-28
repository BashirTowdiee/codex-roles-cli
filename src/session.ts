import { promises as fs } from "node:fs";
import path from "node:path";

export type SessionRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
  history: SessionEntry[];
};

export type SessionEntry = {
  at: string;
  type: "task" | "classification" | "plan" | "retrieval" | "output" | "review" | "error";
  content: unknown;
};

export function getSessionPath(root: string, sessionId: string): string {
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(root, ".codex-roles", `${safeId}.json`);
}

export async function loadSession(root: string, sessionId: string): Promise<SessionRecord> {
  const sessionPath = getSessionPath(root, sessionId);
  try {
    const raw = await fs.readFile(sessionPath, "utf8");
    return JSON.parse(raw) as SessionRecord;
  } catch {
    const now = new Date().toISOString();
    return {
      id: sessionId,
      createdAt: now,
      updatedAt: now,
      summary: "",
      history: [],
    };
  }
}

export async function saveSession(root: string, session: SessionRecord): Promise<void> {
  const sessionPath = getSessionPath(root, session.id);
  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  session.updatedAt = new Date().toISOString();
  await fs.writeFile(sessionPath, JSON.stringify(session, null, 2), "utf8");
}

export function addEntry(session: SessionRecord, entry: SessionEntry): void {
  session.history.push(entry);
}
