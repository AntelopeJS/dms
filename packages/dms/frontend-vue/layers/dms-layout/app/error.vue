<script setup lang="ts">
import type { DmsErrorData } from "#dms-inertia/frontend-module";

const ERROR_CONFIGS: Record<
  number,
  { icon: string; titleKey: string; descriptionKey: string; color: string }
> = {
  404: {
    icon: "i-ph-magnifying-glass",
    titleKey: "error.404.title",
    descriptionKey: "error.404.description",
    color: "primary",
  },
  401: {
    icon: "i-ph-lock",
    titleKey: "error.401.title",
    descriptionKey: "error.401.description",
    color: "orange",
  },
  403: {
    icon: "i-ph-prohibition",
    titleKey: "error.403.title",
    descriptionKey: "error.403.description",
    color: "red",
  },
};

const DEFAULT_ERROR_CONFIG = {
  icon: "i-ph-warning-circle",
  titleKey: "error.500.title",
  descriptionKey: "error.500.description",
  color: "red",
};

const DEFAULT_STATUS_CODE = 500;

const props = defineProps<{
  error: DmsErrorData;
}>();

const { t } = useI18n();
const router = useDmsRouter();
const homepage = useHomepage();
const { loggedIn, reconcileSession, redirectToAuth } = useSessionRecovery();

const isRecovering = ref(false);

const errorConfig = computed(() => {
  const statusCode = props.error.statusCode || DEFAULT_STATUS_CODE;
  const config = ERROR_CONFIGS[statusCode] || DEFAULT_ERROR_CONFIG;
  return {
    icon: config.icon,
    title: t(config.titleKey),
    description: t(config.descriptionKey),
    color: config.color,
  };
});

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
  <div class="flex min-h-screen flex-col items-center justify-center p-4">
    <header class="mb-10">
      <DmsAppLogo class="h-20 w-auto" />
    </header>

    <DmsCard variant="elevated" class="w-full max-w-md">
      <div class="flex flex-col items-center text-center">
        <div class="text-muted mb-4 text-6xl font-bold tracking-tight">
          {{ error.statusCode || DEFAULT_STATUS_CODE }}
        </div>

        <div
          class="mb-6 flex size-20 items-center justify-center rounded-full"
          :class="`bg-${errorConfig.color}-50 dark:bg-${errorConfig.color}-950`"
        >
          <Icon
            :name="isRecovering ? 'i-ph-spinner-gap' : errorConfig.icon"
            class="size-10"
            :class="[
              `text-${errorConfig.color}-500`,
              isRecovering ? 'animate-spin' : '',
            ]"
          />
        </div>

        <h1 class="text-highlighted mb-2 text-2xl font-bold">
          {{ isRecovering ? $t("error.recovering.title") : errorConfig.title }}
        </h1>

        <p class="text-muted mb-6">
          {{
            isRecovering
              ? $t("error.recovering.description")
              : errorConfig.description
          }}
        </p>

        <p
          v-if="!isRecovering && error.message"
          class="text-dimmed mb-6 text-sm"
        >
          {{ error.message }}
        </p>

        <div v-if="!isRecovering" class="flex gap-3">
          <UButton
            :label="$t('button.go_home')"
            color="primary"
            size="lg"
            @click="handleError"
          />
          <UButton
            :label="$t('button.go_back')"
            color="neutral"
            variant="outline"
            size="lg"
            @click="router.back()"
          />
        </div>
      </div>
    </DmsCard>
  </div>
</template>
