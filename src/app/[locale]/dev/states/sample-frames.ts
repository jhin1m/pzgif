/**
 * Two SVG frames for the gallery's before/after comparison: a smooth gradient
 * and the same scene posterised into hard bands.
 *
 * They are inline `data:` URIs rather than files in `public/` because the point
 * of the gallery is the *component*, and a fixture that can 404 turns a
 * component review into a debugging session. The banding is exaggerated on
 * purpose — this is a control demo, not a claim about gifski's output. Real
 * before/after evidence comes from real jobs (design principle #4).
 *
 * `img-src 'self' data: blob:` in `next.config.ts` is what allows these.
 */

function dataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;
}

const SCENE_FOREGROUND = `
  <circle cx="300" cy="90" r="28" fill="#FFF4D6"/>
  <path d="M0 190 L80 150 L150 186 L230 140 L310 180 L400 152 L400 250 L0 250Z" fill="#0A0E16" opacity=".85"/>
`;

export const BEFORE_FRAME = dataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1B39B0"/>
      <stop offset=".55" stop-color="#5B82F5"/>
      <stop offset="1" stop-color="#F59E0B"/>
    </linearGradient>
  </defs>
  <rect width="400" height="250" fill="url(#sky)"/>
  ${SCENE_FOREGROUND}
</svg>`);

export const AFTER_FRAME = dataUri(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 250" shape-rendering="crispEdges">
  <rect width="400" height="55" fill="#22409F"/>
  <rect y="55" width="400" height="50" fill="#4570EE"/>
  <rect y="105" width="400" height="45" fill="#8E9FE0"/>
  <rect y="150" width="400" height="45" fill="#E0A83C"/>
  <rect y="195" width="400" height="55" fill="#C9772A"/>
  <circle cx="300" cy="90" r="28" fill="#FFF2CC"/>
  <path d="M0 190 L80 150 L150 186 L230 140 L310 180 L400 152 L400 250 L0 250Z" fill="#11141C"/>
</svg>`);
