import type { Component } from "vue";
import defaults from "./layers/dms-layout/app/app.config";

/** Branding shared with transactional templates, without the browser module. */
export const appConfig = { branding: defaults.branding };

interface EmailModule {
  default: Component;
}

export const serverEmailTemplates = import.meta.glob<EmailModule>(
  "./layers/**/app/emails/**/*.vue",
);
