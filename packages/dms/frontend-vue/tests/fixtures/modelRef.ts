import { createApp, defineComponent, useModel, type ModelRef } from "vue";

/** A `v-model` ref as a component holds it, which `useModel` makes. Needs a DOM. */
export function modelRef<T>(initial: T): ModelRef<T> {
  let model: ModelRef<T> | undefined;
  createApp(
    defineComponent({
      props: { modelValue: { type: null, default: undefined } },
      setup: (props) => {
        model = useModel<string, { modelValue: T }, "modelValue">(
          props,
          "modelValue",
        );
        return () => null;
      },
    }),
    { modelValue: initial },
  ).mount(document.createElement("div"));
  if (!model) throw new Error("useModel did not run");
  return model;
}
