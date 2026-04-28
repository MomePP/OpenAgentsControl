# OpenAgents Control — Fork Roadmap

> **Scope:** This roadmap tracks work specific to the
> [`MomePP/OpenAgentsControl`](https://github.com/MomePP/OpenAgentsControl)
> fork — primarily the Claude Code plugin, the opencode plugin, and the
> shared compatibility layer. Upstream items live in
> [`darrenhinde/OpenAgentsControl`](https://github.com/darrenhinde/OpenAgentsControl).

---

## ✅ Recently Shipped

- Fork repoint: runtime URLs, registry, plugin manifest, install scripts
  all point at `MomePP/OpenAgentsControl`.
- Claude Code plugin manifest schema fix (`plugin.json` skills + commands
  registration) — published as `1.0.3`.
- opencode plugin scaffold under `plugins/opencode/` with `agents`,
  `commands`, and `skills` symlinked to `plugins/claude-code/` (single
  source of truth) plus `plugin/oac-hooks.ts` for session hooks.
- `OpenCodeAdapter` added to `packages/compatibility-layer/` — peer of
  `ClaudeAdapter`, `CursorAdapter`, `WindsurfAdapter`.
- `.github/workflows/plugin-manifest.yml` — CI smoke for both plugins.

## 🎯 Now (Current Focus)

- [ ] Tighten `plugins/claude-code/agents/*.md` frontmatter so opencode
      consumes `permission: { ... }` instead of Claude Code's `tools:`
      string. Both hosts must keep working.
- [ ] End-to-end marketplace verification: fresh Claude Code session →
      `/plugin marketplace add MomePP/OpenAgentsControl` → `/install-context`
      → confirm context lands and skills/commands resolve.
- [ ] npm-publish the opencode plugin as `@momepp/oac-opencode` so
      opencode users can install via `opencode.json`'s `plugin: [...]`.

## 🔜 Next (Coming Soon)

- [ ] Resolve pre-existing TypeScript errors in `packages/compatibility-layer/{cli,core,mappers}/`
      (pre-fork bugs around zod imports and implicit any).
- [ ] Add CI job that performs an actual `/plugin install oac` smoke
      against a checked-out workspace, beyond the manifest validator.
- [ ] Audit `installer-checks.yml` against the new `--host` gate in
      `install.sh` to ensure shellcheck still passes.
- [ ] Document the `OpenCodeAdapter` capabilities matrix and add round-trip
      tests against representative `plugins/claude-code/agents/*.md`.

## 🔭 Later (Exploration)

- [ ] Auto-sync upstream PR refs in the README's fork notice (e.g. flip
      ✅/❌ when upstream merges PR #296).
- [ ] Generate a CHANGELOG from conventional commits as part of the
      version-bump workflow.
- [ ] Consider an opencode marketplace registration once opencode adopts
      one.

---

## How to contribute

- Fork-specific issues / requests: open in
  [`MomePP/OpenAgentsControl`](https://github.com/MomePP/OpenAgentsControl/issues).
- Issues that affect upstream behaviour: open in
  [`darrenhinde/OpenAgentsControl`](https://github.com/darrenhinde/OpenAgentsControl/issues)
  and link the fork issue if a downstream fix is needed.

---

**Last updated:** 2026-04-28
