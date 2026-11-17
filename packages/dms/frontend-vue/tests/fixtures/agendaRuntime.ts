/**
 * What an agenda part needs to load and to read its context outside a DMS
 * app: the DMS layers read `shallowRef` as an auto-import when their modules
 * load, and the parts inject the context under `AGENDA_CONTEXT_KEY`. Import
 * this module before the parts.
 */
import { markRaw, shallowRef, type InjectionKey } from "vue";
import { vi } from "vitest";
import type { ContainerOptions } from "../../layers/dms-ui/app/composables/containers/types";
import type { ConfirmOptions } from "../../layers/dms-ui/app/composables/confirm/types";
import type { AgendaContext } from "../../layers/dms-ui/app/entries/composables/agenda/agendaModel";

vi.stubGlobal("shallowRef", shallowRef);

/** The key `useAgendaContext` injects the agenda's context under. */
export const AGENDA_CONTEXT_KEY: InjectionKey<AgendaContext> =
  Symbol.for("dms-agenda");

/** A component as the overlay is handed it: its compiled name. */
interface NamedComponent {
  __name?: string;
}

/** What a container resolves with once closed: a prompt's answer, a confirmation, nothing. */
export type OverlayAnswer = string | boolean | null | undefined;

/** What a recorded opening answers: the handle `useDrawer` or `useModal` resolves with. */
interface OpenedHandle {
  result?: Promise<OverlayAnswer>;
}

/** The props of a container the overlay opens. */
type OverlayProps = ContainerOptions | ConfirmOptions;

/** The spies an overlay calls with the props of what it opens. */
export interface OverlaySpies {
  drawerOpen?: (props: OverlayProps) => OpenedHandle | undefined;
  modalOpen?: (props: OverlayProps) => OpenedHandle | undefined;
  confirm?: (props: OverlayProps) => Promise<boolean>;
}

/**
 * Nuxt UI's overlay as the DMS containers use it (`useDrawer`, `useModal`,
 * `useConfirm`): opening a drawer, a modal or a confirmation calls the
 * matching spy with the container's props, stubbed as `useOverlay`.
 */
export function stubRecordingOverlay(spies: OverlaySpies): void {
  vi.stubGlobal("markRaw", markRaw);
  vi.stubGlobal("useOverlay", recordingOverlay(spies));
}

function recordingOverlay(spies: OverlaySpies) {
  return () => ({
    create: (component: NamedComponent, setup: { props: OverlayProps }) => ({
      open: (): Promise<OverlayAnswer> => {
        const name = component.__name ?? "";
        if (name.includes("Confirm"))
          return spies.confirm?.(setup.props) ?? Promise.resolve(true);
        const spy = name.includes("Drawer")
          ? spies.drawerOpen
          : spies.modalOpen;
        return spy?.(setup.props)?.result ?? Promise.resolve(undefined);
      },
      close: vi.fn(),
      patch: vi.fn(),
    }),
  });
}

/** Starts work the test does not wait for; a rejection still fails the run. */
export const unawaited = (pending: Promise<unknown>): void => {
  pending.catch((error: unknown) => {
    throw error;
  });
};
