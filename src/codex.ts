import { Codex } from "@openai/codex-sdk";

type CodexThreadOptions = {
  workingDirectory?: string;
  skipGitRepoCheck?: boolean;
};

export async function callCodex(prompt: string, input: unknown): Promise<string> {
  const client = new Codex();
  const threadOptions = getThreadOptions();
  const thread = threadOptions ? client.startThread(threadOptions) : client.startThread();
  const payload = `${prompt}\n\nInput JSON:\n${JSON.stringify(input, null, 2)}`;
  const result = await thread.run(payload);
  if (typeof result === "string") {
    return result;
  }
  if (result?.finalResponse) {
    return result.finalResponse;
  }
  throw new Error("Codex returned no final response.");
}

export function configureCodex(options: CodexThreadOptions): void {
  configuredThreadOptions = { ...configuredThreadOptions, ...options };
}

let configuredThreadOptions: CodexThreadOptions = {};

function getThreadOptions(): CodexThreadOptions | undefined {
  if (!configuredThreadOptions.workingDirectory && !configuredThreadOptions.skipGitRepoCheck) {
    return undefined;
  }
  return configuredThreadOptions;
}
