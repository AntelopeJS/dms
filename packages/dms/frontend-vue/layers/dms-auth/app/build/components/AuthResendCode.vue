<script setup lang="ts">
import { AUTH_LINK_CLASS } from "../utils/authStyles";

interface AuthResendCodeProps {
  /** Seconds left before another code can be requested. */
  cooldown: number;
  disabled?: boolean;
}

interface AuthResendCodeEmits {
  resend: [];
}

const props = withDefaults(defineProps<AuthResendCodeProps>(), {
  disabled: false,
});

const emit = defineEmits<AuthResendCodeEmits>();

const SECONDS_PER_MINUTE = 60;
const SECONDS_DIGITS = 2;

const countdown = computed(() => {
  const minutes = Math.floor(props.cooldown / SECONDS_PER_MINUTE);
  const seconds = String(props.cooldown % SECONDS_PER_MINUTE).padStart(
    SECONDS_DIGITS,
    "0",
  );
  return `${minutes}:${seconds}`;
});
</script>

<template>
  <!-- v2 .au-alt: "Didn't get it?" with the countdown until a new code. -->
  <p class="text-muted mt-5 text-center text-[13px]" aria-live="polite">
    {{ $t("page.auth.code.not_received") }}
    <span v-if="props.cooldown > 0" class="text-dimmed">
      {{ $t("page.auth.code.resend_in") }}
      <span class="font-mono tabular-nums">{{ countdown }}</span>
    </span>
    <button
      v-else
      type="button"
      :class="AUTH_LINK_CLASS"
      :disabled="props.disabled"
      @click="emit('resend')"
    >
      {{ $t("page.auth.code.resend") }}
    </button>
  </p>
</template>
