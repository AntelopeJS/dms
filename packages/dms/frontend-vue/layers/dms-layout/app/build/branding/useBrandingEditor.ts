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
  type SavedTheme,
  type ThemeEdit,
} from "./model";
import { isMailable, rasterizeForEmail } from "./raster";
import type {
  ThemeRefusal,
  LogoSlot,
  OpWarning,
  ThemeLayerDeclaration,
  ThemeMode,
} from "./theme-types";
import { draftIssues, type DraftIssue } from "./values";

/** What the bar shows after a Save the module did not take. */
export type SaveNotice =
  | { kind: "stale" }
  | { kind: "refused"; error: ThemeRefusal }
  | { kind: "repair_refused"; error: ThemeRefusal }
  | { kind: "invalid"; issues: DraftIssue[] };

/**
 * `declared` is false when the files were written but the frontend loader
 * does not load the layer, so the dashboard never shows them.
 */
export type SaveOutcome =
  | { ok: true; warnings: OpWarning[]; declared: boolean }
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
  /** Whether the frontend loader finds the layer, as the last read said; unknown until one. */
  declaration: ShallowRef<ThemeLayerDeclaration | null>;
  /** Set once the editor declared the layer: the dev server serves it after a restart. */
  isRepaired: Ref<boolean>;
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
  repairLayer: () => Promise<void>;
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

/**
 * Where a picked file goes: the file itself in each target, except the email
 * slot, which takes a copy mail clients can show. A target whose logo cannot
 * be drawn gets no placement.
 */
async function placementsOf(
  targets: Omit<LogoPlacement, "logo">[],
  file: File,
): Promise<LogoPlacement[]> {
  const picked = await pendingLogoOf(file);
  const needsRaster = targets.some(({ slot }) => slot === "email");
  const mailFile =
    needsRaster && !isMailable(file) ? await rasterizeForEmail(file) : file;
  const mailLogo = mailFile ? await pendingLogoOf(mailFile) : undefined;
  const logoFor = (slot: LogoSlot) => (slot === "email" ? mailLogo : picked);
  return targets.flatMap((target) => {
    const logo = logoFor(target.slot);
    return logo ? [{ ...target, logo }] : [];
  });
}

function refusedLoad(error: ThemeRefusal): BrandingLoad {
  return error.code === "not_found"
    ? { status: "no-layer", ref: error.ref, created: null }
    : { status: "refused", error };
}

/** The saved theme, with the draft this device kept for its layer on top. */
async function openedEdit(saved: SavedTheme): Promise<ThemeEdit> {
  const stored = storedDraft(saved.layer);
  return stored ? await restoreDraft(stored, saved) : editOf(saved);
}

interface PickedLogos {
  /** An i18n key for what the editor tells the viewer, or null when the file went everywhere. */
  problem: string | null;
  placements: LogoPlacement[];
}

async function pickedLogos(
  targets: Omit<LogoPlacement, "logo">[],
  file: File,
): Promise<PickedLogos> {
  const refusal = logoRefusal(file);
  if (refusal) return { problem: refusal, placements: [] };
  const placements = await placementsOf(targets, file);
  return {
    problem:
      placements.length < targets.length ? "branding.logo.not_drawable" : null,
    placements,
  };
}

function viewerMode(): ThemeMode {
  return typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

/**
 * Keeps the device's copy of the draft in step with `edit`: once the edits
 * settle for {@link DEVICE_SYNC_DELAY_MS}, and at once when the scope ends with
 * a copy still due. The copy is a best effort that never rejects, so nothing
 * waits for it.
 */
function syncDeviceDraft(
  load: ShallowRef<BrandingLoad>,
  edit: ComputedRef<ThemeEdit | null>,
): void {
  let syncTimer: ReturnType<typeof setTimeout> | undefined;

  function syncDevice(): void {
    syncTimer = undefined;
    const current = edit.value;
    if (!current) return;
    const copied =
      changeCount(current) > 0
        ? storeDraft(current)
        : forgetDraft(current.saved.layer);
    copied.catch(() => undefined);
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
}

interface LayerActionsContext {
  api: BrandingApi;
  load: ShallowRef<BrandingLoad>;
  notice: ShallowRef<SaveNotice | null>;
  isRepaired: Ref<boolean>;
  reload: () => Promise<void>;
  refuse: (error: ThemeRefusal) => void;
}

/**
 * The two ways the project gets a layer the frontend loads: creating the one
 * it lacks, and declaring the one it registers without declaring it.
 */
function layerActions(
  context: LayerActionsContext,
): Pick<BrandingEditor, "createLayer" | "repairLayer"> {
  const { api, load, notice, isRepaired, reload, refuse } = context;
  return {
    async createLayer(): Promise<void> {
      const current = load.value;
      if (current.status !== "no-layer") return;
      const result = await api.createLayer();
      if (!result.ok) return refuse(result.error);
      load.value = { ...current, created: result.data };
    },
    async repairLayer(): Promise<void> {
      const result = await api.createLayer();
      if (!result.ok) {
        notice.value = { kind: "repair_refused", error: result.error };
        return;
      }
      isRepaired.value = true;
      await reload();
    },
  };
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
  const declaration = shallowRef<ThemeLayerDeclaration | null>(null);
  const isRepaired = ref(false);
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
    load.value = refusedLoad(error);
  }

  async function open(): Promise<void> {
    load.value = { status: "loading" };
    const result = await api.readTheme();
    if (!result.ok) return refuse(result.error);
    declaration.value = result.data.declaration;
    setEdit(await openedEdit(savedThemeOf(result.data)));
  }

  async function pickLogo(
    targets: Omit<LogoPlacement, "logo">[],
    file: File,
  ): Promise<void> {
    const picked = await pickedLogos(targets, file);
    logoProblem.value = picked.problem;
    if (picked.placements.length > 0) {
      update((current) => placeLogos(current, picked.placements));
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
      } else {
        declaration.value = reread.data.declaration;
        if (edit.value) {
          setEdit(settleSave(edit.value, sent, savedThemeOf(reread.data)));
        }
      }
      return {
        ok: true,
        warnings: result.warnings ?? [],
        declared: declaration.value?.declared ?? true,
      };
    } finally {
      isSaving.value = false;
    }
  }

  async function reload(): Promise<void> {
    const result = await api.readTheme();
    if (!result.ok) return refuse(result.error);
    notice.value = null;
    declaration.value = result.data.declaration;
    update((current) => rebaseEdit(current, savedThemeOf(result.data)));
  }

  function discard(): void {
    notice.value = null;
    update(discardEdit);
  }

  const { createLayer, repairLayer } = layerActions({
    api,
    load,
    notice,
    isRepaired,
    reload,
    refuse,
  });

  syncDeviceDraft(load, edit);

  return {
    load,
    edit,
    changes,
    mode,
    previewMode,
    notice,
    declaration,
    isRepaired,
    isSaving,
    logoProblem,
    open,
    update,
    pickLogo,
    save,
    reload,
    discard,
    createLayer,
    repairLayer,
  };
}
