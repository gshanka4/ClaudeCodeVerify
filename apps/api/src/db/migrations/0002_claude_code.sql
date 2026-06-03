-- Claude Code growth pivot: export format + agent runtime target.
ALTER TYPE export_format ADD VALUE IF NOT EXISTS 'claude-code-bundle';
ALTER TYPE ide_target ADD VALUE IF NOT EXISTS 'claude-code';
