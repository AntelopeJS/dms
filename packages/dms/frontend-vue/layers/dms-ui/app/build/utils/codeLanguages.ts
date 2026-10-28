/** The language a snippet is shown as written in. */
export const PLAIN_CODE_LANGUAGE = "text";

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  bash: "shell",
  sh: "shell",
  plain: PLAIN_CODE_LANGUAGE,
};

const CODE_LANGUAGE_LABELS: Record<string, string> = {
  json: "JSON",
  sql: "SQL",
  html: "HTML",
  javascript: "JavaScript",
  typescript: "TypeScript",
  shell: "Shell",
  text: "Text",
};

/** The language an alias (`bash`, `ts`, `plain`) stands for; `text` when unset. */
export function resolveCodeLanguage(language: string | undefined): string {
  const name = language?.trim().toLowerCase() || PLAIN_CODE_LANGUAGE;
  return LANGUAGE_ALIASES[name] ?? name;
}

/** The label of a language; an unknown one is shown as written. */
export function codeLanguageLabel(language: string): string {
  return CODE_LANGUAGE_LABELS[language] ?? language;
}
