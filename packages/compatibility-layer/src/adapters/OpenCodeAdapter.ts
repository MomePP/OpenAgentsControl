import { BaseAdapter } from "./BaseAdapter.js";
import type {
  OpenAgent,
  ConversionResult,
  ToolCapabilities,
  ToolConfig,
  AgentFrontmatter,
  SkillReference,
  HookEvent,
  GranularPermission,
} from "../types.js";

/**
 * opencode adapter — converts between OpenAgents Control and opencode formats.
 *
 * opencode primitives live under `.opencode/` (project) or
 * `~/.config/opencode/` (global):
 * - `agents/<name>.md`        — subagents (YAML frontmatter + markdown)
 * - `commands/<name>.md`      — slash commands
 * - `skills/<name>/SKILL.md`  — skills (same spec as Claude Code)
 * - `plugin/<name>.ts`        — JS/TS plugin scripts (event hooks, custom tools)
 * - `opencode.json`           — config (declares npm-published plugins, defaults)
 *
 * Reference: https://opencode.ai/docs (plugins, agents, commands, skills sections)
 */
export class OpenCodeAdapter extends BaseAdapter {
  readonly name = "opencode";
  readonly displayName = "opencode";

  constructor() {
    super();
  }

  // ============================================================================
  // CONVERSION METHODS
  // ============================================================================

  toOAC(source: string): Promise<OpenAgent> {
    const trimmed = source.trim();

    if (trimmed.startsWith("{")) {
      return Promise.resolve(this.parseOpenCodeConfig(source));
    }

    return Promise.resolve(this.parseOpenCodeAgent(source));
  }

  fromOAC(agent: OpenAgent): Promise<ConversionResult> {
    const warnings: string[] = [];
    const configs: ToolConfig[] = [];

    warnings.push(...this.validateConversion(agent));

    const isSubagent = agent.frontmatter.mode === "subagent";

    if (isSubagent) {
      const agentMd = this.generateOpenCodeAgentMarkdown(agent);
      configs.push({
        fileName: `.opencode/agents/${agent.frontmatter.name}.md`,
        content: agentMd,
        encoding: "utf-8",
      });
    } else {
      const opencodeJson = this.generateOpenCodeConfig(agent);
      configs.push({
        fileName: ".opencode/opencode.json",
        content: JSON.stringify(opencodeJson, null, 2),
        encoding: "utf-8",
      });
      configs.push({
        fileName: `.opencode/agents/${agent.frontmatter.name}.md`,
        content: this.generateOpenCodeAgentMarkdown({
          ...agent,
          frontmatter: { ...agent.frontmatter, mode: "primary" },
        }),
        encoding: "utf-8",
      });
    }

    if (agent.contexts && agent.contexts.length > 0) {
      configs.push(...this.generateSkillsFromContexts(agent.contexts));
    }

    if (agent.frontmatter.hooks && agent.frontmatter.hooks.length > 0) {
      configs.push(this.generatePluginScript(agent));
    }

    return Promise.resolve(this.createSuccessResult(configs, warnings));
  }

  getConfigPath(): string {
    return ".opencode/";
  }

  getCapabilities(): ToolCapabilities {
    return {
      name: this.name,
      displayName: this.displayName,
      supportsMultipleAgents: true,
      supportsSkills: true,
      supportsHooks: true,
      supportsGranularPermissions: true,
      supportsContexts: true,
      supportsCustomModels: true,
      supportsTemperature: true,
      supportsMaxSteps: false,
      configFormat: "markdown",
      outputStructure: "directory",
      notes: [
        "Skills use the same SKILL.md spec as Claude Code (frontmatter + body).",
        "Hooks are JS/TS plugin scripts in .opencode/plugin/ — not config entries.",
        "Granular permissions: { edit, bash, read, task } → allow|ask|deny.",
        "Commands support $ARGUMENTS, $1, $2 placeholders.",
        "Reads .claude/skills/ and CLAUDE.md/AGENTS.md as fallback content.",
      ],
    };
  }

  validateConversion(agent: OpenAgent): string[] {
    const warnings: string[] = [];

    if (!agent.frontmatter.name) {
      warnings.push("Agent name is required for opencode");
    }
    if (!agent.frontmatter.description) {
      warnings.push("Agent description is required for opencode");
    }

    if (agent.frontmatter.maxSteps !== undefined) {
      warnings.push(this.unsupportedFeatureWarning("maxSteps", agent.frontmatter.maxSteps));
    }

    return warnings;
  }

