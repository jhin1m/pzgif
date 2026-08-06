# Brainstorm — nối kết quả tool này sang tool kế (result chaining)

**Ngày:** 2026-08-06 · **Branch:** main · **Trạng thái:** đã chốt, chuyển sang plan

## Vấn đề

Kết quả một tool là `Blob` sống trong tab. Muốn đưa sang tool khác, người dùng
phải tải về rồi kéo thả lại — một vòng qua đĩa vô nghĩa với file chưa bao giờ
rời realm JS. Hàng chip `NextTools` đã đứng đúng chỗ trong result panel nhưng
chỉ điều hướng tay không.

## Những gì đã có sẵn (scout)

| Thứ | Ở đâu | Tình trạng |
|---|---|---|
| Handoff singleton | `src/lib/handoff/pending-file.ts` | Xong, có test. Dùng cho homepage → tool |
| Consumer hook | `src/hooks/use-handoff-file.ts` | Xong, đã gắn ở **cả 5** tool live |
| Hàng chip | `src/components/tool/next-tools.tsx` | Chỉ là `<Link>` trơn |
| Kết quả job | `use-media-job.ts` → `state.resultBlob` | `Blob`, không phải `File` |
| Format metadata | `registry.ts` → `inputFormats`/`outputFormats` | Có, nhưng `related` chọn tay, không suy từ format |

**Kết luận scout: hạ tầng đã xây ~80%.** Chỉ thiếu sợi dây giữa result panel và
handoff. Không phase nào trong plan 01–11 đề cập chaining → scope mới.

**Chỉ 2 call site**, không phải 5: `gif-workbench.tsx:496` phục vụ 4 tool
(crop/resize/speed/reverse), `gif-compressor-tool.tsx:606` riêng. Cộng
`dev/states/page.tsx:765` (gallery, để nguyên).

## Các hướng đã cân nhắc

| Hướng | Bỏ vì |
|---|---|
| **Chip mang file** (chọn) | — |
| Chip + banner "đang tiếp tục từ X" ở trang đích | FileChip đã hiện tên + kích thước; banner là chrome thừa cho thông tin đã có |
| Pipeline builder nhiều bước | Sản phẩm khác, không phải tính năng. Cần job queue trong `JobController`, UI dựng chuỗi, và phá mô hình 1-trang-1-tool mà SEO dựa vào |
| Lưu qua sessionStorage/IndexedDB | `File` không structured-cloneable vào sessionStorage; IndexedDB là ghi vài chục MB ra đĩa rồi đọc lại để vượt qua một navigation chưa từng rời realm. Lý do đã ghi trong `pending-file.ts` |

## Giải pháp chốt

Nối `NextTools` vào handoff đã có. **Không cơ chế mới** — cùng đường dây
homepage → tool, thêm nguồn phát thứ hai.

Luồng: click chip → `setPendingFile(file, đích)` → `Link` nav client-side →
`useHandoffFile` ở đích nhận → `handleFile` probe + load. **Trang đích không sửa
dòng nào.**

### Thay đổi

1. **`registry.ts`** — thêm `chainTargets(slug, produced: MediaFormat)`. Giữ thứ
   tự `related` của content author, lọc bỏ route có `inputFormats` không chứa
   `produced`, rồi lọc `isLive`. Registry vẫn chỉ sở hữu cấu trúc.
2. **`next-tools.tsx`** — thêm `"use client"`, thêm prop
   `result?: { blob; name; format } | null`. `onClick` gói
   `new File([blob], name, { type: blob.type })` rồi `setPendingFile`. Khi
   `result == null` → render link thường (gallery giữ nguyên hành vi).
3. **2 call site** — truyền `result`. Cả hai đã có sẵn `resultBlob` +
   `downloadName` đúng scope.
4. **`messages/en.json:83`** — `tool.nextTools` từ `"Next?"` sang nhãn nói rõ
   file đi theo. Chrome chung, không phải prose per-tool.

### `produced` là prop tường minh, không suy diễn

