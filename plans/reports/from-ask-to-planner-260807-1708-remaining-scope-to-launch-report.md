# PZGIF — còn thiếu gì để launch

Ngày: 2026-08-07 · Branch: `main` @ `32e03eb` · Nguồn: đo trực tiếp, không suy từ plan

## Trạng thái đo được

| Gate | Kết quả |
|---|---|
| `typecheck` / `lint` | sạch |
| `vitest` | 243/243 pass, 29 files |
| `build` | 12 static pages, 0 warning |
| `check:forbidden` | sạch, 213 files |
| `check:static` | 8/8 route prerendered |
| `check:landing` / `check:heavy` | sạch |
| `test:e2e` | **4 fail** / 115 pass — cả 4 đều trên `/dev/states` |

Đã xong: Phase 2 (code), 3, 4, 5, 6 + homepage soul pass.
Live: homepage + 5 tool GIF→GIF (`gif-compressor`, `resize-gif`, `crop-gif`, `gif-speed-changer`, `reverse-gif`).

Engine (`src/lib/media/`) hoàn thiện hơn plan ghi nhận — 30 module, đã có sẵn
`decode/video.ts` (mediabunny), `encode/video.ts` (codec probe chain), `encode/png-zip.ts`,
`estimate.ts`, `ffmpeg-fallback.ts`. Phần lớn khối lượng Phase 7 còn lại là **UI, không phải engine**.

---

## A. Blocker deploy — nửa ngày, làm trước mọi thứ khác

1. **`SOURCE_REPO_URL` sai.** Default trong `src/lib/site-config.ts` là
   `github.com/pzgif/pzgif`; repo thật là `github.com/jhin1m/pzgif` (đã public, đã push).
   Link "Source" ở footer 404 → **vi phạm AGPL-3.0 §6 thật sự** ngay khi user đầu tiên
   tải `gifski-wasm`. Đây là lý do dự án chấp nhận AGPL thay vì trả $950/năm.
2. **`/dev/states` bị prerender vào production build.** Exclude khỏi build production.
   Làm xong thì 4 e2e fail rời khỏi bề mặt sản phẩm.
3. **`check:source-sha` chưa wire vào deploy step** (runbook §3 đã ghi). Cộng với
   `NEXT_PUBLIC_COMMIT_SHA` chưa set → link Source trỏ repo root, không phải commit đang chạy.

Kèm theo: set `NEXT_PUBLIC_SITE_URL` trên host.

---

## B. Phase còn lại

### Phase 7 — Cross-format tools (ước 6-8d, thực tế có thể thấp hơn)

Engine đã có. Còn thiếu:

- 4 route: `mp4-to-gif`, `gif-to-mp4`, `split-gif-into-frames`, `webp-to-gif`
- 4 content file `src/content/*.json`
- `components/tool/trim-range.tsx`, `frame-range-picker.tsx`, `video-embed-snippet.tsx`
- `e2e/cross-format-tools.spec.ts`
- **RIFF/ANMF splitter cho animated WebP** — `decode/webp.ts` hiện chỉ dùng `ImageDecoder`,
  header file ghi rõ splitter được hoãn sang Phase 7. Safari không có `ImageDecoder`.
  Không có splitter thì **cắt page + sitemap entry**, không ship trạng thái hỏng.
- iOS: `mp4-to-gif` phải nói trước above-the-fold rằng thiết bị không chạy được (refusal 80%)

### Phase 8 — Discord preset cluster (4-6d) — differentiator #2, chưa có gì

- `src/lib/presets/discord.ts` — **thiếu hoàn toàn**. Số liệu phải là bản đã sửa:
  sticker 320×320 / ≤512 KB / ≤5s / ≤60fps; banner 960×540; **`680×240` phải biến mất**
- `src/lib/media/autofit.ts` — **thiếu hoàn toàn**
- `components/tool/size-budget-bar.tsx`, `preset-chips.tsx`, `discord-preview.tsx`
- 5 route + 5 bộ copy riêng biệt
- Sửa `docs/design-guidelines.md` §10 và `docs/wireframe/discord-preset.html` cùng commit
- Mỗi lần auto-fit phải spawn worker riêng (WASM heap high-water mark không giải phóng)
- **Cần Discord server Boost L1 (sticker) và L2 (banner 960×540)** để verify — ~$5, sắp xếp sớm

### Phase 9 — Content, SEO, Legal (4-6d) — làm được ngay, không cần engine

Đã có: `sitemap.ts`, `robots.ts`, `tool-json-ld.tsx` (BreadcrumbList + WebApplication),
`faq-section.tsx`, `related-tools.tsx`, `tool-explainer.tsx`.

Còn thiếu:

- **8 trang legal/trust: Terms, Privacy, Cookie, Acceptable Use, About, Contact, DMCA,
  Accessibility** — hiện **không có trang nào**. Đây là điều kiện tiên quyết của ad network.
- **6-10 trang content phi-tool** — hiện 0. Đây là "AdSense evidence pack"; site toàn tool
  page + app nhúng là hình dạng bị từ chối "low value content" kinh điển.
  Trong đó trang gifski side-by-side là **bề mặt duy nhất** khiến differentiator #1 nhìn thấy được.
- `src/lib/seo/metadata.ts` (+ `alternatesFor()`), `src/lib/seo/jsonld.ts`
- `sitemap.ts` phải phát **content date thật**, không phải build timestamp
- `noindex` cho `/dev/states`, `/__bench`
- 404 page + redirect map
- CI grep chặn `aggregateRating` (chống một session tương lai "sửa" bằng rating bịa)
- Không `FAQPage`, không `HowTo` JSON-LD (cả hai đã chết trong Search)

