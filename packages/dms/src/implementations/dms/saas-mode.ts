import type { SaasModeRegistration } from "@antelopejs/interface-dms/utils/saas-mode";

const registrationIds = new Set<string>();

export namespace internal {
  export const RegisterSaasMode = {
    register: (registration: SaasModeRegistration): void => {
      registrationIds.add(registration.id);
    },
    unregister: (registration: SaasModeRegistration): void => {
      registrationIds.delete(registration.id);
    },
  };

  export function IsSaasModeRegistered(): boolean {
    return registrationIds.size > 0;
  }
}
