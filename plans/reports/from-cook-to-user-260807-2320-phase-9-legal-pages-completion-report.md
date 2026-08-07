# Phase 9 slice — six legal/trust pages shipped

Ngày: 2026-08-07 · Branch: `main` (uncommitted) · Plan: `plans/260807-2243-phase-9-legal-trust-pages/`

## Kết quả

Sáu route live, prerender tĩnh: `/about`, `/contact`, `/terms`, `/privacy`, `/cookies`, `/dmca`.

| Gate | Trước | Sau |
|---|---|---|
| `typecheck` / `lint` | sạch | sạch |
| `vitest` | 243 | **264** (+21) |
| `build` | 12 static pages | **19 static pages**, 0 warning |
| `check:static` | 8 route | **13 route**, 100% |
| `check:forbidden` | 213 files | 234 files, sạch |
| `check:landing` / `check:heavy` | sạch | sạch, không đổi |
| `test:e2e` | 115 pass | **121 pass, 0 fail**, 33 skip |

4 e2e fail cũ trên `/dev/states` đã biến mất từ commit blocker-A `e1da04e` — không phải slice này sửa.

## Quyết định đã chốt

- **Operator: Louis Le**, cá nhân, **Úc**. Đã vào `site-config.ts` (`OPERATOR_NAME`,
  `OPERATOR_LOCATION`, `CONTACT_EMAIL`), `NOTICE`, `LICENSE-CONTENT`, và cả 6 trang.
  `LICENSE-CONTENT` dòng "contact the operator named on the About page" lần đầu tiên
  trở thành câu có nghĩa.
- **Governing law: Úc**, kèm carve-out Australian Consumer Law bắt buộc.
- **Prose là `src/content/legal/*.json`** — không thêm MDX, giữ ranh giới `LICENSE-CONTENT`
  nhìn thấy được trong file tree.

## Kiến trúc

- `src/lib/content/legal.ts` — schema + validator. Dùng lại `ExplainerSection` từ
  `tools/content.ts`. Khác `toolContent()` ở chỗ **validate mọi field**, chạy ở module
  scope trong route → file hỏng là **build failure**, không phải trang render heading rỗng.
- `src/components/content/legal-page.tsx` — 1 server component dùng chung, có slot
  `children` cho mailto CTA của Contact. **Không có ad slot** — reviewer mở Privacy Policy
  chính là để kiểm tra điều đó.
- `LEGAL_ROUTES` trong `registry.ts`, tách khỏi `ALL_ROUTES` → `liveRoutes()`,
  `relatedRoutes()`, `chainTargets()`, `routesInGroup()` giữ nguyên nghĩa, không consumer
  nào phải audit lại.
- Footer: legal nav ở **bottom bar** cạnh AGPL source link, không phải cột thứ 4.
- `sitemap.ts`: 6 legal route với `lastModified` đọc từ field `updated` của chính file
  content. Tool entries không đụng — chúng chưa có `updated`, bịa ra là đúng lỗi
  build-timestamp mà phase doc cảnh báo.

## Nội dung — ba điểm khác boilerplate

1. **Cookie Policy mở đầu: "PZGIF sets no cookies."** Không phải "chỉ essential cookies".
   Đo được, và có guard giữ.
2. **Terms có carve-out ACL.** Điều khoản miễn trừ kiểu US boilerplate là **vô hiệu** ở Úc.
3. **Privacy ghi rõ quyết định GDPR Art. 27**: dựa miễn trừ 27(2)(a), có ngưỡng xem lại.
   Cũng nêu thẳng miễn trừ small-business của Privacy Act 1988 (Cth) rồi cam kết tuân thủ
   APP tự nguyện — giấu miễn trừ mình đang dựa vào mới là thứ đáng nghi.

## Guard, và bằng chứng chúng thật sự đỏ

Mỗi guard đã được phá thử một lần và xác nhận fail, rồi khôi phục:

| Guard | Phá bằng | Kết quả |
|---|---|---|
| Paragraph uniqueness | copy 1 đoạn từ `about` sang `contact` | ✗ đỏ, chỉ tên cả 2 trang |
| No `document.cookie` | thêm `document.cookie = "x=1"` | ✗ đỏ |
| `localeCookie: false` | lật thành `true` | ✗ đỏ |
| No IndexedDB / sessionStorage | thêm `sessionStorage.setItem` | ✗ đỏ |

