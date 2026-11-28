import type { Ref, ShallowRef } from "vue";
import type { MockupState } from "../../utils/mockup";
import { useMockupSpec, type MockupSpecNotice } from "./useMockupSpec";
import { useMockupVersions } from "./useMockupVersions";

interface DocumentOptions {
  name: string;
  /** The compiled state the stream last sent. */
  state: Readonly<ShallowRef<MockupState | undefined>>;
  /** Called with each notice of the spec, before its toast: the viewer settles what it was doing. */
  onNotice: () => void;
  /** This browser session's viewer id: see {@link MockupSpecEditor}. */
  viewer: string;
  /** The id of the block this session holds the lock of, while it holds one. */
  held: Readonly<Ref<string | undefined>>;
  /** Whether the viewer edits the spec: a reviewer does not, and the editor then reads nothing. */
  enabled: boolean;
}

/**
 * The mockup's spec as the viewer edits it, with its undo history, and the
 * version history beside it. Each notice of the spec, a spec adopted, one
 * refused or a failed write, and each restore, shows as a toast, except a
 * spec adopted that another viewer of the editor wrote, which is no surprise.
 */
export function useMockupDocument(options: DocumentOptions) {
  const { t } = useI18n();
  const toast = useToast();
  const presenter = useApiErrorPresenter();
  const { $authFetch } = useAuthFetch();

  function notify(notice: MockupSpecNotice): void {
    options.onNotice();
    if (notice.kind === "adopted") {
      if (notice.by === undefined) {
        toast.add({ color: "info", title: t("dms.mockup.adopted") });
      }
    } else if (notice.kind === "refused") {
      const issue = `${notice.issue.path}: ${notice.issue.message}`;
      toast.add({
        color: "warning",
        title: t("dms.mockup.refused"),
        description: notice.discarded
          ? `${issue} ${t("dms.mockup.refused_discarded")}`
          : issue,
      });
    } else {
      presenter.presentError(notice.error, {
        fallbackKey: "dms.mockup.save_failed",
      });
    }
  }

  const editor = useMockupSpec({
    name: options.name,
    authFetch: $authFetch,
    state: options.state,
    onNotice: notify,
    viewer: options.viewer,
    held: options.held,
    enabled: options.enabled,
  });
  const history = useMockupVersions({
    name: options.name,
    authFetch: $authFetch,
    live: options.state,
    onRestored: (seq) =>
      toast.add({
        color: "success",
        title: t("dms.mockup.history_restored", { number: seq }),
      }),
    onRestoreFailed: (failure) => {
      if ("error" in failure) {
        presenter.presentError(failure.error, {
          fallbackKey: "dms.mockup.save_failed",
        });
        return;
      }
      toast.add({
        color: "warning",
        title: t("dms.mockup.history_restore_refused"),
        description: failure.message,
      });
    },
  });
  return { editor, history };
}
