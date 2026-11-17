import { createApp, defineComponent, useModel, type ModelRef } from "vue";

/** A `v-model` ref as a component holds it, which `useModel` makes. Needs a DOM. */
export function modelRef<T>(initial: T): ModelRef<T> {
  let model: ModelRef<T> | undefined;
  createApp(
    defineComponent(
      (props: { modelValue: T }) => {
        model = useModel(props, "modelValue");
        return () => null;
      },
      { props: ["modelValue"] },
    ),
    { modelValue: initial },
  ).mount(document.createElement("div"));
  if (!model) throw new Error("useModel did not run");
  return model;
}
