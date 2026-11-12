import {
  logoKey,
  parseLogoKey,
  pendingEntries,
  type PendingLogos,
} from "./logos";
import { rebaseEdit, type SavedTheme, type ThemeEdit } from "./model";
import type { ThemeDraft } from "./theme-types";

/**
 * The unsaved theme kept on this device, so a reload or a closed tab loses
 * none of it: the draft and the files it was made on in `localStorage`, the
 * picked logos' bytes in IndexedDB, where a few of them still fit.
 */
const DRAFT_KEY = "dms:branding:draft";
const DATABASE_NAME = "dms-branding";
const STORE_NAME = "logos";
/** How long a draft nobody came back to is kept. */
export const KEEP_DRAFT_MS = 7 * 24 * 60 * 60 * 1000;

/** A picked logo of a stored draft; its bytes are stored under `blobName`. */
interface StoredLogo {
  blobName: string;
  contentType: string;
  fileName: string;
}

export interface StoredDraft {
  draft: ThemeDraft;
  saved: SavedTheme;
  pendingLogos: Record<string, StoredLogo>;
  at: number;
}

/** A synchronous name derived from a logo's bytes (cyrb53), so a file picked for several slots is stored once. */
export function blobNameOf(base64Content: string): string {
  let first = 0xdeadbeef ^ base64Content.length;
  let second = 0x41c6ce57 ^ base64Content.length;
  for (let index = 0; index < base64Content.length; index++) {
    const code = base64Content.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first =
    Math.imul(first ^ (first >>> 16), 2246822507) ^
    Math.imul(second ^ (second >>> 13), 3266489909);
  second =
    Math.imul(second ^ (second >>> 16), 2246822507) ^
    Math.imul(first ^ (first >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & second) + (first >>> 0);
  return `${base64Content.length.toString(36)}-${hash.toString(36)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTheme(value: unknown): value is ThemeDraft {
  return (
    isRecord(value) &&
    isRecord(value.variables) &&
    isRecord(value.colors) &&
    isRecord(value.logos)
  );
}

function isStoredLogo(value: unknown): value is StoredLogo {
  return (
    isRecord(value) &&
    typeof value.blobName === "string" &&
    typeof value.contentType === "string" &&
    typeof value.fileName === "string"
  );
}

function isStoredDraft(value: unknown): value is StoredDraft {
  return (
    isRecord(value) &&
    isTheme(value.draft) &&
    isRecord(value.saved) &&
    isTheme(value.saved.theme) &&
    typeof value.saved.version === "string" &&
    isRecord(value.pendingLogos) &&
    Object.values(value.pendingLogos).every(isStoredLogo) &&
    typeof value.at === "number"
  );
}

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

let database: Promise<IDBDatabase | undefined> | undefined;

function openDatabase(): Promise<IDBDatabase | undefined> {
  database ??= new Promise((resolve) => {
    try {
      const request = globalThis.indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
  return database;
}

/** The request's result once its transaction completes; undefined on failure. */
async function run<T>(
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<{ result: T } | undefined> {
  const opened = await openDatabase();
  if (!opened) return undefined;
  return new Promise((resolve) => {
    try {
      const transaction = opened.transaction(STORE_NAME, mode);
      const pending = request(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve({ result: pending.result });
      transaction.onerror = () => resolve(undefined);
      transaction.onabort = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

/** Stores the edit; resolves to whether the draft and every logo were stored. */
export async function storeDraft(
  edit: ThemeEdit,
  now = Date.now(),
): Promise<boolean> {
  const blobs = new Map<string, string>();
  const pendingLogos: Record<string, StoredLogo> = {};
  for (const [{ slot, mode }, logo] of pendingEntries(edit.pendingLogos)) {
    const blobName = blobNameOf(logo.base64Content);
    blobs.set(blobName, logo.base64Content);
    pendingLogos[logoKey(slot, mode)] = {
      blobName,
      contentType: logo.contentType,
      fileName: logo.fileName,
    };
  }
  const stored: StoredDraft = {
    draft: edit.draft,
    saved: edit.saved,
    pendingLogos,
    at: now,
  };
  let isDraftStored = false;
  try {
    storage()?.setItem(DRAFT_KEY, JSON.stringify(stored));
    isDraftStored = storage() !== undefined;
  } catch {
    isDraftStored = false;
  }
  const writes = await Promise.all(
    [...blobs].map(([name, content]) =>
      run("readwrite", (store) => store.put(content, name)),
    ),
  );
  return isDraftStored && writes.every(Boolean);
}

/** Forgets the stored draft and every stored logo. */
export async function forgetDraft(): Promise<void> {
  try {
    storage()?.removeItem(DRAFT_KEY);
  } catch {
    return;
  }
  await run("readwrite", (store) => store.clear());
}

/** The stored draft, unless there is none, it is malformed, or older than {@link KEEP_DRAFT_MS}. */
export function storedDraft(now = Date.now()): StoredDraft | undefined {
  let raw: string | null | undefined;
  try {
    raw = storage()?.getItem(DRAFT_KEY);
  } catch {
    return undefined;
  }
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isStoredDraft(parsed) && now - parsed.at <= KEEP_DRAFT_MS)
      return parsed;
  } catch {
    storage()?.removeItem(DRAFT_KEY);
    return undefined;
  }
  storage()?.removeItem(DRAFT_KEY);
  return undefined;
}

async function storedBlob(name: string): Promise<string | undefined> {
  const found = await run("readonly", (store) => store.get(name));
  const value: unknown = found?.result;
  return typeof value === "string" ? value : undefined;
}

/**
 * The stored draft applied on top of the files as they are now: rebased when
 * they moved on since, its logos read back (a logo whose bytes are gone is
 * left out).
 */
export async function restoreDraft(
  stored: StoredDraft,
  current: SavedTheme,
): Promise<ThemeEdit> {
  const pendingLogos: PendingLogos = {};
  for (const [key, logo] of Object.entries(stored.pendingLogos)) {
    const parsed = parseLogoKey(key);
    const base64Content = await storedBlob(logo.blobName);
    if (parsed && base64Content) {
      pendingLogos[logoKey(parsed.slot, parsed.mode)] = {
        contentType: logo.contentType,
        fileName: logo.fileName,
        base64Content,
      };
    }
  }
  const edit: ThemeEdit = {
    saved: stored.saved,
    draft: stored.draft,
    pendingLogos,
  };
  return stored.saved.version === current.version
    ? edit
    : rebaseEdit(edit, current);
}
