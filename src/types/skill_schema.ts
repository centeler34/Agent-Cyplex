/**
 * Skill YAML schema types with Zod validation.
 */

import { z } from 'zod';

export const SkillInputSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'integer', 'boolean', 'list', 'object']),
  required: z.boolean().default(true),
  default: z.unknown().optional(),
  description: z.string().optional(),
});

export const SkillOutputSchema = z.object({
  name: z.string(),
  type: z.string(),
  description: z.string().optional(),
});

export const SkillStepSchema = z.object({
  name: z.string(),
  instruction: z.string().optional(),
  invoke_skill: z.string().optional(),
  inputs: z.record(z.unknown()).optional(),
  requires_key: z.string().optional(),
});

export const SkillPermissionsSchema = z.object({
  'network.allow': z.array(z.string()).optional(),
  'fs.read': z.array(z.string()).optional(),
  'fs.write': z.array(z.string()).optional(),
  'fs.execute': z.boolean().optional(),
  'api.keys': z.array(z.string()).optional(),
});

export const SkillErrorHandlerSchema = z.object({
  retry: z.number().default(0),
  fallback: z.string().optional(),
});

export const SkillDefinitionSchema = z.object({
  skill: z.object({
    id: z.string(),
    name: z.string(),
    version: z.string(),
    author: z.string(),
    description: z.string(),
    compatible_agents: z.array(z.string()),
    permissions_required: SkillPermissionsSchema,
    inputs: z.array(SkillInputSchema),
    outputs: z.array(SkillOutputSchema),
    steps: z.array(SkillStepSchema),
    on_error: SkillErrorHandlerSchema.optional(),
    tags: z.array(z.string()).optional(),
    signature: z.string().optional(),
  }),
});

export type SkillInput = z.infer<typeof SkillInputSchema>;
export type SkillOutput = z.infer<typeof SkillOutputSchema>;
export type SkillStep = z.infer<typeof SkillStepSchema>;
export type SkillPermissions = z.infer<typeof SkillPermissionsSchema>;
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

export type SkillScanStatus = 'pending_scan' | 'scanning' | 'clean' | 'rejected' | 'approved';

export interface SkillScanReport {
  skill_id: string;
  source: string;
  hash_sha256: string;
  scanned_at: string;
  stages: {
    structural: StageResult;
    permissions: StageResult;
    injection: StageResult;
    malware: StageResult;
  };
  overall: 'clean' | 'rejected';
  details: string[];
}

export interface StageResult {
  passed: boolean;
  findings: string[];
}
