import type { Page } from "@playwright/test";

/**
 * Playback evidence for `gif-to-mp4`.
 *
 * ── Why this asks the browser instead of parsing boxes ─────────────────────
 * `phase-07` names three traps that all produce the *same* symptom: `annexb`
 * framing instead of `avc`, odd dimensions rejected by yuv420p, and a container
 * mismatch after the codec chain fell back. Every one of them yields a file with
 * a perfectly well-formed `ftyp` and `moov` — a box walker would pass all three.
 * The only assertion that catches them is whether a decoder will actually play
 * the thing, so this loads the bytes into a real `<video>` and waits for frames.
 *
 * `currentTime` advancing is the part that matters most. `loadedmetadata` fires
 * off the container alone, which is exactly the level a broken bitstream still
 * satisfies; `timeupdate` after a `play()` means samples were decoded.
 */

export interface VideoSummary {
  width: number;
  height: number;
  durationSec: number;
  /** True once playback moved past zero — i.e. frames really decoded. */
  played: boolean;
  mimeType: string;
}

export async function summariseVideo(
  page: Page,
  bytes: Uint8Array,
  mimeType: string,
): Promise<VideoSummary> {
  const base64 = Buffer.from(bytes).toString("base64");

  return page.evaluate(
    async ([encoded, type]) => {
      const binary = atob(encoded);
      const buffer = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        buffer[index] = binary.charCodeAt(index);
      }

      const url = URL.createObjectURL(new Blob([buffer], { type }));
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.src = url;

      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("video never reached loadeddata")),
            15_000,
          );
          video.onloadeddata = () => {
            clearTimeout(timer);
            resolve();
          };
          video.onerror = () => {
            clearTimeout(timer);
            reject(
              new Error(
                `video element rejected the file: ${video.error?.message ?? "unknown"}`,
              ),
            );
          };
        });

        let played = false;
        try {
          await video.play();
          played = await new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => resolve(video.currentTime > 0), 5_000);
            video.ontimeupdate = () => {
              if (video.currentTime <= 0) return;
              clearTimeout(timer);
              resolve(true);
            };
          });
        } catch {
          // Autoplay refused. Not a defect in the file, and the dimensions read
          // below still came from a decoded frame.
          played = false;
        }

        return {
          width: video.videoWidth,
          height: video.videoHeight,
          durationSec: Number.isFinite(video.duration) ? video.duration : 0,
          played,
          mimeType: type,
        };
      } finally {
        video.src = "";
        URL.revokeObjectURL(url);
      }
    },
    [base64, mimeType] as const,
  );
}
