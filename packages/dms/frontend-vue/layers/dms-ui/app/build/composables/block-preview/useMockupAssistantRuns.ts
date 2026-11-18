import { onBeforeUnmount, onMounted, shallowRef } from "vue";
import {
  isBoolean,
  isObject,
  isString,
} from "../../../../../dms-core/app/utils/type-check";
import {
  MOCKUP_ASSISTANT_RUN_EVENT,
  MOCKUP_ASSISTANT_RUN_QUERY_EVENT,
  type MockupAssistantRun,
  type MockupAssistantRunSource,
} from "../../../utils/mockupAssistant";

const RUN_SOURCES: ReadonlySet<string> = new Set<MockupAssistantRunSource>([
  "build",
  "resolve-comments",
]);

function isRunSource(
  value: Parameters<typeof isString>[0],
): value is MockupAssistantRunSource {
  return isString(value) && RUN_SOURCES.has(value);
}

/** The run a `dms:assistant-run` event reports, or undefined when its detail is not one. */
export function parseAssistantRun(
  detail: Parameters<typeof isObject>[0],
): MockupAssistantRun | undefined {
  if (!isObject(detail) || detail === null) return undefined;
  const { mockup, source, running } = detail;
  return isString(mockup) && isRunSource(source) && isBoolean(running)
    ? { mockup, source, running }
    : undefined;
}

/** The assistant's runs for one mockup, as the editor follows them. */
export interface MockupAssistantRuns {
  /** Whether a run of `source` goes on for the mockup now. */
  isRunning: (source: MockupAssistantRunSource) => boolean;
}

/**
 * Follows the assistant's runs for the mockup `mockup`, its folder name: each
 * `dms:assistant-run` about it starts or ends a run of its source. Once
 * mounted, it asks the assistant for the runs going on with
 * `dms:assistant-run-query`. Without an assistant no event comes, and no run
 * goes on.
 */
export function useMockupAssistantRuns(mockup: string): MockupAssistantRuns {
  const running = shallowRef<ReadonlySet<MockupAssistantRunSource>>(new Set());

  function onRun(event: Event): void {
    if (!(event instanceof CustomEvent)) return;
    const run = parseAssistantRun(event.detail);
    if (!run || run.mockup !== mockup) return;
    const next = new Set(running.value);
    if (run.running) next.add(run.source);
    else next.delete(run.source);
    running.value = next;
  }

  onMounted(() => {
    window.addEventListener(MOCKUP_ASSISTANT_RUN_EVENT, onRun);
    window.dispatchEvent(new CustomEvent(MOCKUP_ASSISTANT_RUN_QUERY_EVENT));
  });
  onBeforeUnmount(() =>
    window.removeEventListener(MOCKUP_ASSISTANT_RUN_EVENT, onRun),
  );

  return { isRunning: (source) => running.value.has(source) };
}
