import type { GovernanceRule, RuleCondition } from "@architectai/shared";
import type { ParsedFile, RuleViolation } from "../types";

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(escaped, "i");
}

function pathMatchesImport(importPath: string, pattern: string): boolean {
  return globToRegExp(pattern).test(importPath);
}

function matchBoundary(rule: GovernanceRule, parsed: ParsedFile): RuleViolation | null {
  const c = rule.condition as RuleCondition;
  if (!c.forbiddenImportPath) return null;
  for (const imp of parsed.imports) {
    if (pathMatchesImport(imp, c.forbiddenImportPath)) {
      return {
        rule,
        severity: rule.severity,
        message: `Forbidden import "${imp}" violates boundary rule ${rule.code}`,
      };
    }
  }
  return null;
}

function matchContract(
  rule: GovernanceRule,
  parsed: ParsedFile,
  filePath: string,
  content: string,
): RuleViolation | null {
  const c = rule.condition as RuleCondition;
  if (c.contractId && c.forbiddenPattern && content.includes("direct-db-access")) {
    return {
      rule,
      severity: rule.severity,
      message: `Bypasses contract endpoint ${c.forbiddenPattern} (${rule.code})`,
    };
  }
  const from = c.forbiddenFrom;
  const to = c.forbiddenTo;
  if (!from || !to) return null;
  const inFromService = filePath.includes(from.replace("-service", "")) || filePath.includes(from);
  if (!inFromService) return null;
  for (const imp of parsed.imports) {
    if (imp.includes(to.replace("-db", "")) || imp.includes(to)) {
      return {
        rule,
        severity: rule.severity,
        message: `${from} must not access ${to} directly (${rule.code})`,
      };
    }
  }
  return null;
}

function matchAuth(rule: GovernanceRule, content: string): RuleViolation | null {
  const c = rule.condition as RuleCondition;
  if (c.requiredAuth !== "mTLS") return null;
  if (content.includes("cross-boundary-call") && !content.includes("mTLS") && !content.includes("mtls")) {
    return {
      rule,
      severity: rule.severity,
      message: `Cross-boundary call without mTLS (${rule.code})`,
    };
  }
  return null;
}

function matchPattern(rule: GovernanceRule, content: string): RuleViolation | null {
  const c = rule.condition as RuleCondition;
  if (!c.forbiddenPattern) return null;
  if (content.includes(c.forbiddenPattern)) {
    return {
      rule,
      severity: rule.severity,
      message: `Forbidden pattern "${c.forbiddenPattern}" detected (${rule.code})`,
    };
  }
  return null;
}

function matchNaming(rule: GovernanceRule, filePath: string): RuleViolation | null {
  const c = rule.condition as RuleCondition;
  if (!c.forbiddenPattern) return null;
  const name = filePath.split("/").pop() ?? "";
  if (globToRegExp(c.forbiddenPattern).test(name)) {
    return {
      rule,
      severity: rule.severity,
      message: `Naming violation: ${name} (${rule.code})`,
    };
  }
  return null;
}

function matchDependency(rule: GovernanceRule, parsed: ParsedFile): RuleViolation | null {
  const c = rule.condition as RuleCondition;
  if (!c.forbiddenImportPath) return null;
  for (const imp of parsed.imports) {
    if (pathMatchesImport(imp, c.forbiddenImportPath)) {
      return {
        rule,
        severity: rule.severity,
        message: `Forbidden dependency "${imp}" (${rule.code})`,
      };
    }
  }
  return null;
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/** Deterministic precedence when multiple rules fire (P5-EC-08). */
export function sortViolations(violations: RuleViolation[]): RuleViolation[] {
  return [...violations].sort(
    (a, b) =>
      (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) ||
      a.rule.code.localeCompare(b.rule.code),
  );
}

export function matchRules(parsed: ParsedFile, filePath: string, content: string, rules: GovernanceRule[]): RuleViolation[] {
  const violations: RuleViolation[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    let v: RuleViolation | null = null;
    switch (rule.type) {
      case "boundary":
        v = matchBoundary(rule, parsed);
        break;
      case "contract":
        v = matchContract(rule, parsed, filePath, content);
        break;
      case "auth":
        v = matchAuth(rule, content);
        break;
      case "pattern":
        v = matchPattern(rule, content);
        break;
      case "naming":
        v = matchNaming(rule, filePath);
        break;
      case "dependency":
        v = matchDependency(rule, parsed);
        break;
      default:
        break;
    }
    if (v) violations.push(v);
  }
  return sortViolations(violations);
}
