import { AddFrontendModule } from "@antelopejs/interface-dms/page";
import "./derived";
import "./native";
import "./capabilities";
import "./archive";

// The frontend module the test host adds, owner of the pages it registers
// (src/test/integration/page-module.test.ts).
const TEST_HOST_FRONTEND_MODULE = "@antelopejs/dms-test-host-frontend";

/**
 * Adds a frontend module the way a consumer module does. Its renderer is one
 * no frontend asks for, so it never reaches a manifest or an archive.
 */
export async function construct(): Promise<void> {
  await AddFrontendModule({
    name: TEST_HOST_FRONTEND_MODULE,
    sourcePath: __dirname,
    renderer: { name: "test-host", version: "1" },
  });
}
