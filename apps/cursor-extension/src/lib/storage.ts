import type { CursorConfig } from "@architectai/shared";

const KEYS = {
  token: "architectai.token",
  workspaceId: "architectai.workspaceId",
  config: "architectai.config",
  dismissed: "architectai.dismissedDrifts",
} as const;

export interface SecretStore {
  get(key: string): Promise<string | undefined>;
  update(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class MemorySecretStore implements SecretStore {
  private readonly data = new Map<string, string>();

  async get(key: string): Promise<string | undefined> {
    return this.data.get(key);
  }

  async update(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

export async function loadStoredSession(store: SecretStore): Promise<{
  token: string | null;
  workspaceId: string | null;
  config: CursorConfig | null;
  dismissedDriftIds: Set<string>;
}> {
  const token = (await store.get(KEYS.token)) ?? null;
  const workspaceId = (await store.get(KEYS.workspaceId)) ?? null;
  const rawConfig = await store.get(KEYS.config);
  const config = rawConfig ? (JSON.parse(rawConfig) as CursorConfig) : null;
  const dismissedRaw = await store.get(KEYS.dismissed);
  const dismissed = dismissedRaw
    ? new Set<string>(JSON.parse(dismissedRaw) as string[])
    : new Set<string>();
  return { token, workspaceId, config, dismissedDriftIds: dismissed };
}

export async function persistSession(
  store: SecretStore,
  input: {
    token: string;
    workspaceId: string;
    config: CursorConfig;
  },
): Promise<void> {
  await store.update(KEYS.token, input.token);
  await store.update(KEYS.workspaceId, input.workspaceId);
  await store.update(KEYS.config, JSON.stringify(input.config));
}

export async function persistDismissed(
  store: SecretStore,
  ids: Set<string>,
): Promise<void> {
  await store.update(KEYS.dismissed, JSON.stringify([...ids]));
}
