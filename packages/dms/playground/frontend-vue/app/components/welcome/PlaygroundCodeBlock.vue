<script setup lang="ts">
import { computed } from "vue";

/**
 * A read-only code sample with a file bar and a copy button, lightly
 * highlighted. The backend passes the code through `.options()`, so the
 * sample sits next to the page class that shows it.
 */

type CodeLanguage = "typescript" | "shell";
type TokenKind =
  | "plain"
  | "comment"
  | "string"
  | "keyword"
  | "decorator"
  | "command";

interface Props {
  /** The code, verbatim. */
  code: string;
  /** Shown in the bar above the code (a path, or "Terminal"). */
  filename?: string;
  language?: CodeLanguage;
}

interface CodeToken {
  text: string;
  kind: TokenKind;
}

const props = withDefaults(defineProps<Props>(), {
  filename: undefined,
  language: "typescript",
});

// One alternation per language; each named group is the token kind it marks.
const TOKEN_PATTERNS: Record<CodeLanguage, RegExp> = {
  typescript:
    /(?<comment>\/\/.*)|(?<string>"(?:[^"\\]|\\.)*")|(?<decorator>@\w+)|(?<keyword>\b(?:import|from|export|class|extends|static|const|true|false)\b)/g,
  shell:
    /(?<comment>#.*)|(?<string>"(?:[^"\\]|\\.)*")|(?<command>^(?:git|cd|pnpm)\b)/gm,
};

const TOKEN_CLASSES: Record<TokenKind, string> = {
  plain: "",
  comment: "text-dimmed italic",
  string: "text-success",
  keyword: "text-primary",
  decorator: "text-warning",
  command: "text-primary font-semibold",
};

const LANGUAGE_ICONS: Record<CodeLanguage, string> = {
  typescript: "i-ph-file-ts",
  shell: "i-ph-terminal-window",
};

function tokenKind(groups: Record<string, string | undefined>): TokenKind {
  const kind = Object.keys(groups).find((name) => groups[name] !== undefined);
  return (kind as TokenKind | undefined) ?? "plain";
}

function tokenize(code: string, pattern: RegExp): CodeToken[] {
  const tokens: CodeToken[] = [];
  let cursor = 0;
  for (const match of code.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor)
      tokens.push({ text: code.slice(cursor, start), kind: "plain" });
    tokens.push({ text: match[0], kind: tokenKind(match.groups ?? {}) });
    cursor = start + match[0].length;
  }
  if (cursor < code.length)
    tokens.push({ text: code.slice(cursor), kind: "plain" });
  return tokens;
}

const tokens = computed(() =>
  tokenize(props.code, TOKEN_PATTERNS[props.language]),
);
</script>

<template>
  <div class="min-w-0">
    <div
      class="border-default bg-muted/50 flex items-center gap-2 border-b py-1.5 ps-4 pe-2"
    >
      <UIcon
        :name="LANGUAGE_ICONS[props.language]"
        class="text-muted size-4"
        aria-hidden="true"
      />
      <span class="text-muted min-w-0 flex-1 truncate font-mono text-xs">
        {{ props.filename }}
      </span>
      <DmsCopyButton :value="props.code" />
    </div>
    <pre
      class="text-default overflow-x-auto px-4 py-3.5 font-mono text-[12.5px] leading-[1.65]"
      tabindex="0"
    ><code><span
      v-for="(token, index) in tokens"
      :key="index"
      :class="TOKEN_CLASSES[token.kind]"
    >{{ token.text }}</span></code></pre>
  </div>
</template>
