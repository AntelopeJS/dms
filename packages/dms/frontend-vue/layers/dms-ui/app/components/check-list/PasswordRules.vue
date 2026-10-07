<script setup lang="ts">
import { computed, toRef } from "vue";
import DmsCheckList, { type CheckListItem } from "./CheckList.vue";

export type PasswordRulesVariant = "meter" | "summary";

interface PasswordRulesProps {
  /** The password being typed; the rules are evaluated live against it. */
  password?: string;
  /**
   * `meter` (sign-up, recovery, onboarding): four accent bars over a rule
   * list that stays neutral until something is typed. `summary` (settings):
   * one box with "n of m met", a verdict, colored bars and a compact grid.
   */
  variant?: PasswordRulesVariant;
  /** Id of the rule list, for the input's `aria-describedby`. */
  listId?: string;
}

interface PasswordRulesSlots {
  /** `summary` head text; defaults to "{met} of {total} met". */
  head?: (props: { met: number; total: number }) => unknown;
}

const props = withDefaults(defineProps<PasswordRulesProps>(), {
  password: "",
  variant: "meter",
  listId: undefined,
});
defineSlots<PasswordRulesSlots>();

const METER_BAR_COUNT = 4;
const METER_BARS = Array.from({ length: METER_BAR_COUNT }, (_, i) => i);

/** Verdict per number of rules met, index = score. */
const VERDICT_KEYS = [
  "dms.password_rules.verdict.weak",
  "dms.password_rules.verdict.weak",
  "dms.password_rules.verdict.fair",
  "dms.password_rules.verdict.fair",
  "dms.password_rules.verdict.almost",
  "dms.password_rules.verdict.strong",
];

const TONE_TEXT: Record<string, string> = {
  error: "text-error",
  warning: "text-warning",
  success: "text-success",
};

const TONE_BAR: Record<string, string> = {
  error: "bg-error",
  warning: "bg-warning",
  success: "bg-success",
};

const password = toRef(props, "password");
const { strength, score, color } = usePasswordStrength(password);

const isPristine = computed(() => !props.password);
const isSummary = computed(() => props.variant === "summary");
const total = computed(() => strength.value.length);

const items = computed<CheckListItem[]>(() =>
  strength.value.map((rule, index) => ({
    label: rule.text,
    // The summary lists unmet rules as "not yet", never as failures.
    state: rule.met ? "ok" : isSummary.value ? "pending" : "error",
    wide: isSummary.value && index === strength.value.length - 1,
  })),
);

const litMeterBars = computed(() =>
  total.value ? Math.round((score.value * METER_BAR_COUNT) / total.value) : 0,
);

const verdictKey = computed(
  () => VERDICT_KEYS[score.value] ?? VERDICT_KEYS[0]!,
);
</script>

<template>
  <!-- v2 .pw: the sign-up rules, live as the new password is typed. -->
  <DmsCheckList
    v-if="isSummary"
    :id="props.listId"
    :items="items"
    marker="plain"
    size="sm"
    :columns="3"
    framed
    live
  >
    <template #header>
      <div class="text-muted flex items-center text-xs">
        <slot name="head" :met="score" :total="total">
          {{ $t("dms.password_rules.head", { met: score, total }) }}
        </slot>
        <b
          class="ms-auto font-mono text-[11px] font-semibold tracking-[0.06em] uppercase"
          :class="TONE_TEXT[color]"
        >
          {{ $t(verdictKey) }}
        </b>
      </div>
      <div
        class="grid gap-1"
        :style="{ gridTemplateColumns: `repeat(${total}, 1fr)` }"
        aria-hidden="true"
      >
        <span
          v-for="(rule, index) in strength"
          :key="rule.text"
          class="h-1 rounded-full"
          :class="index < score ? TONE_BAR[color] : 'bg-accented'"
        />
      </div>
    </template>
  </DmsCheckList>

  <div v-else class="grid gap-2">
    <!-- v2 .au-strength: four 4px bars filling with the rules met. -->
    <div class="grid grid-cols-4 gap-1" aria-hidden="true">
      <span
        v-for="bar in METER_BARS"
        :key="bar"
        class="h-1 rounded-full transition-colors"
        :class="bar < litMeterBars ? 'bg-(--dms-accent-fill)' : 'bg-accented'"
      />
    </div>
    <!-- v2 .ob-rules: the checklist is the error message. -->
    <DmsCheckList
      :id="props.listId"
      :items="items"
      :pristine="isPristine"
      framed
      live
    />
  </div>
</template>
