<script setup lang="ts">
import type { ChainedCommands } from "@tiptap/core";
import { useEditor, EditorContent, type AnyExtension } from "@tiptap/vue-3";
import TiptapStarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { useFormField } from "@nuxt/ui/composables/useFormField";
import { FIELD_SURFACE_INVALID_CLASS } from "../../../utils/fieldTrigger";

interface RichTextProps {
  /** Id of the editable area, the control a field label points to. */
  id?: string;
}

const props = defineProps<RichTextProps>();

const { t } = useI18n();

// The field state UFormField hands its control: the error border goes on the
// editor frame, the aria attributes on the editable area, and typing or
// leaving it re-validates the field like a text input.
const { color, ariaAttrs, emitFormBlur, emitFormInput } = useFormField(props);
const invalid = computed(() => color.value === "error");

const modelValue = defineModel<string>({ default: "<p></p>" });

const editor = useEditor({
  extensions: [
    TiptapStarterKit.configure({
      link: {
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline cursor-pointer",
        },
      },
    }) as AnyExtension,
    TextAlign.configure({
      types: ["heading", "paragraph"],
    }),
  ],
  editorProps: {
    attributes: {
      ...(props.id ? { id: props.id } : {}),
      class:
        "min-h-[140px] px-3 py-2.5 text-[13px] focus:outline-none prose prose-neutral dark:prose-invert max-w-none [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:mb-4 [&_h1]:mt-6 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4 [&_p]:leading-relaxed [&_a]:text-primary [&_a]:underline [&_a]:cursor-pointer [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:mb-3 [&_ol]:list-decimal [&_ol]:ml-6 [&_ol]:mb-3 [&_li]:mb-1 [&_blockquote]:border-l-4 [&_blockquote]:border-default [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted [&_blockquote]:my-4 [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_pre]:my-4 [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-sm [&_hr]:my-4 [&_hr]:border-default",
    },
  },
  content: modelValue.value,
  onUpdate: ({ editor }) => {
    modelValue.value = editor.getHTML();
    emitFormInput();
  },
  onBlur: () => emitFormBlur(),
});

watch(
  [() => unref(editor), ariaAttrs],
  ([instance, attrs]) => {
    const dom = instance?.view.dom;
    if (!dom) return;
    dom.removeAttribute("aria-describedby");
    for (const [name, value] of Object.entries(attrs ?? {})) {
      dom.setAttribute(name, String(value));
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  unref(editor)?.destroy();
});

watch(
  modelValue,
  (newValue) => {
    const editorInstance = unref(editor);
    if (!editorInstance) {
      return;
    }
    const currentContent = editorInstance.getHTML();
    if (currentContent === newValue) {
      return;
    }
    editorInstance.commands.setContent(newValue || "<p></p>");
  },
  { flush: "sync" },
);

interface CharacterCountStorage {
  characterCount?: { characters: () => number };
}

// Read in the script: a type cast written in the template is read as a tag
// by the template formatter.
const characterCount = computed(
  () =>
    (
      editor.value?.storage as CharacterCountStorage | undefined
    )?.characterCount?.characters() || editor.value?.getText().length,
);

const chain = (): ChainedCommands | undefined => editor.value?.chain().focus();

const linkUrl = ref("");
const showLinkInput = ref(false);

function handleLink() {
  const previousUrl = unref(editor)?.getAttributes("link").href;
  if (unref(editor)?.state.selection.empty) {
    return;
  }

  linkUrl.value = previousUrl || "";
  showLinkInput.value = true;
}

function insertLink() {
  if (linkUrl.value) {
    unref(editor)
      ?.chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: linkUrl.value })
      .run();
    linkUrl.value = "";
    showLinkInput.value = false;
  }
}

