/**
 * Re-export shim. The encoder was promoted to `src/lib/media/encode/gifenc.ts`
 * in Phase 4; the Phase 1 specs — G6's matched-bytes pack in particular — keep
 * importing it from here so their recorded artefacts stay traceable to the code
 * path they measured.
 */

export {
  encodeGifencToByteBudget,
  encodeWithGifenc,
  type GifencEncodeArgs,
} from "@/lib/media/encode/gifenc";
