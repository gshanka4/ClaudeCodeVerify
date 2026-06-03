import type { CodeDiff, GovernanceRule, RuleCondition, RuleSeverity } from "@architectai/shared";

export interface ParsedFile {
  filePath: string;
  imports: string[];
  parseError: string | null;
}

export interface RuleViolation {
  rule: GovernanceRule;
  message: string;
  severity: RuleSeverity;
  lineHint?: number;
}

export interface EvaluateInput {
  architectureId: string;
  architectureVersion: number;
  filePath: string;
  fileContent: string;
  rules: GovernanceRule[];
}

export interface EvaluateResult {
  violations: RuleViolation[];
  parseError: string | null;
  fileHash: string;
}

export interface AutofixInput {
  ruleCode: string;
  filePath: string;
  fileContent: string;
  template: string;
  description: string;
}

export type { CodeDiff, RuleCondition };
