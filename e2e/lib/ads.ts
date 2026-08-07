/**
 * Whether the build under test was compiled with an ad network configured.
 *
 * `ADS_ENABLED` is a build-time constant inlined into the bundle, so the E2E
 * suite cannot flip it — it can only ask which build it is looking at. The slot
 * assertions are the placement law of §8, and the law only has subjects when the
 * flag was on at `pnpm build` time. With it off, the same tests assert the other
 * half of the deal: nothing renders at all.
 *
 * Set `NEXT_PUBLIC_ADS_ENABLED=1` for **both** the build and the test run to
 * exercise the placement law locally; CI does exactly that.
 */
export const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === "1";
