-- Phase C: persist IDE target on exports and workspace registrations (REQ-3).
CREATE TYPE ide_target AS ENUM ('vscode', 'cursor', 'antigravity');

ALTER TABLE architecture_exports
  ADD COLUMN ide_target ide_target NOT NULL DEFAULT 'cursor';

ALTER TABLE cursor_workspaces
  ADD COLUMN ide_target ide_target NOT NULL DEFAULT 'cursor';