  // ============================================================================
  // PARSING (toOAC)
  // ============================================================================

  private parseOpenCodeConfig(source: string): OpenAgent {
    const config = this.safeParseJSON(source, "opencode.json");
    if (!config || typeof config !== "object") {
      throw new Error("Invalid opencode.json format");
    }
    const obj = config as Record<string, unknown>;

    const frontmatter: AgentFrontmatter = {
      name: String(obj.name ?? "unnamed"),
      description: String(obj.description ?? ""),
      mode: "primary",
      model: typeof obj.model === "string" ? obj.model : undefined,
    };

    return {
      frontmatter,
      metadata: { name: frontmatter.name, category: "core", type: "agent" },
      systemPrompt: String(obj.prompt ?? obj.systemPrompt ?? ""),
      contexts: [],
    };
  }

  private parseOpenCodeAgent(source: string): OpenAgent {
    const { frontmatter, body } = this.parseFrontmatter(source);

    const agentFrontmatter: AgentFrontmatter = {
      name: String(frontmatter.name ?? "unnamed"),
      description: String(frontmatter.description ?? ""),
      mode:
        frontmatter.mode === "primary"
          ? "primary"
          : frontmatter.mode === "all"
            ? "all"
            : "subagent",
      model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
      temperature:
        typeof frontmatter.temperature === "number" ? frontmatter.temperature : undefined,
      permission: this.parseOpenCodePermission(frontmatter.permission),
      skills: this.parseOpenCodeSkills(frontmatter.skills),
    };

    return {
      frontmatter: agentFrontmatter,
      metadata: {
        name: agentFrontmatter.name,
        category: "specialist",
        type: "subagent",
      },
      systemPrompt: body.trim(),
      contexts: [],
    };
  }

