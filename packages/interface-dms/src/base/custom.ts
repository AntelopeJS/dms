import { ComponentBuilder } from "../component";

/**
 * A builder for the frontend component registered under `componentName`.
 *
 * @docsApi
 */
export function CustomComponent(componentName: string): ComponentBuilder {
  return new ComponentBuilder(componentName);
}
