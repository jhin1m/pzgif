/**
 * Re-export shim. The encoder was promoted to `src/lib/media/encode/gifski.ts`
 * in Phase 4; the Phase 1 specs keep importing it from here so their recorded
 * artefacts stay traceable to the code path they measured.
 */

export {
  GIFSKI_MIN_FRAMES,
  encodeWithGifski,
  initGifski,
  resetGifski,
  type GifskiEncodeArgs,
} from "@/lib/media/encode/gifski";
