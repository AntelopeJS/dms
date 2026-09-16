<script setup lang="ts">
import { useNow } from "@vueuse/core";

export interface PresenceEditActor {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  since?: number;
}

interface PresenceEditModalProps {
  editors: PresenceEditActor[];
}

interface PresenceEditModalEmits {
  (e: "close", value: boolean): void;
}

const NAMES_SEPARATOR = ", ";
const NOW_REFRESH_INTERVAL = 1_000;
const DURATION_UNITS = [
  { key: "day", ms: 86_400_000 },
  { key: "hour", ms: 3_600_000 },
  { key: "minute", ms: 60_000 },
  { key: "second", ms: 1_000 },
];

const props = defineProps<PresenceEditModalProps>();
const emit = defineEmits<PresenceEditModalEmits>();
const { t } = useI18n();

const isOpen = ref(true);
const now = useNow({ interval: NOW_REFRESH_INTERVAL });

const editorName = (editor: PresenceEditActor): string =>
  editor.displayName || editor.id;

const namesLabel = computed(() =>
  props.editors.map(editorName).join(NAMES_SEPARATOR),
);

const elapsedUnit = (elapsed: number) =>
  DURATION_UNITS.find((unit) => elapsed >= unit.ms);

const sinceValue = computed(() => {
  const since = props.editors[0]?.since;
  if (!since) return t("dms.realtime.duration_moment");
  const elapsed = now.value.getTime() - since;
  const unit = elapsedUnit(elapsed);
  if (!unit) return t("dms.realtime.duration_moment");
  return `${Math.floor(elapsed / unit.ms)} ${t(`dms.realtime.duration_short.${unit.key}`)}`;
});

function handleConfirm() {
  isOpen.value = false;
  emit("close", true);
}

function handleCancel() {
  isOpen.value = false;
  emit("close", false);
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :ui="{
      content: 'sm:max-w-md divide-y-0',
      header: 'min-h-0 p-2',
    }"
    @update:open="(v: boolean) => !v && handleCancel()"
  >
    <template #body>
      <div class="flex flex-col items-center text-center">
        <span
          class="bg-primary/10 text-primary ring-primary/20 relative flex size-14 items-center justify-center rounded-2xl ring-1"
        >
          <UIcon name="i-lucide-lock" class="size-6" />
          <span class="absolute -end-1 -top-1 flex size-3">
            <span
              class="bg-primary absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:animate-none"
            />
            <span
              class="bg-primary ring-bg relative inline-flex size-3 rounded-full ring-2"
            />
          </span>
        </span>

        <h3 class="text-highlighted mt-4 text-lg font-semibold">
          {{ $t("dms.realtime.editing_warning_title") }}
        </h3>

        <i18n-t
          keypath="dms.realtime.editing_subtitle"
          :plural="props.editors.length"
          tag="p"
          scope="global"
          class="text-muted mt-1.5 text-sm"
        >
          <template #name>
            <strong class="text-highlighted font-semibold">
              {{ namesLabel }}
            </strong>
          </template>
          <template #time>{{ sinceValue }}</template>
        </i18n-t>

        <i18n-t
          keypath="dms.realtime.editing_warning_message"
          tag="p"
          scope="global"
          class="text-muted mt-2 text-sm leading-relaxed"
        >
          <template #action>
            <strong class="text-highlighted font-semibold">
              {{ $t("dms.realtime.editing_warning_action") }}
            </strong>
          </template>
        </i18n-t>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full flex-col gap-2">
        <UButton
          :label="$t('dms.realtime.editing_warning_confirm')"
          color="primary"
          block
          @click="handleConfirm"
        />
        <UButton
          :label="$t('dms.confirm.cancel')"
          variant="outline"
          color="neutral"
          block
          @click="handleCancel"
        />
      </div>
    </template>
  </UModal>
</template>
