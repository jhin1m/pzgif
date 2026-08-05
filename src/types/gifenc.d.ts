/**
 * `gifenc` 1.0.3 ships no type declarations. This covers only the surface the
 * encoder path actually uses, transcribed from `gifenc/src/index.js` — not from
 * the README, which omits several defaults.
 *
 * The `repeat` semantics below are the trap worth remembering: in gifenc `0`
 * means loop forever, while in gifski `repeat: 0` means play exactly once and an
 * *omitted* `repeat` means forever. The two encoders read the same number the
 * opposite way round, and the A/B comparison feeds both from the same call site.
 */
declare module "gifenc" {
  export type Palette = number[][];

  export interface QuantizeOptions {
    /** `rgb565` is the default and the highest quality of the three. */
    format?: "rgb565" | "rgb444" | "rgba4444";
    oneBitAlpha?: boolean | number;
    clearAlpha?: boolean;
    clearAlphaThreshold?: number;
    clearAlphaColor?: number;
  }

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: QuantizeOptions,
  ): Palette;

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: Palette,
    format?: "rgb565" | "rgb444" | "rgba4444",
  ): Uint8Array;

  export interface WriteFrameOptions {
    palette?: Palette | null;
    /** Frame delay in milliseconds. */
    delay?: number;
    transparent?: boolean;
    transparentIndex?: number;
    /** -1 = play once, 0 = loop forever, >0 = that many loops. */
    repeat?: number;
    colorDepth?: number;
    dispose?: number;
    first?: boolean;
  }

  export interface GifEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      options?: WriteFrameOptions,
    ): void;
    finish(): void;
    bytes(): Uint8Array;
    bytesView(): Uint8Array;
    reset(): void;
  }

  export function GIFEncoder(options?: {
    initialCapacity?: number;
    auto?: boolean;
  }): GifEncoderInstance;

  export default GIFEncoder;
}
