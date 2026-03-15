export interface SkillReference {
  token: string;
  name: string;
  start: number;
  end: number;
}

export interface DiscoveredSkill {
  name: string;
  path: string;
  source: "global" | "project" | "user-agents" | "project-agents" | "unknown";
  description?: string;
  content: string;
}
