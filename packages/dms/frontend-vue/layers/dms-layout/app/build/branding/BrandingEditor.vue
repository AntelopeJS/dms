<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import DmsSegmented from "#dms-ui/app/components/segmented/Segmented.vue";
import BrandingDeveloperPanel from "./BrandingDeveloperPanel.vue";
import BrandingPreview from "./BrandingPreview.vue";
import BrandingSimplePanel from "./BrandingSimplePanel.vue";
import { useBrandingApi } from "./api";
import { errorDetail } from "./errors";
import { declareCatalogFonts } from "./fonts";
import { installBrandingMessages } from "./messages";
import type { EditorMode } from "./model";
import { previewStyle, readDmsTokens, type DmsTokens } from "./preview-style";
import { THEME_MODES, type ThemeMode } from "./theme-types";
import { useBrandingEditor } from "./useBrandingEditor";

const i18n = useI18n();
installBrandingMessages(i18n);
const { t } = i18n;
const toast = useToast();
const { confirm } = useConfirm();
const editor = useBrandingEditor(useBrandingApi());
const { load, edit, changes, notice, isSaving, mode, previewMode } = editor;

const defaults = computed(() => useDmsAppConfig().branding?.defaults);
const dmsColors = computed<Partial<Record<string, string>>>(
  () => defaults.value?.colors ?? {},
);
const dmsLogos = computed(() => defaults.value?.logo ?? {});

const isMounted = ref(false);
const tokens = shallowRef<DmsTokens>({ light: {}, dark: {} });
let removeFonts: (() => void) | undefined;

onMounted(() => {
  isMounted.value = true;
  tokens.value = readDmsTokens(Array.from(document.styleSheets));
  removeFonts = declareCatalogFonts();
  void editor.open();
});

onBeforeUnmount(() => removeFonts?.());

const styles = computed(() => {
  const draft = edit.value?.draft;
  const styleFor = (forMode: ThemeMode) =>
    draft
      ? previewStyle({
          tokens: tokens.value,
          draft,
          mode: forMode,
          dmsColors: dmsColors.value,
        })
      : {};
  return { light: styleFor("light"), dark: styleFor("dark") };
});

const modeItems = computed(() =>
  (["simple", "developer"] as const).map((value) => ({
    label: t(`branding.mode.${value}`),
    value,
  })),
);
const previewItems = computed(() =>
  THEME_MODES.map((value) => ({
    label: t(`branding.preview.${value}`),
    value,
    icon: value === "light" ? "i-ph-sun-light" : "i-ph-moon-light",
  })),
);

function setMode(value: string | number | undefined): void {
  const next = modeItems.value.find((item) => item.value === value);
  if (next) mode.value = next.value satisfies EditorMode;
}

function setPreviewMode(value: string | number | undefined): void {
  const next = THEME_MODES.find((entry) => entry === value);
  if (next) previewMode.value = next;
}

async function save(): Promise<void> {
  const outcome = await editor.save();
  if (!outcome?.ok) return;
  const sanitized = outcome.warnings.some(
    (warning) => warning.code === "svg_sanitized",
  );
  toast.add({
    title: t("branding.saved"),
    description: sanitized ? t("branding.svg_sanitized") : undefined,
    color: sanitized ? "warning" : "success",
  });
}

async function discard(): Promise<void> {
  if (changes.value === 0) return;
  const isConfirmed = await confirm({
    title: t("branding.discard_confirm.title"),
    description: t("branding.discard_confirm.description"),
    confirmLabel: t("branding.discard"),
    color: "error",
  });
  if (isConfirmed) editor.discard();
}

const noticeBanner = computed(() => {
  const current = notice.value;
  if (!current || current.kind === "stale") return undefined;
  return current.kind === "invalid"
    ? {
        title: t("branding.state.invalid"),
        description: current.issues
          .map(
            (issue) =>
              `${issue.pointer} ${t(`branding.problem.${issue.problem}`)}`,
          )
          .join("\n"),
      }
    : {
        title: t("branding.state.save_refused"),
        description: errorDetail(current.error),
      };
});
</script>

