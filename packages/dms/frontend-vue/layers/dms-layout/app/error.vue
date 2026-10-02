<script setup lang="ts">
import type { DmsErrorData } from "#dms/frontend-module";
import StageCard, {
  type StageCardTone,
} from "./components/layout/StageCard.vue";
import EmptyLayout from "./custom-layouts/EmptyLayout.vue";

interface ErrorConfig {
  icon: string;
  titleKey: string;
  descriptionKey: string;
  tone: StageCardTone;
}

const ERROR_CONFIGS: Record<number, ErrorConfig> = {
  404: {
    icon: "i-ph-magnifying-glass",
    titleKey: "error.404.title",
    descriptionKey: "error.404.description",
    tone: "accent",
  },
  401: {
    icon: "i-ph-lock-simple",
    titleKey: "error.401.title",
    descriptionKey: "error.401.description",
    tone: "warning",
  },
  403: {
    icon: "i-ph-prohibition",
    titleKey: "error.403.title",
    descriptionKey: "error.403.description",
    tone: "warning",
  },
};

const DEFAULT_ERROR_CONFIG: ErrorConfig = {
  icon: "i-ph-warning-circle",
  titleKey: "error.500.title",
  descriptionKey: "error.500.description",
  tone: "error",
};

const RECOVERING_ICON = "i-ph-spinner-gap";

const DEFAULT_STATUS_CODE = 500;

// Their cards already say what happened; the message behind them is the
// technical cause ("DMS backend request failed"), which the server has logged.
const STATUSES_WITHOUT_ERROR_MESSAGE = new Set([
  HTTP_NOT_FOUND,
  HTTP_FORBIDDEN,
]);

const props = defineProps<{
  error: DmsErrorData;
}>();

const { t } = useI18n();
const router = useDmsRouter();
const homepage = useHomepage();
const { loggedIn, reconcileSession, redirectToAuth } = useSessionRecovery();

const isRecovering = ref(false);

const statusCode = computed(
  () => props.error.statusCode || DEFAULT_STATUS_CODE,
);

const visibleErrorMessage = computed(() =>
  STATUSES_WITHOUT_ERROR_MESSAGE.has(statusCode.value)
    ? undefined
    : props.error.message,
);

const errorConfig = computed(
  () => ERROR_CONFIGS[statusCode.value] || DEFAULT_ERROR_CONFIG,
);

const title = computed(() =>
  isRecovering.value
    ? t("error.recovering.title")
    : t(errorConfig.value.titleKey),
);

const description = computed(() =>
  isRecovering.value
    ? t("error.recovering.description")
    : t(errorConfig.value.descriptionKey),
);

const handleError = async () => {
  clearError();
  if (!loggedIn.value) {
    await redirectToAuth(homepage);
  } else {
    await navigateDms(homepage, { replace: true });
  }
};

async function attemptUnauthorizedRecovery(): Promise<void> {
  if (props.error.statusCode !== HTTP_UNAUTHORIZED) return;

  isRecovering.value = true;
  await reconcileSession();
  isRecovering.value = false;

  if (!loggedIn.value) {
    await redirectToAuth(homepage);
  }
}

onMounted(() => {
  void attemptUnauthorizedRecovery();
});
</script>

<template>
  <EmptyLayout>
    <StageCard
      :icon="isRecovering ? RECOVERING_ICON : errorConfig.icon"
      :tone="isRecovering ? 'neutral' : errorConfig.tone"
      :eyebrow="$t('error.page.eyebrow', { code: statusCode })"
      :title="title"
      :description="description"
      :icon-class="isRecovering ? 'animate-spin' : undefined"
    >
      <p
        v-if="!isRecovering && visibleErrorMessage"
        class="border-default text-muted mt-4 rounded-md border bg-(--dms-bg-muted) px-3 py-2 font-mono text-xs break-words"
      >
        {{ visibleErrorMessage }}
      </p>

      <div v-if="!isRecovering" class="mt-[22px] grid gap-2 sm:grid-cols-2">
        <UButton
          :label="$t('button.go_home')"
          icon="i-ph-house"
          size="lg"
          class="justify-center"
          @click="handleError"
        />
        <UButton
          :label="$t('button.go_back')"
          icon="i-ph-arrow-left"
          color="neutral"
          variant="outline"
          size="lg"
          class="justify-center"
          @click="router.back()"
        />
      </div>
    </StageCard>
  </EmptyLayout>
</template>
