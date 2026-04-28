# OAC — opencode plugin

OpenAgents Control packaged for the [opencode](https://opencode.ai) CLI.
Mirrors the Claude Code plugin (`plugins/claude-code/`) using opencode's
primitive layout.

## Layout

```
plugins/opencode/
  opencode.json        # config stub (declares user plugins via "plugin": [...])
  AGENTS.md            # project rules — opencode reads this like CLAUDE.md
  skills/              → symlink to plugins/claude-code/skills/
  agents/              → symlink to plugins/claude-code/agents/
  commands/            → symlink to plugins/claude-code/commands/
  plugin/
    oac-hooks.ts       # opencode plugin script — session/tool hooks
```

All three primitive directories are symlinks into `plugins/claude-code/`.
The Claude Code plugin is the single source of truth — opencode-specific
shims live in `opencode.json`, `AGENTS.md`, and `plugin/oac-hooks.ts`.

## Install

### Project-local (recommended)

Drop the contents into your project's `.opencode/`. Use `cp -RL` to follow
symlinks and copy actual files, or `ln -s` to keep live links to the source.

Copy (symlinks resolved):

```bash
mkdir -p .opencode
cp -RL plugins/opencode/agents    .opencode/
cp -RL plugins/opencode/commands  .opencode/
cp -RL plugins/opencode/skills    .opencode/
cp -R  plugins/opencode/plugin    .opencode/
cp     plugins/opencode/AGENTS.md ./AGENTS.md
```

Or symlink each subdirectory if you want live edits:

```bash
ln -s "$PWD/plugins/opencode/agents"   .opencode/agents
ln -s "$PWD/plugins/opencode/commands" .opencode/commands
ln -s "$PWD/plugins/opencode/skills"   .opencode/skills
ln -s "$PWD/plugins/opencode/plugin"   .opencode/plugin
```

### Global (`~/.config/opencode/`)

Same as above but into `~/.config/opencode/` instead of `.opencode/`.

### npm distribution (future)

opencode supports npm-published plugins declared in `opencode.json`:

```json
{ "plugin": ["@momepp/oac-opencode"] }
```

Not published yet. Use the local copy/symlink path above for now.

## Verify

After install, restart opencode and check:

```
opencode  # then in REPL
> /agents       # should list code-reviewer, coder-agent, etc.
> /commands     # should list /brainstorm, /debug, /oac-status, etc.
```

## Conversion notes

See `AGENTS.md` for known frontmatter / env-variable gaps when porting
Claude Code primitives to opencode.