<template>
  <div
    data-branding-editor
    class="text-default flex h-full min-h-0 flex-col bg-(--ui-bg)"
  >
    <header
      class="border-default flex h-12 shrink-0 items-center gap-2 border-b px-4"
    >
      <h1 class="text-highlighted text-sm font-semibold">
        {{ t("branding.title") }}
      </h1>
      <UBadge color="warning" variant="soft" size="sm" class="uppercase">
        {{ t("branding.dev_badge") }}
      </UBadge>
      <div class="ms-auto flex items-center gap-2">
        <DmsSegmented
          :model-value="mode"
          :items="modeItems"
          :aria-label="t('branding.editor_mode')"
          @update:model-value="setMode"
        />
        <UBadge
          data-change-count
          color="neutral"
          variant="soft"
          size="sm"
          class="tabular-nums"
        >
          {{ t("branding.changes", { count: changes }, changes) }}
        </UBadge>
        <UButton
          data-discard
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="changes === 0 || isSaving"
          @click="discard"
        >
          {{ t("branding.discard") }}
        </UButton>
        <UButton
          data-save
          size="sm"
          :loading="isSaving"
          :disabled="changes === 0"
          @click="save"
        >
          {{ t("branding.save") }}
        </UButton>
      </div>
    </header>

    <div
      v-if="!isMounted || load.status === 'loading'"
      class="flex flex-1 gap-4 p-4"
    >
      <div class="flex w-[270px] flex-col gap-3">
        <USkeleton v-for="index in 6" :key="index" class="h-8 w-full" />
      </div>
      <USkeleton class="h-[420px] flex-1" />
    </div>

    <div v-else-if="load.status === 'no-layer'" class="p-6" data-no-layer>
      <DmsEmptyState
        :title="t('branding.state.no_layer_title')"
        :description="
          load.created
            ? t('branding.state.layer_created', {
                path: load.created.sourcePath,
              })
            : t('branding.state.no_layer_description', { ref: load.ref })
        "
        icon="i-ph-paint-brush-light"
      >
        <template v-if="!load.created" #actions>
          <UButton data-create-layer @click="editor.createLayer">
            {{ t("branding.state.create_layer") }}
          </UButton>
        </template>
      </DmsEmptyState>
    </div>

    <div v-else-if="load.status === 'refused'" class="p-4" data-refused>
      <DmsBanner
        tone="error"
        :title="t('branding.state.refused')"
        :description="errorDetail(load.error)"
      />
    </div>

    <template v-else>
      <div
        v-if="notice?.kind === 'stale'"
        class="border-default border-b px-4 py-2"
        data-stale
      >
        <DmsBanner
          tone="warning"
          size="sm"
          :title="t('branding.state.stale')"
          :description="t('branding.state.stale_description')"
        >
          <template #actions>
            <UButton data-reload size="sm" @click="editor.reload">
              {{ t("branding.state.reload") }}
            </UButton>
          </template>
        </DmsBanner>
      </div>
      <div v-else-if="noticeBanner" class="border-default border-b px-4 py-2">
        <DmsBanner
          tone="error"
          size="sm"
          :title="noticeBanner.title"
          :description="noticeBanner.description"
        />
      </div>
      <div class="flex min-h-0 flex-1">
        <aside
          class="border-default shrink-0 overflow-y-auto border-e p-4"
          :class="mode === 'developer' ? 'w-[460px]' : 'w-[270px]'"
        >
          <BrandingSimplePanel
            v-if="mode === 'simple'"
            :editor="editor"
            :styles="styles"
            :dms-colors="dmsColors"
          />
          <BrandingDeveloperPanel
            v-else
            :editor="editor"
            :tokens="tokens"
            :dms-colors="dmsColors"
          />
        </aside>
        <section class="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div class="flex items-center justify-between">
            <span class="text-muted text-sm">
              {{ t("branding.preview.label") }}
            </span>
            <DmsSegmented
              :model-value="previewMode"
              :items="previewItems"
              :aria-label="t('branding.preview.mode')"
              @update:model-value="setPreviewMode"
            />
          </div>
          <BrandingPreview
            v-if="edit"
            :edit="edit"
            :mode="previewMode"
            :tokens="tokens"
            :dms-colors="dmsColors"
            :dms-logos="dmsLogos"
          />
        </section>
      </div>
    </template>
  </div>
</template>
