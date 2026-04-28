/**
 * OAC opencode plugin — session/tool hooks.
 *
 * Mirrors plugins/claude-code/hooks/hooks.json. The Claude Code plugin runs
 * a SessionStart shell hook (hooks/session-start.sh) that prints OAC banner
 * + skill discovery prompts. We replicate that here using opencode's plugin
 * event API.
 *
 * Event reference: https://opencode.ai/docs/plugins (see "Hooks" section).
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const SESSION_SCRIPT = join(
  PLUGIN_DIR,
  "..",
  "..",
  "claude-code",
  "hooks",
  "session-start.sh"
);

export const OacHooks = async () => {
  return {
    "session.created": async () => {
      try {
        spawnSync("bash", [SESSION_SCRIPT], {
          stdio: "inherit",
          env: {
            ...process.env,
            CLAUDE_PLUGIN_ROOT: join(PLUGIN_DIR, ".."),
          },
        });
      } catch {
        // Non-fatal: missing bash or script just means no banner.
      }
    },
  };
};
