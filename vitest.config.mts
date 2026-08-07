import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // The ad slots only exist when a network is configured, and the reservation
    // law (§8.2) is about how they behave *then*. The unit suite asserts that
    // behaviour, so it runs with the flag on; the off case is asserted
    // explicitly in `ad-slot.test.tsx` by re-importing with the flag cleared.
    env: { NEXT_PUBLIC_ADS_ENABLED: "1" },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.mjs"],
  },
});
