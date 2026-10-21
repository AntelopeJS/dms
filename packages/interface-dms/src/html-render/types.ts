export interface HtmlTemplateInfo {
  name: string;
}

export interface HtmlTemplateRef<TProps = unknown> {
  name: string;
  _propsType?: TProps;
}

export interface HtmlRenderConfig {
  serviceSecret: string;
  /**
   * Lifetime of each render-service token, in milliseconds. The frontend
   * render server rejects tokens valid for more than five minutes.
   */
  serviceTokenLifetime: number;
  renderEndpoint: string;
}

/**
 * The application's texts in one language, merged from every frontend module
 * as its pages and emails read them, with English as the fallback.
 */
export interface LocaleMessages {
  /** The language's catalog (English for a language the application lacks). */
  messages: Record<string, unknown>;
  /** The English catalog a missing text falls back to. */
  fallback: Record<string, unknown>;
}
