import {
  MOCKUP_ASSISTANT_PROMPT_EVENT,
  type MockupAssistantPrompt,
} from "../../utils/mockupAssistant";

/**
 * Hands `detail` to the DMS assistant through a cancelable
 * {@link MOCKUP_ASSISTANT_PROMPT_EVENT} on `window`: true when a listener
 * claimed it with `preventDefault()`, false when nobody did and the editor
 * must show the request for the developer to copy.
 */
export function dispatchMockupAssistantPrompt(
  detail: MockupAssistantPrompt,
): boolean {
  const event = new CustomEvent(MOCKUP_ASSISTANT_PROMPT_EVENT, {
    detail,
    cancelable: true,
  });
  return !window.dispatchEvent(event);
}
