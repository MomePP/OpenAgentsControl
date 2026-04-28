# OAC — opencode plugin

OpenAgents Control packaged for the [opencode](https://opencode.ai) CLI.
Mirrors the Claude Code plugin (`plugins/claude-code/`) using opencode's
primitive layout.

## Layout

```
plugins/opencode/
  opencode.json        # config stub (declares user plugins via "plugin": [...])
  AGENTS.md            # project rules — opencode reads this like CLAUDE.md
  skills/              # → symlink to plugins/claude-code/skills/ (verbatim)
  agents/              # subagents (frontmatter copied from claude-code)
  commands/            # slash commands (frontmatter copied from claude-code)
  plugin/
    oac-hooks.ts       # opencode plugin script — session/tool hooks
```

`skills/` is a symlink so SKILL.md content stays in lockstep with the Claude
Code plugin. `agents/` and `commands/` are copies because some frontmatter
fields differ between hosts (see `AGENTS.md` for known gaps).

## Install

### Project-local (recommended)

Drop the contents into your project's `.opencode/`:

```bash
mkdir -p .opencode
cp -R plugins/opencode/agents     .opencode/
cp -R plugins/opencode/commands   .opencode/
cp -R plugins/opencode/skills/    .opencode/skills/   # follow symlink
cp -R plugins/opencode/plugin     .opencode/
cp    plugins/opencode/AGENTS.md  ./AGENTS.md
```

Or symlink each subdirectory if you want live edits:

```bash
ln -s "$PWD/plugins/opencode/agents"    .opencode/agents
ln -s "$PWD/plugins/opencode/commands"  .opencode/commands
ln -s "$PWD/plugins/opencode/skills"    .opencode/skills
ln -s "$PWD/plugins/opencode/plugin"    .opencode/plugin
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
