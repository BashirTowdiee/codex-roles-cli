export const TASK_TYPES = [
  "code.change",
  "code.analysis",
  "docs.write",
  "docs.analysis",
  "research",
  "misc.text",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export type Classification = {
  taskType: TaskType;
  confidence: number;
  notes: string;
};

export type Plan = {
  goal: string;
  steps: string[];
  read?: string[];
  search?: string[];
  edit?: string[];
  commands?: string[];
  acceptance: string[];
};

export type CodeReview = {
  blocking: string[];
  nonBlocking: string[];
  notes?: string;
};

export type TextReview = {
  issues: string[];
  improvements?: string[];
  notes?: string;
};

export function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} must be valid JSON. ${message}`);
  }
}

export function isTaskType(value: unknown): value is TaskType {
  return typeof value === "string" && TASK_TYPES.includes(value as TaskType);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function validateClassification(value: unknown): Classification {
  if (typeof value !== "object" || value === null) {
    throw new Error("Classification must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (!isTaskType(record.taskType)) {
    throw new Error("Classification.taskType is invalid.");
  }
  if (typeof record.confidence !== "number") {
    throw new Error("Classification.confidence must be a number.");
  }
  if (typeof record.notes !== "string") {
    throw new Error("Classification.notes must be a string.");
  }
  return {
    taskType: record.taskType,
    confidence: record.confidence,
    notes: record.notes,
  };
}

export function validatePlan(value: unknown): Plan {
  if (typeof value !== "object" || value === null) {
    throw new Error("Plan must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.goal !== "string") {
    throw new Error("Plan.goal must be a string.");
  }
  if (!isStringArray(record.steps)) {
    throw new Error("Plan.steps must be a string array.");
  }
  if (!isStringArray(record.acceptance)) {
    throw new Error("Plan.acceptance must be a string array.");
  }
  if (record.read !== undefined && !isStringArray(record.read)) {
    throw new Error("Plan.read must be a string array when provided.");
  }
  if (record.search !== undefined && !isStringArray(record.search)) {
    throw new Error("Plan.search must be a string array when provided.");
  }
  if (record.edit !== undefined && !isStringArray(record.edit)) {
    throw new Error("Plan.edit must be a string array when provided.");
  }
  if (record.commands !== undefined && !isStringArray(record.commands)) {
    throw new Error("Plan.commands must be a string array when provided.");
  }
  return {
    goal: record.goal,
    steps: record.steps,
    read: record.read as string[] | undefined,
    search: record.search as string[] | undefined,
    edit: record.edit as string[] | undefined,
    commands: record.commands as string[] | undefined,
    acceptance: record.acceptance,
  };
}

export function validateCodeReview(value: unknown): CodeReview {
  if (typeof value !== "object" || value === null) {
    throw new Error("Review must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (!isStringArray(record.blocking)) {
    throw new Error("Review.blocking must be a string array.");
  }
  if (!isStringArray(record.nonBlocking)) {
    throw new Error("Review.nonBlocking must be a string array.");
  }
  if (record.notes !== undefined && typeof record.notes !== "string") {
    throw new Error("Review.notes must be a string when provided.");
  }
  return {
    blocking: record.blocking,
    nonBlocking: record.nonBlocking,
    notes: record.notes as string | undefined,
  };
}

export function validateTextReview(value: unknown): TextReview {
  if (typeof value !== "object" || value === null) {
    throw new Error("Review must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (!isStringArray(record.issues)) {
    throw new Error("Review.issues must be a string array.");
  }
  if (record.improvements !== undefined && !isStringArray(record.improvements)) {
    throw new Error("Review.improvements must be a string array when provided.");
  }
  if (record.notes !== undefined && typeof record.notes !== "string") {
    throw new Error("Review.notes must be a string when provided.");
  }
  return {
    issues: record.issues,
    improvements: record.improvements as string[] | undefined,
    notes: record.notes as string | undefined,
  };
}
