import type { useForm } from "../../layers/dms-ui/app/composables/form/useForm";

export function formSubmitEvent(
  data: Parameters<ReturnType<typeof useForm>["onSubmit"]>[0]["data"],
) {
  return Object.assign(new Event("submit"), { submitter: null, data });
}
