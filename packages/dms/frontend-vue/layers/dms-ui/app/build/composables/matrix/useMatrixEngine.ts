import type {
  MatrixChange,
  MatrixOptions,
  MatrixSaveRequest,
  MatrixSaveResponse,
} from "../../../types/matrix";
import { describeFieldErrors } from "#dms-core/app/composables/useFieldErrors";
import { HttpMethod } from "#dms-core/app/types/http";
import { resolveUrlVariables } from "../../utils/urlVariables";
import {
  createMatrixSaveEngine,
  type MatrixSaveEngine,
} from "./matrixSaveEngine";
import type { MatrixDataSource } from "./useMatrixData";

/** What the save engine of a grid needs of the block around it. */
export interface MatrixEngineSetup {
  options: MatrixOptions;
  routeParams: () => Record<string, string> | undefined;
  /** The list query the rows are read with, sent with each save. */
  listQuery: () => Record<string, string>;
  source: MatrixDataSource;
  /** A column's label by its id, to name the fields a route refused. */
  labelOf: (columnId: string) => string | undefined;
  /** A missed `blockSave` target holds every write. */
  isBlocked: () => boolean;
  onSaved: (changes: MatrixChange[]) => void;
}

/**
 * Posts a request to `saveUrl`, with the list query the rows are read with
 * (no paging), so the route can answer the `counts` of the filtered view.
 */
function useSaveRequest(setup: MatrixEngineSetup) {
  const { options } = setup;
  const conflicts = options.conflicts ?? "overwrite";
  const { $authFetch } = useAuthFetch();
  const route = useDmsRoute();
  return async (
    request: MatrixSaveRequest,
  ): Promise<MatrixSaveResponse | null> => {
    const url = resolveUrlVariables(options.saveUrl, {
      routeParams: setup.routeParams(),
      routeQuery: route.query,
    });
    if (!url) throw new Error("dms.matrix.save_unresolved");
    return $authFetch<MatrixSaveResponse>(url, {
      method: options.saveUrlMethod ?? HttpMethod.post,
      body: { ...request, conflicts, query: setup.listQuery() },
    });
  };
}

/**
 * The grid's save engine wired to its block: saves posted to `saveUrl`, the
 * answer's rows and values put on screen, and a failure told in the words
 * the error presenter gives it, the refused fields named by their labels.
 */
export function useMatrixEngine(setup: MatrixEngineSetup): MatrixSaveEngine {
  const { options, source } = setup;
  const { t } = useI18n();
  const errorPresenter = useApiErrorPresenter();
  return createMatrixSaveEngine({
    mode: () => options.saveMode ?? "immediate",
    send: useSaveRequest(setup),
    isBlocked: setup.isBlocked,
    onResponse: (response) => source.applySaveResponse(response),
    onWritten: (values) => source.patchValues(values),
    onConflict: (conflict) =>
      source.patchValues([
        {
          rowId: conflict.rowId,
          columnId: conflict.columnId,
          value: conflict.current,
        },
      ]),
    onSaved: setup.onSaved,
    describeError: (error) => {
      const summary = describeFieldErrors(error, t, setup.labelOf);
      const notice = errorPresenter.resolveError(
        error,
        summary
          ? { fallbackKey: "dms.action_error.fields", params: { summary } }
          : { fallbackKey: "dms.action_error.generic" },
      );
      return notice?.message ?? t("dms.action_error.generic");
    },
  });
}
