import { detach } from "../detach";
import { isString } from "../../../../../dms-core/app/utils/type-check";
import { onMounted, watch } from "vue";
import type { BlockText } from "../../../../../dms-core/app/types/composed-text";
import type {
  AgendaProposal,
  FullAgendaOptions,
} from "../../../types/full-agenda";
import type { AgendaDayKey, AgendaPlacement } from "./agendaModel";
import { bookProposal, type AgendaPrefill } from "./agendaPropose";

/** What the booking mode acts on. */
export interface AgendaProposeSetup {
  raw: FullAgendaOptions;
  timeZone: () => string;
  goTo: (day: AgendaDayKey) => void;
  createAt: (placement: AgendaPlacement, prefill: AgendaPrefill) => void;
  text: (value: BlockText | undefined) => string;
}

/** The page URL without `param`, as the router's query. */
function queryWithout(param: string): Record<string, string> {
  const query = Object.fromEntries(new URLSearchParams(window.location.search));
  delete query[param];
  return query;
}

/**
 * Booking mode (`propose`): once the agenda is mounted, and each time a link
 * on the same page puts the URL key in the page's query, the key leaves the
 * URL at once (a reload does not book again), then `bookProposal` reads and
 * opens the form.
 */
export function useAgendaPropose(setup: AgendaProposeSetup): void {
  const { propose } = setup.raw;
  if (propose) useBookingMode(setup, propose);
}

function useBookingMode(
  setup: AgendaProposeSetup,
  propose: NonNullable<FullAgendaOptions["propose"]>,
): void {
  const { t } = useI18n();
  const route = useDmsRoute();
  const router = useDmsRouter();
  const toast = useToast();
  const { $authFetch } = useAuthFetch();

  function book(value: string): void {
    detach(router.replace({ query: queryWithout(propose.param) }));
    detach(
      bookProposal(
        {
          propose,
          timeZone: setup.timeZone(),
          read: (url, query) =>
            $authFetch<AgendaProposal>(url, { method: "GET", query }),
          goTo: setup.goTo,
          open: setup.createAt,
          toast: (message, tone) =>
            toast.add(
              tone === "error"
                ? {
                    title: setup.text(message),
                    color: "error",
                    icon: "i-ph-warning-circle",
                  }
                : {
                    title: setup.text(message),
                    color: "success",
                    icon: "i-ph-check-circle",
                  },
            ),
          failedMessage: t("dms.agenda.propose.failed"),
        },
        value,
      ),
    );
  }

  onMounted(() => {
    watch(
      () => route.query[propose.param],
      (value) => {
        if (isString(value) && value) book(value);
      },
      { immediate: true },
    );
  });
}
