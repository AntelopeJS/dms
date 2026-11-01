/** The languages of the workspace, the base one first. */
export const LANGUAGES = ["en", "fr", "nl", "de"] as const;
export type Language = (typeof LANGUAGES)[number];
export const BASE_LANGUAGE: Language = "en";

export interface LanguageInfo {
  label: string;
  locale: string;
}

export const LANGUAGE_INFO: Record<Language, LanguageInfo> = {
  en: { label: "English", locale: "en-GB" },
  fr: { label: "French", locale: "fr-BE" },
  nl: { label: "Dutch", locale: "nl-BE" },
  de: { label: "German", locale: "de-DE" },
};
