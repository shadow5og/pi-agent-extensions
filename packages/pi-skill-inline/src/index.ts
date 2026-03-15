import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { AutocompleteItem } from "@mariozechner/pi-tui";

import { expandInlineSkills } from "./expand";
import { discoverSkills, discoverSkillMap } from "./skills";
import type { DiscoveredSkill } from "./types";

export default function (pi: ExtensionAPI) {
  let cachedSkills: DiscoveredSkill[] = [];
  let cachedSkillMap = new Map<string, DiscoveredSkill>();
  let cachedCwd = process.cwd();

  const refreshSkills = async (cwd: string) => {
    cachedCwd = cwd;
    cachedSkills = await discoverSkills(cwd);
    cachedSkillMap = new Map(cachedSkills.map((skill) => [skill.name, skill]));
    return cachedSkills;
  };

  pi.on("session_start", async (_event, ctx) => {
    await refreshSkills(ctx.cwd);
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") {
      return { action: "continue" as const };
    }

    if (!event.text.includes("$")) {
      return { action: "continue" as const };
    }

    if (ctx.cwd !== cachedCwd || cachedSkills.length === 0) {
      await refreshSkills(ctx.cwd);
    }

    const expanded = expandInlineSkills(event.text, cachedSkillMap);

    if (expanded.used.length === 0) {
      if (expanded.missing.length > 0 && ctx.hasUI) {
        ctx.ui.notify(`Unknown inline skill(s): ${expanded.missing.join(", ")}`, "warning");
      }
      return { action: "continue" as const };
    }

    if (expanded.missing.length > 0 && ctx.hasUI) {
      ctx.ui.notify(`Some inline skills were not found: ${expanded.missing.join(", ")}`, "warning");
    }

    return {
      action: "transform" as const,
      text: expanded.text,
      images: event.images,
    };
  });

  pi.registerCommand("skills-inline", {
    description: "List discovered inline-usable skills",
    handler: async (_args, ctx) => {
      const skills = await refreshSkills(ctx.cwd);
      if (skills.length === 0) {
        ctx.ui.notify("No skills discovered.", "warning");
        return;
      }
      ctx.ui.notify(
        skills.map((skill) => `${skill.name}${skill.description ? ` — ${skill.description}` : ""}`).join("\n"),
        "info",
      );
    },
  });

  pi.registerCommand("insert-skill", {
    description: "Prefill the editor with an inline skill token: /insert-skill <name>",
    getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
      const items = cachedSkills
        .filter((skill) => skill.name.startsWith(prefix))
        .map((skill) => ({ value: skill.name, label: `${skill.name}${skill.description ? ` — ${skill.description}` : ""}` }));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const skills = await refreshSkills(ctx.cwd);
      const name = (args || "").trim();
      if (!name) {
        ctx.ui.notify("Usage: /insert-skill <name>", "warning");
        return;
      }
      const found = skills.find((skill) => skill.name === name);
      if (!found) {
        ctx.ui.notify(`Unknown skill: ${name}`, "error");
        return;
      }
      ctx.ui.setEditorText(`$${found.name} `);
      ctx.ui.notify(`Inserted $${found.name} into the editor.`, "success");
    },
  });

  pi.registerCommand("pick-skill", {
    description: "Pick a skill from a list and insert it as $skill-name into the editor",
    handler: async (_args, ctx) => {
      const skills = await refreshSkills(ctx.cwd);
      if (skills.length === 0) {
        ctx.ui.notify("No skills discovered.", "warning");
        return;
      }

      const options = skills.map((skill) => ({
        label: `${skill.name}${skill.description ? ` — ${skill.description}` : ""}`,
        value: skill.name,
      }));
      const choice = await ctx.ui.select("Pick a skill to insert", options.map((option) => option.label));
      if (!choice) return;

      const selected = options.find((option) => option.label === choice);
      if (!selected) {
        ctx.ui.notify("Selected skill could not be resolved.", "error");
        return;
      }

      ctx.ui.setEditorText(`$${selected.value} `);
      ctx.ui.notify(`Inserted $${selected.value} into the editor.`, "success");
    },
  });
}