### Phase 10 — Ads, Consent, Analytics (3-4d)

Đã có: `ad-slot.tsx` (+ test, ad-quarantine test), `consent-bar.tsx` (treatment đã thiết kế ở Phase 3).

Còn thiếu:

- `src/lib/ads/types.ts`, `config.ts`, `providers/none.ts`, `providers/adsense.ts` — provider
  interface chưa tồn tại; `ad-slot.tsx` chưa wire vào provider nào
- Consent Mode v2 đúng thứ tự: default-denied inline trong `<head>` → CMP → GA4 → update
- GA4 + Sentry (scrub PII/filename) + `web-vitals` attribution build
- **Beacon sản phẩm cookieless, không consent** — `{tool, deviceTier, outcome, durationBucket,
  inputSizeBucket}`. Không có nó thì launch không dạy được gì: không biết tool nào được dùng,
  tỉ lệ refusal mobile, tỉ lệ download. Test tự động chứng minh nó không bao giờ mang filename.
- Playwright: không task main-thread nào >200ms trong lúc encode
- Sửa `docs/tech-stack.md` §6 (Ezoic 250k MAU → không với tới)

### Phase 11 — QA, Perf, A11y, Launch (5-9d) — chạy **một lần mỗi ship**

- Ma trận thiết bị thật: Chrome/Safari/Firefox desktop + Android thật + **iPhone thật**.
  Playwright WebKit ≠ Safari ≠ iOS Safari trên đúng những chiều mà sản phẩm này phụ thuộc.
- 6 lượt a11y **do người làm**: keyboard-only, VoiceOver, NVDA, zoom 200% @375px,
  320px, forced-colors, `prefers-reduced-motion`
- **Copy audit 27 dòng** trong `plans/reports/from-planner-to-red-team-...-business-review.md` §5
- Visual regression trên `/dev/states`, Lighthouse CI với budget làm ngưỡng fail
- `docs/launch-checklist.md` + `docs/post-launch-operations.md`

---

## C. Quyết định của con người — đang chặn code

| # | Quyết định | Chặn |
|---|---|---|
| 1 | **Operator được nêu tên** | About page, Contact, GDPR controller, mọi đơn ad network, `LICENSE-CONTENT` |
| 2 | **Hosting tier** | Toàn bộ việc deploy. Khuyến nghị Cloudflare Workers (bandwidth free) — verify `@opennextjs/cloudflare` × Next 16.3 trước; fallback Vercel Pro $20/mo |
| 3 | **Thiết bị thật** (iPhone SE 3-class + Android tầm trung) | Gate G3/G4, toàn bộ memory model, ranh giới scope iOS |
| 4 | **Chấm G6** (gifski có đẹp hơn `gifenc` ở cùng bytes không) | Positioning, trang so sánh gifski, và câu hỏi nghĩa vụ AGPL có mua được gì không. Pack đã sinh, chưa chấm. |
| 5 | Email Mediavine hỏi Journey có chạy Next.js không | Đường monetise tháng 3 |
| 6 | Discord server Boost L1+L2 (~$5) | Verify Phase 8 |

---

## D. Defect đã biết, chưa đóng

1. `/dev/states` overflow 40px @320px — **cả Chromium lẫn WebKit**
2. `/dev/states` skip-link tab order — WebKit
3. `/dev/states` FAQ panel height — WebKit, **assertion racing** (đọc height khi transition
   `grid-template-rows` 150ms đang chạy) → flap, không phải lỗi engine
4. **`site-header.tsx` overflow 22px @375px với root font 32px, trên MỌI route** — WCAG 1.4.4.
   Test hiện không bắt được vì chỉ đo 320px với font mặc định. Đây là defect duy nhất
   nằm trên bề mặt sản phẩm, không phải trên `/dev/states`.
5. Gate G3 (memory iOS) chưa từng chạy — budget 30MB là ước lượng mang `measured: false`
6. Gate G6 chưa chấm

---

## E. Thứ tự đề xuất

1. **Blocker A** (nửa ngày) → deploy → verify Search Console + submit sitemap.
   Index age là tài nguyên ràng buộc; mỗi ngày không serve là một ngày mất khỏi đầu đường cong.
2. **Phase 9** — không cần engine, chạy song song được, và là thứ mở khoá ad network.
3. **Phase 8** (Discord) trước **Phase 7** — differentiator #2, rẻ hơn, rủi ro thấp hơn,
   và engine cho nó (`autofit`) nhỏ hơn ANMF splitter.
4. **Phase 7** — nặng nhất, ít chắc chắn nhất, `webp-to-gif` cắt được nếu chạy dài.
5. **Phase 10**, rồi **Phase 11** mỗi ship một lần.

Phase 11 không phải bước cuối cùng — nó chạy **một lần mỗi ship**, quy mô theo ship đó.

---

## Câu hỏi chưa giải

1. Operator được nêu tên là ai? (chặn nhiều nhất)
2. `@opennextjs/cloudflare` có hỗ trợ Next 16.3 không? Chưa kiểm chứng — quyết định host phụ thuộc.
3. G6 chấm hay bỏ? Nếu bỏ, positioning "visibly better" phải cắt khỏi copy cùng commit.
4. Có iPhone thật để chạy G3 không? Nếu không, ranh giới scope iOS vẫn là ước lượng.
5. `webp-to-gif` có đáng ship ở MVP không khi hỏng trên ~20-30% traffic nếu không có splitter?
