import { ComponentBuilder } from "../component";

export function CustomComponent(componentName: string): ComponentBuilder {
  return new ComponentBuilder(componentName);
}