`outputFormats` có thể nhiều phần tử (`split-gif-to-frames`: png|zip). Suy từ
`blob.type` hay từ `outputFormats[0]` đều là đoán. Trang biết chính xác nó vừa
tạo ra gì → truyền thẳng. Hôm nay cả 2 site truyền `"gif"`.

### Ba quyết định phụ

- **Ngưỡng hiện hàng: 2 chip → 1.** Comment cũ ("một chip lẻ đọc như danh sách
  hỏng") đúng với *danh sách gợi ý*; chip mang file là *hành động*. Sau khi lọc
  format, `gif-to-mp4` chỉ còn 1 đích hợp lệ (`mp4-to-gif`) — ẩn đi là mất giá
  trị chính. **Trần 2 chip giữ nguyên** vì lý do chiều cao panel phải đặt trước
  vẫn còn nguyên giá trị.
- **Tên file cộng dồn.** `loop.gif` → `-compressed.gif` → `-compressed-cropped.gif`.
  Xấu sau 3 bước nhưng trung thực; mỗi tool đã tự tính `downloadName` từ
  `file.name`, không đụng gì. Chuẩn hoá tên là bài toán riêng.
- **Không thêm prose.** Nhãn hàng ở `messages/`, nhãn chip là `route.name`.
  → **Không phụ thuộc Phase 9**, ship được ngay.

### Mất bản trung gian — chấp nhận có ý thức

Trang gốc unmount → `revokeAll()` thu hồi object URL. Blob vẫn sống trong
handoff nên bước sau chạy bình thường, nhưng bản trung gian không tải về được
nữa. Xử lý bằng thứ tự đọc, không bằng code: chip nằm **sau** nút Tải về, dưới
đường kẻ (đã đúng sẵn), nhãn nói rõ file đi theo.

Bác bỏ: auto-download (đổ rác vào Downloads không xin phép, thù địch với file
200 MB) và giữ lịch sử blob (hai bản 200 MB cùng lúc trên iOS — đúng thứ
admission control sinh ra để chặn, và chống lại chính lý do `pending-file.ts`
dùng clear-on-read).

## Kiểm chứng đã làm trong lúc brainstorm

- Blob GIF mang `type: "image/gif"` (`encode.worker.ts:92,101`) → `File` gói lại
  có MIME đúng.
- Chấp nhận file đi qua **sniff bytes** (`sniff.ts`), không qua MIME → handoff
  không mở lỗ hổng validate nào ngoài phần bộ lọc format đã phủ.
- `result-panel-reservation.spec.ts` đo *cần* vs *đã đặt trước*. Hôm nay cả 5
  tool live đều đã render đủ 2 chip → đổi ngưỡng xuống 1 **không đổi chiều cao
  hôm nay**; chỉ có tác dụng từ Phase 7.

## Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Phase 7 đẩy .zip/.mp4 sang tool GIF → `decode-failed` | Cao nếu không lọc | `chainTargets()` lọc format — chính là lý do tồn tại của nó |
| ⌘-click chip: file bị stash nhưng không nav | Đã giải quyết | `takePendingFile(slug)` đối chiếu đích; đã có test |
| Strict Mode double-mount nạp file 2 lần | Đã giải quyết | clear-on-read |
| Chiều cao panel đổi → CLS | Thấp | Trần vẫn 2 chip; spec reservation canh |

## Ba luật nền — không đụng

Không `SharedArrayBuffer`/COOP/COEP. Không thanh tiến trình mới (chip là điều
hướng, không phải job). Không prose sinh từ template.

## Khối lượng

1 hàm registry · 1 component sửa · 2 dòng ở 2 call site · 1 chuỗi i18n · ~3 test
(unit registry, unit component, e2e chain).

## Câu hỏi còn treo

- Nhãn `tool.nextTools` mới: câu chữ chính xác chưa chốt. Là chrome chung nên
  không cần Phase 9, nhưng vẫn cần một người quyết một chuỗi.
- Chip có nên hiện với route `planned` dưới dạng disabled không? Hiện `isLive`
  lọc thẳng. Chưa cần trả lời cho tới Phase 7.
