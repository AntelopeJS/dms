/**
 * The provider modules the test harness installs from npm, by name, at the version it pins. Core
 * installs each into `.antelope/cache/@antelopejs/<name>@<version>`, where the replica tests take
 * them from.
 */
export const HARNESS_MODULES = {
  mongodb: "1.8.15",
  "auth-jwt": "1.1.3",
  "file-storage-local": "0.2.3",
  nodemailer: "0.0.15",
} as const;

/** The MongoDB server the harness runs its in-memory replica sets on. */
export const MONGO_BINARY_VERSION = "8.0.8";
