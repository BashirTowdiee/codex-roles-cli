# Codex Roles CLI

A minimal, provider-agnostic CLI that classifies a task, plans it, retrieves context, and routes the workflow based on task type.

## Usage

From `tools/codex-roles-cli`:

- Build: `pnpm build`
- Dev: `pnpm dev -- "<task>"`
- Run: `pnpm codex-roles "<task>"`
- Run against another repo: `pnpm codex-roles "<task>" --cwd <path>`
- Allow non Git directories: `pnpm codex-roles "<task>" --cwd <path> --skip-git-repo-check`
- Show stages and intermediate JSON: `pnpm codex-roles "<task>" --verbose`
- Use a rolling session: `pnpm codex-roles "<task>" --session <id>`

## Supported task types

- `code.change`
- `code.analysis`
- `docs.write`
- `docs.analysis`
- `research`
- `misc.text`

## Extension points

- `src/codex.ts` is the only provider adapter. It uses the Codex SDK and relies on the same sign-in as the Codex CLI and VS Code extension. Run `codex login` first.
- Prompts live in `src/prompts` and control the JSON and diff output discipline.
- Safety rules are enforced in `src/retrieve.ts` and `src/patch.ts`.
- Session state is stored in `.codex-roles/<session>.json` inside the target repo, with a rolling summary produced by `summarise.txt`.

## Workflow summary

1) Classify the task using `classify.txt`.
2) Build a shallow repo map and plan with the selected planner prompt.
3) Retrieve files and search results if requested by the plan.
4) Implement changes or produce structured text output.
5) Review and fix if needed, then verify commands for `code.change` tasks.
