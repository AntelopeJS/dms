import type { Component } from "vue";

interface EmailModule {
  default: Component;
}

/** The playground's email templates, rendered by `GenerateHtml`. */
export const serverEmailTemplates = import.meta.glob<EmailModule>(
  "./app/emails/**/*.vue",
);
