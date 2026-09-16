<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";

const MIN_VALID_PASSWORD_SCORE = 4;

const route = useDmsRoute();
const { $authFetch } = useAuthFetch();

if (!route.query.token || !route.query.email) {
  throw createError({
    statusCode: HTTP_BAD_REQUEST,
    statusMessage: INVALID_REQUEST,
    message: "Missing required authentication parameters",
  });
}

const isLoading = ref(false);
const isPasswordVisible = ref(false);

const schema = z.object({
  password: passwordSchema,
});
type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({
  password: undefined,
});

const { strength, score, color } = usePasswordStrength(
  computed(() => state.password || ""),
);

async function onSubmit(event: FormSubmitEvent<Schema>) {
  try {
    isLoading.value = true;
    await $authFetch("/api/auth/reset-password", {
      method: "POST",
      body: {
        password: event.data.password,
        token: route.query.token,
        email: route.query.email,
      },
    });

    navigateDms("/auth/recover-success");
  } catch (error: unknown) {
    useApiError(error, {
      title: "page.forgot.error_title",
    });
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-lg">
    <DmsCard variant="elevated" :padded="false" class="p-6 sm:p-12">
      <h1 class="pb-5 text-2xl font-bold">
        {{ $t("page.recover.title") }}
      </h1>

      <p class="text-muted wrap pb-7 text-sm font-normal">
        {{ $t("page.recover.description") }}
      </p>

      <UForm
        :schema="schema"
        :state="state"
        class="space-y-7"
        @submit="onSubmit"
      >
        <div class="flex flex-col gap-4">
          <UFormField
            :error="state.password && color !== 'success'"
            :label="$t('form.password.label')"
            name="password"
          >
            <UInput
              v-model="state.password"
              :color="color"
              :type="isPasswordVisible ? 'text' : 'password'"
              :aria-invalid="score < MIN_VALID_PASSWORD_SCORE"
              aria-describedby="password-strength"
              class="w-full"
            >
              <template #trailing>
                <UButton
                  :icon="
                    isPasswordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'
                  "
                  :aria-label="
                    isPasswordVisible ? 'Hide password' : 'Show password'
                  "
                  :aria-pressed="isPasswordVisible"
                  aria-controls="password"
                  color="neutral"
                  square
                  size="xs"
                  variant="ghost"
                  @click="isPasswordVisible = !isPasswordVisible"
                />
              </template>
            </UInput>
          </UFormField>

          <DmsPasswordStrength
            :color="color"
            :score="score"
            :strength="strength"
          />
        </div>

        <UButton
          :label="$t('button.continue')"
          :loading="isLoading"
          type="submit"
          block
        />
      </UForm>
    </DmsCard>
  </div>
</template>
