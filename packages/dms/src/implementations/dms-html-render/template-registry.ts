import type { HtmlTemplateInfo } from "@antelopejs/interface-dms/html-render";

const templateRegistry = new Map<string, HtmlTemplateInfo>();

export namespace internal {
  export const RegisterHtmlTemplate = {
    register: (info: HtmlTemplateInfo): void => {
      templateRegistry.set(info.name, info);
    },
    unregister: (info: HtmlTemplateInfo): void => {
      templateRegistry.delete(info.name);
    },
  };
}

export function GetHtmlTemplate(key: string): HtmlTemplateInfo | undefined {
  return templateRegistry.get(key);
}

export function GetAllHtmlTemplates(): Record<string, HtmlTemplateInfo> {
  const result: Record<string, HtmlTemplateInfo> = {};
  for (const [key, info] of templateRegistry) {
    result[key] = info;
  }
  return result;
}
