import { describe, it, expect, beforeEach } from "vitest";
import { OpenCodeAdapter } from "../../../src/adapters/OpenCodeAdapter";
import type { OpenAgent, AgentFrontmatter } from "../../../src/types";

/**
 * Tests for OpenCodeAdapter (peer of ClaudeAdapter, CursorAdapter, WindsurfAdapter).
 *
 * Coverage targets:
 * 1. Adapter identity + capabilities
 * 2. fromOAC() — emits .opencode/{agents,opencode.json,skills,plugin}/
 * 3. toOAC() — parses opencode agent.md + opencode.json
 * 4. validateConversion() — surfaces warnings for unsupported fields
 * 5. Permission and hook event mapping
 */

describe("OpenCodeAdapter", () => {
  let adapter: OpenCodeAdapter;

  beforeEach(() => {
    adapter = new OpenCodeAdapter();
  });

  // ============================================================================
  // IDENTITY + CAPABILITIES
  // ============================================================================

  describe("adapter identity", () => {
    it("has correct name", () => {
      expect(adapter.name).toBe("opencode");
    });

    it("has correct displayName", () => {
      expect(adapter.displayName).toBe("opencode");
    });

    it("returns correct config path", () => {
      expect(adapter.getConfigPath()).toBe(".opencode/");
    });
  });

  describe("getCapabilities()", () => {
    it("declares granular permissions support", () => {
      expect(adapter.getCapabilities().supportsGranularPermissions).toBe(true);
    });

    it("declares skills, hooks, contexts, temperature support", () => {
      const caps = adapter.getCapabilities();
      expect(caps.supportsSkills).toBe(true);
      expect(caps.supportsHooks).toBe(true);
      expect(caps.supportsContexts).toBe(true);
      expect(caps.supportsTemperature).toBe(true);
    });

    it("does not claim maxSteps support", () => {
      expect(adapter.getCapabilities().supportsMaxSteps).toBe(false);
    });

    it("uses markdown + directory output structure", () => {
      const caps = adapter.getCapabilities();
      expect(caps.configFormat).toBe("markdown");
      expect(caps.outputStructure).toBe("directory");
    });
  });

  // ============================================================================
  // fromOAC — subagent
  // ============================================================================

  describe("fromOAC() — subagent", () => {
    const subagent: OpenAgent = {
      frontmatter: {
        name: "code-reviewer",
        description: "Reviews code",
        mode: "subagent",
        model: "opus",
        permission: { edit: "deny", bash: "deny" },
      } as AgentFrontmatter,
      metadata: { name: "code-reviewer" },
      systemPrompt: "Review code carefully.",
      contexts: [],
    };

    it("emits .opencode/agents/<name>.md", async () => {
      const result = await adapter.fromOAC(subagent);
      expect(result.success).toBe(true);
      expect(result.configs[0].fileName).toBe(".opencode/agents/code-reviewer.md");
    });

    it("includes name + description + mode in frontmatter", async () => {
      const result = await adapter.fromOAC(subagent);
      const content = result.configs[0].content;
      expect(content).toMatch(/^---\n/);
      expect(content).toContain("name: code-reviewer");
      expect(content).toContain("description: Reviews code");
      expect(content).toContain("mode: subagent");
      expect(content).toContain("model: opus");
    });

    it("renders permission block from granular permissions", async () => {
      const result = await adapter.fromOAC(subagent);
      const content = result.configs[0].content;
      expect(content).toContain("permission:");
      expect(content).toContain("edit: deny");
      expect(content).toContain("bash: deny");
    });

    it("preserves system prompt body", async () => {
      const result = await adapter.fromOAC(subagent);
      expect(result.configs[0].content).toContain("Review code carefully.");
    });
  });

  // ============================================================================
  // fromOAC — primary + tools fallback
  // ============================================================================

  describe("fromOAC() — primary agent without explicit permission", () => {
    const primary: OpenAgent = {
      frontmatter: {
        name: "main",
        description: "Primary agent",
        mode: "primary",
        model: "sonnet",
        tools: { read: true, write: true, bash: false },
      } as AgentFrontmatter,
      metadata: { name: "main" },
      systemPrompt: "Primary loop.",
      contexts: [],
    };

    it("emits both opencode.json and agent markdown", async () => {
      const result = await adapter.fromOAC(primary);
      const fileNames = result.configs.map((c) => c.fileName);
      expect(fileNames).toContain(".opencode/opencode.json");
      expect(fileNames).toContain(".opencode/agents/main.md");
    });

    it("falls back to tools->permission mapping when permission absent", async () => {
      const result = await adapter.fromOAC(primary);
      const md = result.configs.find((c) => c.fileName.endsWith(".md"))!.content;
      expect(md).toContain("permission:");
      expect(md).toContain("edit: allow");
      expect(md).toContain("bash: deny");
    });

    it("opencode.json includes $schema and model", async () => {
      const result = await adapter.fromOAC(primary);
      const json = JSON.parse(
        result.configs.find((c) => c.fileName.endsWith(".json"))!.content
      );
      expect(json.$schema).toBe("https://opencode.ai/config.json");
      expect(json.model).toBe("sonnet");
    });
  });

  // ============================================================================
  // fromOAC — contexts + hooks
  // ============================================================================

  describe("fromOAC() — contexts emit skills", () => {
    it("creates a SKILL.md per context", async () => {
      const agent: OpenAgent = {
        frontmatter: {
          name: "ctx-bearer",
          description: "Carries contexts",
          mode: "subagent",
        } as AgentFrontmatter,
        metadata: { name: "ctx-bearer" },
        systemPrompt: "",
        contexts: [
          { path: "context/standards/code-quality.md", priority: "high", description: "Quality" },
          { path: "context/security.md" },
        ],
      };
      const result = await adapter.fromOAC(agent);
      const skillFiles = result.configs.filter((c) =>
        c.fileName.startsWith(".opencode/skills/")
      );
      expect(skillFiles.length).toBe(2);
      expect(skillFiles[0].fileName).toMatch(/SKILL\.md$/);
    });
  });

  describe("fromOAC() — hooks emit plugin script", () => {
    it("emits a plugin/<name>-hooks.ts when hooks are present", async () => {
      const agent: OpenAgent = {
        frontmatter: {
          name: "hooked",
          description: "With hooks",
          mode: "subagent",
          hooks: [
            {
              event: "PreToolUse",
              commands: [{ type: "command", command: "echo hi" }],
            },
          ],
        } as AgentFrontmatter,
        metadata: { name: "hooked" },
        systemPrompt: "",
        contexts: [],
      };
      const result = await adapter.fromOAC(agent);
      const plugin = result.configs.find((c) =>
        c.fileName.startsWith(".opencode/plugin/")
      );
      expect(plugin).toBeDefined();
      expect(plugin!.fileName).toBe(".opencode/plugin/hooked-hooks.ts");
      // PreToolUse maps to opencode's tool.execute.before event.
      expect(plugin!.content).toContain('"tool.execute.before"');
    });
  });

  // ============================================================================
  // toOAC
  // ============================================================================

  describe("toOAC() — parse opencode.json", () => {
    it("parses minimal opencode.json into a primary OpenAgent", async () => {
      const src = JSON.stringify({
        name: "primary",
        description: "primary agent",
        model: "sonnet",
        prompt: "do work",
      });
      const agent = await adapter.toOAC(src);
      expect(agent.frontmatter.mode).toBe("primary");
      expect(agent.frontmatter.name).toBe("primary");
      expect(agent.frontmatter.model).toBe("sonnet");
      expect(agent.systemPrompt).toBe("do work");
    });
  });

  describe("toOAC() — parse opencode agent.md", () => {
    it("parses subagent frontmatter and body", async () => {
      const src = `---
name: my-agent
description: example
mode: subagent
model: haiku
temperature: 0.4
permission:
  edit: deny
  bash: ask
skills: ["code-review", "context-discovery"]
---

System prompt body.`;
      const agent = await adapter.toOAC(src);
      expect(agent.frontmatter.mode).toBe("subagent");
      expect(agent.frontmatter.model).toBe("haiku");
      expect(agent.frontmatter.temperature).toBe(0.4);
      expect(agent.frontmatter.permission).toEqual({ edit: "deny", bash: "ask" });
      expect(agent.frontmatter.skills).toEqual(["code-review", "context-discovery"]);
      expect(agent.systemPrompt).toBe("System prompt body.");
    });
  });

  // ============================================================================
  // validateConversion
  // ============================================================================

  describe("validateConversion()", () => {
    it("warns on missing name", () => {
      const agent: OpenAgent = {
        frontmatter: { name: "", description: "x", mode: "subagent" } as AgentFrontmatter,
        metadata: {},
        systemPrompt: "",
        contexts: [],
      };
      expect(adapter.validateConversion(agent).join(" ")).toMatch(/name/i);
    });

    it("warns on maxSteps (unsupported)", () => {
      const agent: OpenAgent = {
        frontmatter: {
          name: "x",
          description: "x",
          mode: "subagent",
          maxSteps: 5,
        } as AgentFrontmatter,
        metadata: {},
        systemPrompt: "",
        contexts: [],
      };
      expect(adapter.validateConversion(agent).join(" ")).toMatch(/maxSteps/);
    });
  });
});