const toolbarButtons = computed(() => [
  [
    {
      icon: "i-lucide-undo-2",
      label: t("dms.form.richtext.toolbar.undo"),
      action: () => chain()?.undo().run(),
      isActive: false,
    },
    {
      icon: "i-lucide-redo-2",
      label: t("dms.form.richtext.toolbar.redo"),
      action: () => chain()?.redo().run(),
      isActive: false,
    },
  ],
  [
    {
      icon: "i-lucide-heading",
      label: t("dms.form.richtext.toolbar.heading_1"),
      action: () => chain()?.toggleHeading({ level: 1 }).run(),
      isActive: editor.value?.isActive("heading", { level: 1 }),
    },
    {
      icon: "i-lucide-heading-2",
      label: t("dms.form.richtext.toolbar.heading_2"),
      action: () => chain()?.toggleHeading({ level: 2 }).run(),
      isActive: editor.value?.isActive("heading", { level: 2 }),
    },
    {
      icon: "i-lucide-heading-3",
      label: t("dms.form.richtext.toolbar.heading_3"),
      action: () => chain()?.toggleHeading({ level: 3 }).run(),
      isActive: editor.value?.isActive("heading", { level: 3 }),
    },
  ],
  [
    {
      icon: "i-lucide-align-left",
      label: t("dms.form.richtext.toolbar.align_left"),
      action: () => chain()?.setTextAlign("left").run(),
      isActive: editor.value?.isActive({ textAlign: "left" }),
    },
    {
      icon: "i-lucide-align-center",
      label: t("dms.form.richtext.toolbar.align_center"),
      action: () => chain()?.setTextAlign("center").run(),
      isActive: editor.value?.isActive({ textAlign: "center" }),
    },
    {
      icon: "i-lucide-align-right",
      label: t("dms.form.richtext.toolbar.align_right"),
      action: () => chain()?.setTextAlign("right").run(),
      isActive: editor.value?.isActive({ textAlign: "right" }),
    },
    {
      icon: "i-lucide-align-justify",
      label: t("dms.form.richtext.toolbar.align_justify"),
      action: () => chain()?.setTextAlign("justify").run(),
      isActive: editor.value?.isActive({ textAlign: "justify" }),
    },
  ],
  [
    {
      icon: "i-lucide-bold",
      label: t("dms.form.richtext.toolbar.bold"),
      action: () => chain()?.toggleBold().run(),
      isActive: editor.value?.isActive("bold"),
    },
    {
      icon: "i-lucide-italic",
      label: t("dms.form.richtext.toolbar.italic"),
      action: () => chain()?.toggleItalic().run(),
      isActive: editor.value?.isActive("italic"),
    },
    {
      icon: "i-lucide-underline",
      label: t("dms.form.richtext.toolbar.underline"),
      action: () => chain()?.toggleUnderline().run(),
      isActive: editor.value?.isActive("underline"),
    },
    {
      icon: "i-lucide-link",
      label: t("dms.form.richtext.toolbar.link"),
      action: handleLink,
      isActive: editor.value?.isActive("link"),
    },
    {
      icon: "i-lucide-list",
      label: t("dms.form.richtext.toolbar.bullet_list"),
      action: () => chain()?.toggleBulletList().run(),
      isActive: editor.value?.isActive("bulletList"),
    },
    {
      icon: "i-lucide-list-ordered",
      label: t("dms.form.richtext.toolbar.numbered_list"),
      action: () => chain()?.toggleOrderedList().run(),
      isActive: editor.value?.isActive("orderedList"),
    },
    {
      icon: "i-lucide-quote",
      label: t("dms.form.richtext.toolbar.quote"),
      action: () => chain()?.toggleBlockquote().run(),
      isActive: editor.value?.isActive("blockquote"),
    },
    {
      icon: "i-lucide-code",
      label: t("dms.form.richtext.toolbar.code_block"),
      action: () => chain()?.toggleCodeBlock().run(),
      isActive: editor.value?.isActive("codeBlock"),
    },
    {
      icon: "i-lucide-minus",
      label: t("dms.form.richtext.toolbar.horizontal_rule"),
      action: () => chain()?.setHorizontalRule().run(),
      isActive: false,
    },
  ],
]);
</script>

<template>
  <div class="w-full">
    <div
      class="overflow-hidden rounded-md border bg-(--dms-bg-field) shadow-(--shadow-xs) transition-colors focus-within:outline-3"
      :class="
        invalid
          ? FIELD_SURFACE_INVALID_CLASS
          : 'border-accented focus-within:border-primary outline-(--dms-accent-tint-strong)'
      "
    >
      <div
        class="border-default flex flex-wrap items-center gap-0.5 border-b bg-(--dms-bg-muted) p-1.5"
      >
        <template
          v-for="(group, groupIndex) in toolbarButtons"
          :key="`toolbar-group-${groupIndex}`"
        >
          <UButton
            v-for="(button, buttonIndex) in group"
            :key="`toolbar-button-${groupIndex}-${buttonIndex}`"
            :title="button.label"
            :icon="button.icon"
            variant="ghost"
            :class="{
              'bg-accented text-highlighted ring-accented ring ring-inset':
                button.isActive,
            }"
            color="neutral"
            size="sm"
            @click="button.action"
          />
          <div
            v-if="groupIndex < toolbarButtons.length - 1"
            class="bg-accented mx-1 h-5 w-px"
          />
        </template>
      </div>

      <div
        v-if="showLinkInput"
        class="border-default bg-muted flex items-center gap-2 border-b p-3"
      >
        <UInput
          v-model="linkUrl"
          :placeholder="t('dms.form.richtext.link.placeholder')"
          class="flex-1"
          autofocus
          @keydown.enter="insertLink"
          @keydown.escape="showLinkInput = false"
        />
        <UButton
          :label="t('dms.form.richtext.link.insert')"
          @click="insertLink"
        />
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('dms.form.richtext.link.cancel')"
          @click="showLinkInput = false"
        />
      </div>

      <DmsClientOnly>
        <EditorContent :editor="editor" />
        <!-- Exactly the editor's empty box (140px): the lines fit inside its
             padding, so the swap to the editor moves nothing below it. -->
        <template #fallback>
          <div class="min-h-[140px] px-3 py-2.5" aria-busy="true">
            <USkeleton class="mb-4 h-8 w-3/4 bg-(--dms-skeleton)" />
            <USkeleton class="mb-3 h-4 w-full bg-(--dms-skeleton)" />
            <USkeleton class="mb-3 h-4 w-5/6 bg-(--dms-skeleton)" />
            <USkeleton class="h-4 w-4/5 bg-(--dms-skeleton)" />
          </div>
        </template>
      </DmsClientOnly>
    </div>

    <div class="text-dimmed mt-1.5 text-right font-mono text-[11.5px]">
      <DmsClientOnly>
        {{ t("dms.form.richtext.character_count", { count: characterCount }) }}
        <template #fallback>
          <span>
            {{ t("dms.form.richtext.character_count", { count: 0 }) }}
          </span>
        </template>
      </DmsClientOnly>
    </div>
  </div>
</template>
