# OAC for opencode — agent rules

This is the opencode-flavored install of OpenAgents Control. Same skills,
agents, and commands as the Claude Code plugin (`plugins/claude-code/`),
exposed through opencode's primitive layout (`agents/`, `commands/`,
`skills/`, `plugin/`).

## How OAC works here

- **Skills** (`skills/<name>/SKILL.md`) — invokable contracts. Same SKILL.md
  spec as Claude Code; symlinked from the Claude Code plugin so they stay in
  sync.
- **Agents** (`agents/<name>.md`) — subagents the model can dispatch.
- **Commands** (`commands/<name>.md`) — slash commands.
- **Plugin** (`plugin/oac-hooks.ts`) — JS hook script. Runs the OAC
  session-start shell hook on `session.created`.

## Known conversion gaps from Claude Code → opencode

- Agent frontmatter still uses Claude Code's `tools:` field. opencode prefers
  a `permission:` object (`edit`, `bash`, `read`, `task` → `allow|ask|deny`).
  Unknown fields are ignored, so this is non-fatal — but tighten permissions
  manually if you care.
- Commands embed `${CLAUDE_PLUGIN_ROOT}` paths. opencode does not export that
  variable; the `oac-hooks.ts` plugin sets it for child processes when it
  spawns the session-start script, but inline command bodies that read the
  variable directly won't resolve. Rewrite affected commands or run them via
  `bash -c` inside `oac-hooks.ts`.
- `oac-status` and `install-context` slash commands depend on the Claude
  Code plugin's `scripts/` directory. They work when this plugin is
  installed *alongside* `plugins/claude-code/` (e.g. both copied into your
  project). Standalone opencode users need the script tree wired in.
