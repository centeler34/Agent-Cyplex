/**
 * In-memory registry of loaded skills per agent.
 */

import type { SkillDefinition } from '../types/skill_schema.js';

export class SkillRegistry {
  private skills: Map<string, SkillDefinition> = new Map();
  private agentSkillMap: Map<string, Set<string>> = new Map();

  register(skill: SkillDefinition): void {
    const id = skill.skill.id;
    this.skills.set(id, skill);

    for (const agentId of skill.skill.compatible_agents) {
      if (!this.agentSkillMap.has(agentId)) {
        this.agentSkillMap.set(agentId, new Set());
      }
      this.agentSkillMap.get(agentId)!.add(id);
    }
  }

  unregister(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (!skill) return false;

    for (const agentId of skill.skill.compatible_agents) {
      this.agentSkillMap.get(agentId)?.delete(skillId);
    }
    this.skills.delete(skillId);
    return true;
  }

  get(skillId: string): SkillDefinition | undefined {
    return this.skills.get(skillId);
  }

  getForAgent(agentId: string): SkillDefinition[] {
    const skillIds = this.agentSkillMap.get(agentId);
    if (!skillIds) return [];
    return Array.from(skillIds)
      .map((id) => this.skills.get(id))
      .filter((s): s is SkillDefinition => s !== undefined);
  }

  listAll(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  has(skillId: string): boolean {
    return this.skills.has(skillId);
  }
}
