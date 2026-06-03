import type { GovernanceRule } from "@architectai/shared";
import { hashFileContent } from "./hash";
import { matchRules } from "./matchers";
import { parseFile } from "./parser";
import type { DriftCheckCache } from "./cache";
import type { RuleIndex } from "./rule-index";
import type { EvaluateInput, EvaluateResult } from "./types";

export interface EngineDeps {
  ruleIndex: RuleIndex;
  cache: DriftCheckCache;
}

export function evaluateFile(deps: EngineDeps, input: EvaluateInput): EvaluateResult {
  const fileHash = hashFileContent(input.fileContent);
  const cached = deps.cache.get(input.architectureId, input.architectureVersion, fileHash);
  if (cached) return cached;

  let rules = deps.ruleIndex.get(input.architectureId, input.architectureVersion);
  if (!rules) {
    deps.ruleIndex.warm(input.architectureId, input.architectureVersion, input.rules);
    rules = input.rules;
  }

  const parsed = parseFile(input.filePath, input.fileContent);
  if (parsed.parseError === "cannot_parse" || parsed.parseError === "unsupported_language") {
    const result: EvaluateResult = { violations: [], parseError: parsed.parseError, fileHash };
    deps.cache.set(input.architectureId, input.architectureVersion, fileHash, result);
    return result;
  }

  const violations = matchRules(parsed, input.filePath, input.fileContent, rules);
  const result: EvaluateResult = { violations, parseError: null, fileHash };
  deps.cache.set(input.architectureId, input.architectureVersion, fileHash, result);
  return result;
}

export function toGovernanceRules(
  rows: {
    id: string;
    rulesetId: string;
    code: string;
    type: GovernanceRule["type"];
    severity: GovernanceRule["severity"];
    name: string;
    description: string;
    rationale: string;
    conditionJson: unknown;
    autoFixJson: unknown;
    enabled: boolean;
  }[],
): GovernanceRule[] {
  return rows.map((r) => ({
    id: r.id,
    rulesetId: r.rulesetId,
    code: r.code,
    type: r.type,
    severity: r.severity,
    name: r.name,
    description: r.description,
    rationale: r.rationale,
    condition: r.conditionJson as GovernanceRule["condition"],
    autoFixStrategy: r.autoFixJson as GovernanceRule["autoFixStrategy"],
    enabled: r.enabled,
  }));
}