Cộng thêm 6 negative-case cho validator (slug lệch, sections rỗng, level 4, thiếu
`meta.title`, date không ISO), floor số từ mỗi trang, và guard "không có địa chỉ email
nào khác ngoài `contact@pzgif.com`".

## Code review đã bắt được gì

`code-reviewer` trả về DONE_WITH_CONCERNS với **2 lỗi chặn, đều là claim sai so với code**.
Tôi đã kiểm chứng độc lập và cả hai đều đúng:

1. **Privacy + Cookie nói handoff file nằm trong IndexedDB. Sai.**
   `pending-file.ts` là **module singleton trong bộ nhớ**; grep cả repo ra đúng 1 hit
   "IndexedDB" và đó là comment *từ chối* nó. Tôi đã đọc comment đó rồi ghi ngược lại ý nghĩa.
   Sự thật còn mạnh hơn: file không chạm đĩa, mất khi reload. Copy đã viết lại theo hướng đó.
   **Gốc rễ nằm ở `plan.md` của chính tôi**, dưới tiêu đề "Measured, not assumed" — đã sửa
   cả plan lẫn phase-02, kèm ghi chú cảnh báo để lần sau không tái diễn.
2. **Privacy nói "có automated test chống filename lọt vào telemetry". Test đó không tồn tại.**
   Đã bỏ claim, thay bằng câu đúng: code là public nên ranh giới đó kiểm tra được.

Ngoài ra đã sửa:

- **`<title>` nhân đôi thương hiệu trên 5/6 trang.** `layout.tsx` có `template: "%s — PZGIF"`;
  `meta.title` của tôi lại kèm sẵn hậu tố → `Privacy Policy — PZGIF — PZGIF`. Assertion e2e
  của tôi chỉ kiểm tra title khác rỗng nên không bắt được — đã thay bằng đếm số lần
  "PZGIF" xuất hiện, cộng test distinct-titles riêng.
- **Guard cookie không bắt được regression thực tế.** Nó chỉ grep `document.cookie`, trong
  khi thứ thật sự chặn cookie là `localeCookie: false` (next-intl mặc định **bật**
  `NEXT_LOCALE`). Lần sửa đầu tôi grep text file — và nó pass ngay cả khi đã lật thành
  `true`, vì `localeCookie: false` xuất hiện trong block comment mô tả option. Cùng đúng
  loại lỗi. Đã đổi sang import `routing` và đọc giá trị đã resolve.
- Comment sai trong `sitemap.ts` ("type error" → thực ra là build-time throw), câu
  "fails the build" trong `cookies.json` (vitest không nằm trong `pnpm build`), và comment
  của anti-template guard hứa nhiều hơn nó làm (nó bắt copy-paste, không bắt paraphrase).

## Còn lại

**Chặn deploy, không chặn merge:**

- [ ] **Cloudflare Email Routing cho `contact@pzgif.com`** — 4 trang publish địa chỉ này và
      nó là kênh support duy nhất. Site live quảng cáo địa chỉ bounce còn tệ hơn không có
      trang Contact. Đã thêm vào `docs/infrastructure-runbook.md` §4 dưới dạng checklist item.

**Hai câu chưa chốt** (sửa 1 dòng khi có đáp án, không chặn gì):

1. Bang/lãnh thổ nào của Úc cho điều khoản venue? Đang viết "the laws of Australia" —
   thi hành được, nhưng nêu tên bang là dạng mạnh hơn.
2. Louis Le kinh doanh cá nhân hay có pháp nhân (ABN)? Ảnh hưởng câu chữ miễn trừ
   Privacy Act. Đang giả định cá nhân, doanh thu dưới AU$3M.

**Ngoài scope slice này, đã nói rõ chứ không bỏ quên:** Acceptable Use, Accessibility
statement, 6-10 trang editorial (AdSense evidence pack), `src/lib/seo/*`, JSON-LD trang
legal, `noindex` cho dev routes, redirect map, CI grep chặn `aggregateRating`,
`lastModified` cho tool pages.

## Ghi chú cho Phase 10

`legal.test.ts` sẽ đỏ ngay khi ad network được wire — đó là thiết kế. Ngày đó Cookie Policy
và Privacy Policy phải được viết lại **trong cùng commit** với cookie đầu tiên, và cả hai
trang đã có sẵn phần "what changes when advertising starts" để sửa thay vì viết mới.
