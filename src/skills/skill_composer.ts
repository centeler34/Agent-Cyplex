/**
 * Skill-invokes-skill composition resolver.
 * Resolves skill references within steps and validates the composition graph.
 */

import { SkillRegistry } from './skill_registry.js';
import type { SkillDefinition } from '../types/skill_schema.js';

export interface CompositionNode {
  skillId: string;
  referencedSkills: string[];
  depth: number;
}

export class SkillComposer {
  private registry: SkillRegistry;
  private maxDepth: number;

  constructor(registry: SkillRegistry, maxDepth = 5) {
    this.registry = registry;
    this.maxDepth = maxDepth;
  }

  /**
   * Resolve all skill references in a skill's steps.
   * Returns the ordered list of skills to execute.
   */
  resolve(skillId: string): CompositionNode[] {
    const visited = new Set<string>();
    const result: CompositionNode[] = [];
    this.walk(skillId, 0, visited, result);
    return result;
  }

  /**
   * Validate that all referenced skills exist and there are no cycles.
   */
  validate(skillId: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const visited = new Set<string>();
    this.validateWalk(skillId, 0, visited, [], errors);
    return { valid: errors.length === 0, errors };
  }

  private walk(skillId: string, depth: number, visited: Set<string>, result: CompositionNode[]): void {
    if (visited.has(skillId)) return;
    if (depth > this.maxDepth) return;

    visited.add(skillId);
    const skill = this.registry.get(skillId);
    if (!skill) return;

    const refs = this.getSkillReferences(skill);
    for (const ref of refs) {
      this.walk(ref, depth + 1, visited, result);
    }

    result.push({ skillId, referencedSkills: refs, depth });
  }

  private validateWalk(
    skillId: string,
    depth: number,
    visited: Set<string>,
    path: string[],
    errors: string[],
  ): void {
    if (path.includes(skillId)) {
      errors.push(`Circular dependency: ${[...path, skillId].join(' -> ')}`);
      return;
    }
    if (depth > this.maxDepth) {
      errors.push(`Max composition depth (${this.maxDepth}) exceeded at skill: ${skillId}`);
      return;
    }
    if (!this.registry.has(skillId)) {
      errors.push(`Referenced skill not found: ${skillId}`);
      return;
    }

    const skill = this.registry.get(skillId)!;
    const refs = this.getSkillReferences(skill);
    for (const ref of refs) {
      this.validateWalk(ref, depth + 1, visited, [...path, skillId], errors);
    }
  }

  private getSkillReferences(skill: SkillDefinition): string[] {
    return skill.skill.steps
      .filter((s) => s.invoke_skill)
      .map((s) => s.invoke_skill!);
  }
}
