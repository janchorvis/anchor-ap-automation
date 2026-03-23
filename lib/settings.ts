import { AppSettings, DEFAULT_SETTINGS } from "./types";

interface KVStore {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
}

let kvClient: KVStore | null = null;

async function getKV(): Promise<KVStore> {
  if (kvClient) return kvClient;

  try {
    // Dynamically import to avoid build errors when KV is not configured
    const mod = await import("@vercel/kv");
    kvClient = mod.kv as unknown as KVStore;
    return kvClient;
  } catch {
    // KV not available (local dev without KV), use a simple in-memory fallback
    const memStore: Record<string, unknown> = {};
    kvClient = {
      get: async (key: string) => memStore[key] ?? null,
      set: async (key: string, value: unknown) => {
        memStore[key] = value;
      },
    };
    return kvClient;
  }
}

const SETTINGS_KEY = "ap:settings";
const RUN_HISTORY_KEY = "ap:run_history";

export async function getSettings(): Promise<AppSettings> {
  try {
    const kv = await getKV();
    const stored = (await kv.get(SETTINGS_KEY)) as AppSettings | null;
    return stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const kv = await getKV();
  await kv.set(SETTINGS_KEY, settings);
}

export async function getRunHistory(): Promise<unknown[]> {
  try {
    const kv = await getKV();
    const history = (await kv.get(RUN_HISTORY_KEY)) as unknown[] | null;
    return history ?? [];
  } catch {
    return [];
  }
}

export async function appendRunHistory(entry: unknown): Promise<void> {
  const kv = await getKV();
  const history = await getRunHistory();
  // Keep last 50 runs
  const updated = [entry, ...history].slice(0, 50);
  await kv.set(RUN_HISTORY_KEY, updated);
}
