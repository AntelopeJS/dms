import { ref, watch, type ComputedRef, type Ref } from "vue";
import {
  nodeTextAt,
  specPointerFor,
  type MockupPageState,
} from "../../utils/mockup";
import type { MockupSession } from "./useMockupSession";

/** The block a note is being written on, and what it was when picked. */
interface PendingNote {
  page: string;
  path: string;
  layoutPath: string;
  nodeText: string | undefined;
}

/** Why a pick opened no note box, or why its box was closed. */
export type MockupCommentNotice = "not_in_spec" | "target_changed";

/** Comment mode: the note being written, and why a pick opened none. */
export interface MockupComments {
  pending: Ref<PendingNote | undefined>;
  note: Ref<string>;
  notice: Ref<MockupCommentNotice | undefined>;
  open: (layoutPath: string) => void;
  save: () => Promise<void>;
  close: () => void;
}

/**
 * Leaves notes on the spec nodes a click picks in the preview. A note box
 * whose block changed in the spec before the note was saved is closed, so a
 * note never lands on another node than the one picked.
 */
export function useMockupComments(options: {
  session: MockupSession;
  page: ComputedRef<MockupPageState | undefined>;
  pages: ComputedRef<MockupPageState[]>;
}): MockupComments {
  const pending = ref<PendingNote>();
  const note = ref("");
  const notice = ref<MockupCommentNotice>();

  function open(layoutPath: string): void {
    const page = options.page.value;
    if (!page) return;
    const path = specPointerFor(page, layoutPath);
    notice.value = path === undefined ? "not_in_spec" : undefined;
    if (path === undefined) return;
    note.value = "";
    pending.value = {
      page: page.id,
      path,
      layoutPath,
      nodeText: nodeTextAt(page, layoutPath),
    };
  }

  watch(options.session.state, () => {
    const target = pending.value;
    if (!target) return;
    const page = options.pages.value.find((entry) => entry.id === target.page);
    const isSameNode =
      !!page &&
      specPointerFor(page, target.layoutPath) === target.path &&
      nodeTextAt(page, target.layoutPath) === target.nodeText;
    if (isSameNode) return;
    pending.value = undefined;
    notice.value = "target_changed";
  });

  async function save(): Promise<void> {
    const target = pending.value;
    const text = note.value.trim();
    if (!target || !text) return;
    await options.session.addAnnotation({
      page: target.page,
      path: target.path,
      text,
    });
    if (!options.session.hasRequestFailed.value) pending.value = undefined;
  }

  return {
    pending,
    note,
    notice,
    open,
    save,
    close: () => {
      pending.value = undefined;
      notice.value = undefined;
    },
  };
}
