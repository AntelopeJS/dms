export interface HtmlTemplateInfo {
  name: string;
}

export interface HtmlTemplateRef<TProps = unknown> {
  name: string;
  _propsType?: TProps;
}

export interface HtmlRenderConfig {
  serviceSecret: string;
  serviceTokenLifetime: number;
  renderEndpoint: string;
}
