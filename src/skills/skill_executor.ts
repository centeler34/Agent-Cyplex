/**
 * Step-by-step skill execution engine.
 */

import type { SkillDefinition, SkillStep } from '../types/skill_schema.js';
import type { ModelClient } from '../gateway/model_client.js';

export interface SkillExecutionContext {
  inputs: Record<string, unknown>;
  stepResults: Map<string, unknown>;
  workspacePath: string;
}

export interface StepResult {
  stepName: string;
  success: boolean;
  output: unknown;
  error?: string;
}

export class SkillExecutor {
  private modelClient: ModelClient;

  constructor(modelClient: ModelClient) {
    this.modelClient = modelClient;
  }

  async execute(skill: SkillDefinition, inputs: Record<string, unknown>, workspacePath: string): Promise<StepResult[]> {
    const context: SkillExecutionContext = {
      inputs,
      stepResults: new Map(),
      workspacePath,
    };

    const results: StepResult[] = [];
    let retryCount = 0;
    const maxRetries = skill.skill.on_error?.retry ?? 0;

    for (const step of skill.skill.steps) {
      try {
        const result = await this.executeStep(step, context);
        context.stepResults.set(step.name, result.output);
        results.push(result);
      } catch (error) {
        if (retryCount < maxRetries) {
          retryCount++;
          // Retry the same step
          const retryResult = await this.executeStep(step, context);
          context.stepResults.set(step.name, retryResult.output);
          results.push(retryResult);
        } else {
          results.push({
            stepName: step.name,
            success: false,
            output: null,
            error: error instanceof Error ? error.message : String(error),
          });

          if (skill.skill.on_error?.fallback) {
            results.push({
              stepName: `${step.name}_fallback`,
              success: true,
              output: skill.skill.on_error.fallback,
            });
          }
          break;
        }
      }
    }

    return results;
  }

  private async executeStep(step: SkillStep, context: SkillExecutionContext): Promise<StepResult> {
    if (step.invoke_skill) {
      return {
        stepName: step.name,
        success: true,
        output: { invoked_skill: step.invoke_skill, inputs: step.inputs },
      };
    }

    if (!step.instruction) {
      return { stepName: step.name, success: false, output: null, error: 'Step has no instruction or skill invocation' };
    }

    // Interpolate variables in instruction
    const instruction = this.interpolate(step.instruction, context);

    const response = await this.modelClient.complete({
      messages: [
        { role: 'system', content: 'Execute the following skill step. Return structured results.' },
        { role: 'user', content: instruction },
      ],
      max_tokens: 4096,
      temperature: 0.2,
      stream: false,
    });

    return {
      stepName: step.name,
      success: true,
      output: response.content,
    };
  }

  private interpolate(template: string, context: SkillExecutionContext): string {
    let result = template;
    for (const [key, value] of Object.entries(context.inputs)) {
      result = result.replaceAll(`{${key}}`, String(value));
    }
    for (const [key, value] of context.stepResults) {
      result = result.replaceAll(`{${key}}`, String(value));
    }
    return result;
  }
}
