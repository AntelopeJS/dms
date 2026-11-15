/**
 * The provider modules the test harness installs from npm, by name, at the version it pins. Core
 * installs each into `.antelope/cache/@antelopejs/<name>@<version>`, where the replica tests take
 * them from.
 */
export const HARNESS_MODULES = {
  mongodb: "1.8.3",
  "auth-jwt": "1.0.3",
  "file-storage-local": "0.1.13",
  nodemailer: "0.0.12",
} as const;
