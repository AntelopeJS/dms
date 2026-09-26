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
