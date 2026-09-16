<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import { useWindowSize } from "@vueuse/core";

const route = useDmsRoute();
const { t } = useI18n();
const toast = useToast();
const { width } = useWindowSize();
const homepage = useHomepage();
const { $authFetch } = useAuthFetch();

if (!route.query.id) {
  throw createError({
    statusCode: HTTP_BAD_REQUEST,
    statusMessage: INVALID_REQUEST,
    message: "Missing required id parameter",
  });
}

const MOBILE_BREAKPOINT = 375;
const PIN_LENGTH = 6;
const COOLDOWN_DURATION = 60;

const computedSize = computed(() => {
  return width.value < MOBILE_BREAKPOINT ? "lg" : "xl";
});

const isLoading = ref(false);
const form = useTemplateRef("form");

const schema = z.object({
  pin: z.string().array().length(PIN_LENGTH),
});
type Schema = z.output<typeof schema>;
const state = reactive<Partial<Schema>>({});

const { cooldown, startCooldown } = useCooldown(COOLDOWN_DURATION);

onMounted(() => {
  startCooldown();
});

async function onSubmit(event: FormSubmitEvent<Schema>) {
  try {
    isLoading.value = true;
    await $authFetch("/api/auth/verify-email", {
      method: "POST",
      body: {
        token: event.data.pin.join(""),
        user_id: route.query.id as string,
      },
    });

    navigateDms(homepage);
  } catch (error: unknown) {
    useApiError(error, {
      title: "page.validate.error_title",
    });
  } finally {
    isLoading.value = false;
  }
}

function onUpdatePin(value: string[]) {
  if (value.length !== PIN_LENGTH) return;

  form.value?.submit();
}

async function requestEmailValidation() {
  try {
    isLoading.value = true;
    await $authFetch("/api/auth/request-email-verification");

    startCooldown();

    toast.add({
      title: t("page.validate.request_sended"),
      description: t("page.validate.request_sended_description"),
      color: "success",
    });
  } catch (error: unknown) {
    useApiError(error, {
      title: "page.validate.error_title",
    });
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-md">
    <DmsCard variant="elevated" :padded="false" class="p-6 sm:p-12">
      <h1 class="pb-5 text-2xl font-bold">
        {{ $t("page.validate.title") }}
      </h1>

      <p class="text-muted pb-7 text-sm font-normal">
        {{ $t("page.validate.description") }}
      </p>

      <UForm
        ref="form"
        :schema="schema"
        :state="state"
        class="space-y-7"
        @submit="onSubmit"
      >
        <div class="flex items-center justify-center">
          <UPinInput
            v-model="state.pin"
            :length="PIN_LENGTH"
            :size="computedSize"
            type="text"
            otp
            @update:model-value="onUpdatePin"
          />
        </div>

        <div class="flex justify-center">
          <UButton
            v-if="cooldown === 0"
            :label="$t('page.validate.request_validation')"
            :loading="isLoading"
            color="primary"
            variant="ghost"
            size="sm"
            type="button"
            @click="requestEmailValidation()"
          />

          <UButton
            v-else
            :label="
              $t('page.validate.request_validation_in', {
                time: cooldown,
              })
            "
            :loading="isLoading"
            color="neutral"
            variant="link"
            size="sm"
            disabled
          />
        </div>
      </UForm>
    </DmsCard>
  </div>
</template>
