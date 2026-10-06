<script setup lang="ts">
import { getCurrentInstance, h, render } from "vue";
import { useFormField } from "@nuxt/ui/composables/useFormField";
import UIcon from "@nuxt/ui/runtime/vue/components/Icon.vue";
import { useControlError } from "../../../build/composables/form/useControlError";
import type {
  CodeEditor,
  CodeEditorCompletion,
  CodeEditorPosition,
} from "../../../build/utils/codeEditor";

interface InputCodeProps {
  id?: string;
  language: string;
  lineNumbers?: boolean;
  minLines?: number;
  maxLines?: number;
  completionsUrl?: string;
  completions?: CodeEditorCompletion[];
  placeholder?: string;
  disabled?: boolean;
}

interface CompletionsResponse {
  items?: CodeEditorCompletion[];
}

const props = withDefaults(defineProps<InputCodeProps>(), {
  lineNumbers: true,
  minLines: 6,
  maxLines: 20,
  completionsUrl: undefined,
  completions: undefined,
  placeholder: undefined,
  id: undefined,
});
const model = defineModel<string | null | undefined>();
const { t } = useI18n();
const { $authFetch } = useAuthFetch();
const { report } = useControlError();
// The field state UFormField hands its control: the error border and aria
// attributes go on the editor, an edit re-validates the field.
const { color, ariaAttrs, emitFormInput, emitFormBlur } = useFormField();
const isInvalid = computed(() => color.value === "error");

const LINE_HEIGHT_PX = 19;
const INVALID_JSON = "$dms.field_errors.invalid_json";
const LANGUAGE_LABELS: Record<string, string> = {
  json: "JSON",
  sql: "SQL",
  html: "HTML",
  javascript: "JavaScript",
  text: "Text",
};

const host = useTemplateRef<HTMLElement>("host");
const position = ref<CodeEditorPosition>({ line: 1, column: 1 });
const isReady = ref(false);
let editor: CodeEditor | null = null;
const appContext = getCurrentInstance()?.appContext ?? null;

const sizeStyle = computed(() => ({
  "--dms-code-min-height": `${props.minLines * LINE_HEIGHT_PX + 16}px`,
  "--dms-code-max-height": `${props.maxLines * LINE_HEIGHT_PX + 16}px`,
}));

const contentAttributes = computed<Record<string, string>>(() => {
  const attributes: Record<string, string> = {};
  if (props.id) attributes.id = props.id;
  const aria = ariaAttrs.value ?? {};
  if (aria["aria-invalid"]) attributes["aria-invalid"] = "true";
  if (aria["aria-describedby"]) {
    attributes["aria-describedby"] = String(aria["aria-describedby"]);
  }
  return attributes;
});

/** JSON that does not parse says so under the field, and blocks the submit. */
function checkSyntax(text: string): void {
  if (props.language !== "json") return;
  try {
    if (text.trim()) JSON.parse(text);
    report(undefined);
  } catch {
    report(INVALID_JSON);
  }
}

async function loadCompletions(): Promise<CodeEditorCompletion[]> {
  const fixed = props.completions ?? [];
  if (!props.completionsUrl) return fixed;
  const response = await $authFetch<
    CodeEditorCompletion[] | CompletionsResponse
  >(props.completionsUrl).catch(() => []);
  const fetched = Array.isArray(response) ? response : (response.items ?? []);
  return [...fixed, ...fetched];
}

function renderIcon(icon: string): HTMLElement {
  const element = document.createElement("span");
  element.className = "inline-flex shrink-0 text-dimmed";
  const vnode = h(UIcon, { name: icon, class: "size-4" });
  vnode.appContext = appContext;
  render(vnode, element);
  return element;
}

function onChange(text: string): void {
  model.value = text;
  checkSyntax(text);
  emitFormInput();
}

onMounted(async () => {
  const { createCodeEditor } = await import("../../../build/utils/codeEditor");
  if (!host.value) return;
  editor = createCodeEditor({
    parent: host.value,
    value: model.value ?? "",
    language: props.language,
    lineNumbers: props.lineNumbers,
    placeholder: props.placeholder,
    readOnly: props.disabled,
    contentAttributes: contentAttributes.value,
    completions:
      props.completions?.length || props.completionsUrl
        ? loadCompletions
        : undefined,
    renderIcon,
    completionFooter: t("dms.form.code.completion_footer"),
    onChange,
    onPosition: (next) => (position.value = next),
  });
  isReady.value = true;
});

watch(model, (value) => editor?.setValue(value ?? ""));
watch(
  () => props.disabled,
  (disabled) => editor?.setReadOnly(!!disabled),
);
watch(contentAttributes, (attributes) =>
  editor?.setContentAttributes(attributes),
);
onBeforeUnmount(() => editor?.destroy());
</script>

<template>
  <div
    class="border-accented overflow-hidden rounded-md border focus-within:ring-2"
    :class="
      isInvalid
        ? 'border-error focus-within:ring-error/25'
        : 'focus-within:border-primary focus-within:ring-primary/25'
    "
    :style="sizeStyle"
    @focusout="emitFormBlur"
  >
    <!-- Until the editor loads (and on the server), the code shows as is,
      at the editor's size: nothing moves when it takes over. -->
    <pre
      v-if="!isReady"
      class="text-highlighted min-h-(--dms-code-min-height) overflow-auto px-3 py-2 font-mono text-[12.5px] whitespace-pre-wrap"
      >{{ model }}</pre
    >
    <div
      ref="host"
      class="[&_.cm-content]:min-h-(--dms-code-min-height) [&_.cm-scroller]:max-h-(--dms-code-max-height) [&_.cm-scroller]:overflow-auto"
    />
    <div
      class="border-default text-dimmed flex items-center gap-3 border-t bg-(--dms-bg-muted) px-3 py-1 font-mono text-[11px]"
    >
      <span
        v-if="isReady && (props.completions?.length || props.completionsUrl)"
      >
        <UKbd value="ctrl" size="sm" />
        <UKbd value="Space" size="sm" />
        {{ t("dms.form.code.complete") }}
      </span>
      <span class="ms-auto">
        {{ LANGUAGE_LABELS[props.language] ?? props.language }} ·
        {{ t("dms.form.code.position", position) }}
      </span>
    </div>
  </div>
</template>
