import {
  computed,
  defineComponent,
  effectScope,
  h,
  inject,
  nextTick,
  onMounted,
  onScopeDispose,
  onUnmounted,
  reactive,
  ref,
  shallowReactive,
  shallowRef,
  toValue,
  useTemplateRef,
  watch,
  watchEffect,
} from "vue";
import { vi } from "vitest";
import { engine } from "./api-data-runtime";
import { useMultiAccount } from "../../layers/dms-core/app/composables/auth/useMultiAccount";
import { getAppTranslation } from "../../layers/dms-core/app/composables/translation/useTranslation";

export const PinInput = defineComponent({
  props: { modelValue: Array },
  emits: ["update:modelValue", "complete"],
  setup:
    (_, { emit }) =>
    () =>
      h("input", {
        "data-testid": "code",
        onInput: (event: Event) => {
          // SAFETY: This handler is attached only to the input rendered immediately above.
          const digits = (event.target as HTMLInputElement).value.split("");
          emit("update:modelValue", digits);
          if (digits.length === 6) emit("complete");
        },
      }),
});

export function installAuthSettingsRuntime(): void {
  const app = {
    runWithContext: <Result>(callback: () => Result) => callback(),
    $i18n: { t: (key: string) => key },
  };
  for (const [name, value] of Object.entries({
    computed,
    ref,
    reactive,
    watch,
    watchEffect,
    onMounted,
    onUnmounted,
    onScopeDispose,
    nextTick,
    effectScope,
    inject,
    shallowReactive,
    shallowRef,
    useTemplateRef,
    toValue,
  }))
    vi.stubGlobal(name, value);
  for (const [name, value] of Object.entries({
    useDmsState: engine.useDmsState,
    useDmsApp: () => app,
    useDmsCookie: engine.useDmsCookie,
    isDmsHydrating: engine.isDmsHydrating,
    useDmsRoute: engine.useDmsRoute,
    useDmsRouter: engine.useDmsRouter,
    useDmsUserSession: engine.useDmsUserSession,
    useMultiAccount,
    getAppTranslation,
  }))
    vi.stubGlobal(name, value);
  vi.stubGlobal("useOverlay", () => ({
    create: () => ({ open: async () => true }),
  }));
  vi.stubGlobal("defineShortcuts", () => {});
}