  private parseFrontmatter(content: string): {
    frontmatter: Record<string, unknown>;
    body: string;
  } {
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { frontmatter: {}, body: content };

    const yamlContent = match[1] ?? "";
    const body = match[2] ?? "";

    const frontmatter: Record<string, unknown> = {};
    let currentObject: Record<string, string> | null = null;

    for (const rawLine of yamlContent.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (!line.trim()) continue;

      // Nested object value (indented "  edit: allow")
      if (currentObject && /^\s+/.test(line)) {
        const inner = line.trim();
        const colon = inner.indexOf(":");
        if (colon > -1) {
          currentObject[inner.slice(0, colon).trim()] = inner.slice(colon + 1).trim();
        }
        continue;
      }
      currentObject = null;

      const colon = line.indexOf(":");
      if (colon === -1) continue;
      const key = line.slice(0, colon).trim();
      const rawVal = line.slice(colon + 1).trim();

      if (rawVal === "" || rawVal === "{") {
        const obj: Record<string, string> = {};
        frontmatter[key] = obj;
        currentObject = obj;
        continue;
      }

      if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
        frontmatter[key] = rawVal
          .slice(1, -1)
          .split(",")
          .map((v) => v.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        continue;
      }

      if (/^-?\d+(\.\d+)?$/.test(rawVal)) {
        frontmatter[key] = Number(rawVal);
        continue;
      }
      if (rawVal === "true" || rawVal === "false") {
        frontmatter[key] = rawVal === "true";
        continue;
      }

      frontmatter[key] = rawVal.replace(/^["']|["']$/g, "");
    }

    return { frontmatter, body };
  }

  // ============================================================================
  // GENERATION (fromOAC)
  // ============================================================================

  private generateOpenCodeAgentMarkdown(agent: OpenAgent): string {
    const fm = agent.frontmatter;
    const lines: string[] = [];
    lines.push(`name: ${fm.name}`);
    lines.push(`description: ${this.yamlString(fm.description)}`);
    if (fm.mode) lines.push(`mode: ${fm.mode === "subagent" ? "subagent" : "primary"}`);
    if (fm.model) lines.push(`model: ${fm.model}`);
    if (fm.temperature !== undefined) lines.push(`temperature: ${fm.temperature}`);

    if (fm.permission) {
      lines.push("permission:");
      for (const [op, rule] of Object.entries(fm.permission)) {
        lines.push(`  ${op}: ${this.formatPermissionRule(rule)}`);
      }
    } else if (fm.tools) {
      lines.push("permission:");
      const toolMap: Record<string, string> = {
        read: "read",
        write: "edit",
        edit: "edit",
        bash: "bash",
        task: "task",
      };
      for (const [tool, enabled] of Object.entries(fm.tools)) {
        const op = toolMap[tool];
        if (op) lines.push(`  ${op}: ${enabled ? "allow" : "deny"}`);
      }
    }

    if (fm.skills && fm.skills.length > 0) {
      const names = fm.skills.map((s) => (typeof s === "string" ? s : s.name));
      lines.push(`skills: [${names.map((n) => `"${n}"`).join(", ")}]`);
    }

    return `---\n${lines.join("\n")}\n---\n\n${agent.systemPrompt}`;
  }

  private generateOpenCodeConfig(agent: OpenAgent): Record<string, unknown> {
    const cfg: Record<string, unknown> = {
      $schema: "https://opencode.ai/config.json",
    };
    if (agent.frontmatter.model) cfg.model = agent.frontmatter.model;
    return cfg;
  }

  private generateSkillsFromContexts(
    contexts: Array<{ path: string; priority?: string; description?: string }>
  ): ToolConfig[] {
    return contexts.map((ctx) => {
      const skillName =
        ctx.path.split("/").pop()?.replace(/\.md$/, "").toLowerCase().replace(/\s+/g, "-") ||
        "context-skill";
      const content = `---
name: ${skillName}
description: ${ctx.description ?? `Context from ${ctx.path}`}
---

# ${skillName}

Context source: \`${ctx.path}\`
Priority: ${ctx.priority ?? "medium"}
`;
      return {
        fileName: `.opencode/skills/${skillName}/SKILL.md`,
        content,
        encoding: "utf-8" as const,
      };
    });
  }

  private generatePluginScript(agent: OpenAgent): ToolConfig {
    const hooks = agent.frontmatter.hooks ?? [];
    const handlers: string[] = [];

    for (const hook of hooks) {
      const event = this.mapOACHookEventToOpenCode(hook.event);
      const cmds = hook.commands.map((c) => c.command).filter(Boolean);
      if (cmds.length === 0) continue;
      handlers.push(`    "${event}": async () => {
      const { spawnSync } = await import("node:child_process");
${cmds
  .map(
    (cmd) =>
      `      spawnSync("bash", ["-c", ${JSON.stringify(cmd)}], { stdio: "inherit" });`
  )
  .join("\n")}
    }`);
    }

    const script = `// Generated by OpenCodeAdapter — hooks for agent "${agent.frontmatter.name}".
export const ${this.toIdentifier(agent.frontmatter.name)}Hooks = async () => {
  return {
${handlers.join(",\n")}
  };
};
`;

    return {
      fileName: `.opencode/plugin/${agent.frontmatter.name}-hooks.ts`,
      content: script,
      encoding: "utf-8",
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private parseOpenCodePermission(value: unknown): GranularPermission | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const out: GranularPermission = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === "allow" || v === "deny" || v === "ask") out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }

  private parseOpenCodeSkills(value: unknown): SkillReference[] | undefined {
    if (!value) return undefined;
    if (Array.isArray(value)) return value.map((s) => String(s));
    if (typeof value === "string")
      return value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    return undefined;
  }

  private formatPermissionRule(rule: unknown): string {
    if (rule === true) return "allow";
    if (rule === false) return "deny";
    if (typeof rule === "string") return rule;
    return "ask";
  }

  /**
   * OAC hook events → opencode plugin event names.
   * opencode uses `tool.execute.before`/`tool.execute.after` etc.
   */
  private mapOACHookEventToOpenCode(event: HookEvent): string {
    switch (event) {
      case "PreToolUse":
        return "tool.execute.before";
      case "PostToolUse":
        return "tool.execute.after";
      case "AgentStart":
        return "session.created";
      case "AgentEnd":
        return "session.idle";
      case "PermissionRequest":
        return "tool.execute.before";
      default:
        return "session.updated";
    }
  }

  private toIdentifier(name: string): string {
    const cleaned = name.replace(/[^a-zA-Z0-9]+/g, " ");
    return cleaned
      .split(" ")
      .filter(Boolean)
      .map((p) => p[0]!.toUpperCase() + p.slice(1))
      .join("");
  }

  private yamlString(value: string): string {
    if (/[:#\n]/.test(value)) return JSON.stringify(value);
    return value;
  }
}
