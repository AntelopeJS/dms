import {
  computed,
  onScopeDispose,
  ref,
  shallowRef,
  watch,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from "vue";
import type { BrandingApi } from "./api";
import {
  forgetDraft,
  restoreDraft,
  storedDraft,
  storeDraft,
} from "./device-draft";
import { logoRefusal, logoContentType, type PendingLogo } from "./logos";
import {
  changeCount,
  discardEdit,
  editOf,
  placeLogos,
  rebaseEdit,
  savedThemeOf,
  settleSave,
  toSetThemeDraft,
  type BrandingLoad,
  type EditorMode,
  type LogoPlacement,
  type ThemeEdit,
} from "./model";
import { isMailable, rasterizeForEmail } from "./raster";
import type {
  ThemeRefusal,
  LogoSlot,
  OpWarning,
  ThemeMode,
} from "./theme-types";
import { draftIssues, type DraftIssue } from "./values";

/** What the bar shows after a Save the module did not take. */
export type SaveNotice =
  | { kind: "stale" }
  | { kind: "refused"; error: ThemeRefusal }
  | { kind: "invalid"; issues: DraftIssue[] };

export type SaveOutcome =
  | { ok: true; warnings: OpWarning[] }
  | { ok: false; notice: SaveNotice };

/** How long the device copy waits for the edits to settle. */
export const DEVICE_SYNC_DELAY_MS = 400;

export interface BrandingEditor {
  load: ShallowRef<BrandingLoad>;
  edit: ComputedRef<ThemeEdit | null>;
  changes: ComputedRef<number>;
  mode: Ref<EditorMode>;
  previewMode: Ref<ThemeMode>;
  notice: ShallowRef<SaveNotice | null>;
  isSaving: Ref<boolean>;
  /** Why the last logo picked was refused, as an i18n key. */
  logoProblem: Ref<string | null>;
  open: () => Promise<void>;
  update: (change: (edit: ThemeEdit) => ThemeEdit) => void;
  pickLogo: (
    targets: Omit<LogoPlacement, "logo">[],
    file: File,
  ) => Promise<void>;
  save: () => Promise<SaveOutcome | undefined>;
  reload: () => Promise<void>;
  discard: () => void;
  createLayer: () => Promise<void>;
}

async function base64Of(file: Blob): Promise<string> {
  let binary = "";
  for (const byte of new Uint8Array(await file.arrayBuffer())) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function pendingLogoOf(file: File): Promise<PendingLogo | undefined> {
  const contentType = logoContentType(file);
  return contentType
    ? { contentType, fileName: file.name, base64Content: await base64Of(file) }
    : undefined;
}

function viewerMode(): ThemeMode {
  return typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

/**
 * The Branding editor's state and actions. The state is one {@link BrandingLoad};
 * every edit goes through the pure functions of `model.ts`.
 */
export function useBrandingEditor(api: BrandingApi): BrandingEditor {
  const load = shallowRef<BrandingLoad>({ status: "loading" });
  const mode = ref<EditorMode>("simple");
  const previewMode = ref<ThemeMode>(viewerMode());
  const notice = shallowRef<SaveNotice | null>(null);
  const isSaving = ref(false);
  const logoProblem = ref<string | null>(null);

  const edit = computed(() =>
    load.value.status === "ready" ? load.value : null,
  );
  const changes = computed(() => (edit.value ? changeCount(edit.value) : 0));

  function setEdit(next: ThemeEdit): void {
    load.value = { status: "ready", ...next };
  }

  function update(change: (current: ThemeEdit) => ThemeEdit): void {
    if (edit.value) setEdit(change(edit.value));
  }

  function refuse(error: ThemeRefusal): void {
    load.value =
      error.code === "not_found"
        ? { status: "no-layer", ref: error.ref, created: null }
        : { status: "refused", error };
  }

  async function open(): Promise<void> {
    load.value = { status: "loading" };
    const result = await api.readTheme();
    if (!result.ok) return refuse(result.error);
    const saved = savedThemeOf(result.data);
    const stored = storedDraft(saved.layer);
    setEdit(stored ? await restoreDraft(stored, saved) : editOf(saved));
  }

  async function pickLogo(
    targets: Omit<LogoPlacement, "logo">[],
    file: File,
  ): Promise<void> {
    const refusal = logoRefusal(file);
    logoProblem.value = refusal ?? null;
    if (refusal) return;
    const picked = await pendingLogoOf(file);
    const needsRaster = targets.some(({ slot }) => slot === "email");
    const mailFile =
      needsRaster && !isMailable(file) ? await rasterizeForEmail(file) : file;
    const mailLogo = mailFile ? await pendingLogoOf(mailFile) : undefined;
    const logoFor = (slot: LogoSlot) => (slot === "email" ? mailLogo : picked);
    const placements = targets.flatMap((target) => {
      const logo = logoFor(target.slot);
      return logo ? [{ ...target, logo }] : [];
    });
    update((current) => placeLogos(current, placements));
    if (placements.length < targets.length) {
      logoProblem.value = "branding.logo.not_drawable";
    }
  }

  async function save(): Promise<SaveOutcome | undefined> {
    const sent = edit.value;
    if (!sent || changes.value === 0 || isSaving.value) return undefined;
    const issues = draftIssues(sent.draft);
    if (issues.length > 0) {
      notice.value = { kind: "invalid", issues };
      return { ok: false, notice: notice.value };
    }
    isSaving.value = true;
    try {
      const result = await api.saveTheme(
        toSetThemeDraft(sent),
        sent.saved.version,
      );
      if (!result.ok) {
        notice.value =
          result.error.code === "stale"
            ? { kind: "stale" }
            : { kind: "refused", error: result.error };
        return { ok: false, notice: notice.value };
      }
      notice.value = null;
      const reread = await api.readTheme();
      if (!reread.ok) {
        refuse(reread.error);
      } else if (edit.value) {
        setEdit(settleSave(edit.value, sent, savedThemeOf(reread.data)));
      }
      return { ok: true, warnings: result.warnings ?? [] };
    } finally {
      isSaving.value = false;
    }
  }

  async function reload(): Promise<void> {
    const result = await api.readTheme();
    if (!result.ok) return refuse(result.error);
    notice.value = null;
    update((current) => rebaseEdit(current, savedThemeOf(result.data)));
  }

  function discard(): void {
    notice.value = null;
    update(discardEdit);
  }

  async function createLayer(): Promise<void> {
    const current = load.value;
    if (current.status !== "no-layer") return;
    const result = await api.createLayer();
    if (!result.ok) return refuse(result.error);
    load.value = { ...current, created: result.data };
  }

  let syncTimer: ReturnType<typeof setTimeout> | undefined;

  function syncDevice(): void {
    syncTimer = undefined;
    const current = edit.value;
    if (!current) return;
    if (changeCount(current) > 0) void storeDraft(current);
    else void forgetDraft(current.saved.layer);
  }

  watch(load, () => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncDevice, DEVICE_SYNC_DELAY_MS);
  });

  onScopeDispose(() => {
    if (syncTimer !== undefined) {
      clearTimeout(syncTimer);
      syncDevice();
    }
  });

  return {
    load,
    edit,
    changes,
    mode,
    previewMode,
    notice,
    isSaving,
    logoProblem,
    open,
    update,
    pickLogo,
    save,
    reload,
    discard,
    createLayer,
  };
}
