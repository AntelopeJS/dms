import type {
  ConnectionAccess,
  ConnectionAccessSource,
} from "@antelopejs/interface-dms/connection-access";

const sources = new Map<string, ConnectionAccessSource>();

export namespace internal {
  export const RegisterConnectionAccessSource = {
    register: (id: string, source: ConnectionAccessSource): void => {
      sources.set(id, source);
    },
    unregister: (id: string): void => {
      sources.delete(id);
    },
  };
}

export async function GetConnectionAccess(
  connection: string,
): Promise<ConnectionAccess> {
  const answers = await Promise.all(
    [...sources.values()].map(async (source) => source(connection)),
  );
  return answers.includes("read-write") && !answers.includes("read")
    ? "read-write"
    : "read";
}
