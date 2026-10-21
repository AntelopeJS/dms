import {
  InterfaceFunction,
  RegisteringProxy,
} from "@antelopejs/interface-core";
import type {
  HtmlTemplateInfo,
  HtmlTemplateRef,
  LocaleMessages,
} from "./types";

export * from "./types";

/**
 * @internal
 */
export namespace internal {
  export const RegisterHtmlTemplate = new RegisteringProxy<
    (info: HtmlTemplateInfo) => void
  >();
}

/**
 * Renders a template to HTML by calling the frontend render endpoint.
 * @throws Error if the render endpoint is unreachable or returns an error
 */
export const GenerateHtml =
  InterfaceFunction<
    <TProps = unknown>(
      template: HtmlTemplateRef<TProps>,
      props: TProps,
      language?: string,
    ) => Promise<string>
  >();

/**
 * The application's texts in `language` (`fr`, `fr-BE`), read from the
 * frontend that renders the pages: for text the backend writes outside a page
 * (an export, a document) in its reader's language.
 * @throws Error if the frontend is unreachable or refuses the request
 */
export const GetLocaleMessages =
  InterfaceFunction<(language: string) => Promise<LocaleMessages>>();

/** Returns template info by name, or undefined if not registered. */
export const GetHtmlTemplate =
  InterfaceFunction<(key: string) => HtmlTemplateInfo | undefined>();

/** Returns all registered templates as a Record<name, info>. */
export const GetAllHtmlTemplates =
  InterfaceFunction<() => Record<string, HtmlTemplateInfo>>();

/**
 * Registers an HTML template and returns a typed reference for use with GenerateHtml.
 * @example
 * const WelcomeEmail = RegisterHtmlTemplate<{ userName: string }>("welcome-email");
 * const html = await GenerateHtml(WelcomeEmail, { userName: "John" });
 */
export function RegisterHtmlTemplate<TProps = unknown>(
  name: string,
): HtmlTemplateRef<TProps> {
  internal.RegisterHtmlTemplate.register({
    name,
  });

  return { name };
}
