/** Inline blob store for MVP (schema `architecture_exports.content`). */
export interface ExportStorage {
  persist(key: string, content: string): Promise<string>;
}

export class InlineExportStorage implements ExportStorage {
  async persist(_key: string, content: string): Promise<string> {
    return content;
  }
}

/** Test double for P6-EC-05 — simulates storage write failure. */
export class FailingExportStorage implements ExportStorage {
  async persist(): Promise<string> {
    throw new Error("storage_write_failed");
  }
}
