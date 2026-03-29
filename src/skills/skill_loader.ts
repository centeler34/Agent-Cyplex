/**
 * YAML skill file parser and validator.
 */

import fs from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { SkillDefinitionSchema, type SkillDefinition } from '../types/skill_schema.js';

export interface SkillLoadResult {
  success: boolean;
  skill?: SkillDefinition;
  errors?: string[];
}

export function loadSkillFromFile(filePath: string): SkillLoadResult {
  if (!fs.existsSync(filePath)) {
    return { success: false, errors: [`File not found: ${filePath}`] };
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  return loadSkillFromString(raw);
}

export function loadSkillFromString(yamlContent: string): SkillLoadResult {
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlContent);
  } catch (err) {
    return { success: false, errors: [`Invalid YAML: ${err instanceof Error ? err.message : String(err)}`] };
  }

  const result = SkillDefinitionSchema.safeParse(parsed);
  if (!result.success) {
    return {
      success: false,
      errors: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
    };
  }

  return { success: true, skill: result.data };
}
