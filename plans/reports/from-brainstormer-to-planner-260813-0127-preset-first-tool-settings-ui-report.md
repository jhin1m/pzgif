# Preset-first tool settings UI — brainstorm summary

**Ngày:** 2026-08-13 · **Branch:** main · **Trạng thái:** đã duyệt, sẵn sàng plan
**Scope chốt:** `gif-compressor` + `mp4-to-gif`. `resize-gif` bị loại (lý do §2.1).

---

## 1. Vấn đề

Đề xuất ban đầu: bỏ settings panel, thay bằng 1 preset mặc định tối ưu → 1 nút duy nhất,
thêm 1 nút dưới để mở settings.

Chẩn đoán lại sau khi scout: **preset mặc định đã tồn tại** (`DEFAULT_VALUES` mỗi tool —
quality 80, colours 256, width = width gốc). Drop file → bấm Run là chạy được, 0 chạm.
Bệnh thật là hai cái khác:

1. **Nút primary bị chôn.** `gif-compressor-tool.tsx:711` — primary render *sau* 4 control.
2. **Default im lặng.** Không dòng nào nói default là gì → người dùng không dám bấm,
   phải đọc hết 4 control rồi mới quyết.

## 2. Ràng buộc từ codebase (đã verify, không phải giả định)

### 2.1 `resize-gif` không có trục preset — loại khỏi scope

- `resize-gif-tool.tsx:38-44`: quality **hardcode 90**, có lý do viết tay — resize là tool
  GIF→GIF duy nhất mà quality không phải quyết định của user.
- 3 "control" thực chất = 1 select `mode` (pixels/percent) swap giữa 2 control loại trừ nhau
  → màn hình chỉ bao giờ có **2 control**. Không đạt ngưỡng ≥3 của scope.
- Thứ giống preset duy nhất là `content.controls.scale.options` (25/50/75%) — **đã là select**.
  Nâng thành chip là thay đổi khác, nhỏ hơn, không cần disclosure.

### 2.2 `mp4-to-gif`: preset không được ghi số tuyệt đối

`width`/`fps` mặc định đến từ device tier: desktop `{480,15}`, mobile `{320,10}`
(`mp4-to-gif-tool.tsx:64-65`), slider max chặn bởi `budget.defaultMaxWidth`
(`limits.ts:55-76`, 640/480/480/480 theo tier).

**Luật:** giá trị preset tính từ profile đã resolve, snap qua đúng
`WIDTH_LADDER [640,480,400,320,240]` / `FPS_LADDER [20,15,12,10,8]` (`limits.ts:183-184`)
trước khi ghi vào control. Slider hiện gì, engine chạy đúng cái đó.
Preset ghi cứng 640 trên iPhone → admission control hạ âm thầm → cùng loại lỗi với fake progress.

`trim` là `kind: "custom"` (2 handle trên timeline) — không preset nào biểu đạt được, nằm ngoài.

### 2.3 Grid không được đụng

`tool-shell.tsx`: `lg:[1fr_320px]`, `xl:[1fr_320px_300px]` (cột 300px = ad rail, reserve từ
first paint theo §8.2). Xoá cột settings → rail dịch ngang. Giữ cột rỗng → 320px gutter chết.
Nên: **cột giữ nguyên ở mọi width; chỉ nội dung bên trong đổi thứ tự + collapse ở `<lg`.**

### 2.4 Copy trong settings là chống scaled-content-abuse

Label + hint là prose viết tay per-tool (`control-schema.ts:1-22` nói rõ: mechanics share được,
copy thì không). Collapse phải dùng `hidden` attribute, **không** conditional render — unmount
là chữ biến khỏi HTML tĩnh.

## 3. Giải pháp chốt

### Cấu trúc cột phải (đảo thứ tự)

```
        ≥lg (desktop)                      <lg (mobile/tablet)
┌──────────────┬───────────────┐    ┌────────────────────────┐
│              │ [Nhỏ][CB][Nét]│    │        stage           │
│              │  [ Nén GIF ]  │    ├────────────────────────┤
│    stage     │  Chạy trong   │    │  [Nhỏ] [Cân bằng] [Nét]│
│              │  trình duyệt  │    │     [  Nén GIF  ]      │
│              ├───────────────┤    ├────────────────────────┤
│              │ quality  ──●─ │    │  ⌄ Tuỳ chỉnh (đóng)    │
│              │ colours  [256]│    │    hidden, còn trong   │
│              │ width    ──●─ │    │    HTML tĩnh           │
│              │ dropFrames [ ]│    └────────────────────────┘
└──────────────┴───────────────┘
```

- Chip → primary → settings. Settings mở sẵn ở `≥lg`, đóng sẵn ở `<lg`.
- Trạng thái mở/đóng quyết bằng **CSS**, không `matchMedia` — JS check render sai ở server rồi
  tự sửa sau hydration, đúng cái shift `tool-shell.tsx` viết 30 dòng để tránh.
- Ở `≥lg` cột dài ra/ngắn lại không đẩy gì (nằm cạnh stage). Ở `<lg` disclosure đẩy explainer
  xuống nhưng là click trực tiếp → trong cửa sổ 500ms, không tính CLS.

### Chip điều khiển chính control đang hiện

Giải mâu thuẫn "chip + settings mở sẵn ở desktop = nhiều hơn hiện tại": chip **ghi vào**
`ControlValues`, slider nhìn thấy được tự nhảy. Chip là shortcut *dạy* preset nghĩa là gì,
không phải cấu hình song song. Sửa tay 1 control → không chip nào active, hiện "Tuỳ chỉnh".

### Component mới (2, đều nhỏ)

| File | Vai trò |
|---|---|
| `src/components/tool/preset-row.tsx` | Tái dùng `PresetChip` sẵn có. Khác `preset-chips.tsx` ở chỗ ghi `ControlValues` thay vì chọn `DiscordPresetId`. |
| `src/components/tool/settings-disclosure.tsx` | Wrap `SettingsForm`. `aria-expanded`/`aria-controls`. Theo pattern §5.12 + amendment `hidden="until-found"`: **không** render attribute đó server-side (Safari không hỗ trợ, invalid-value default = `display:none` → không mở được trên mọi iOS visitor); gắn sau mount, guard `"onbeforematch" in document.body`. |

### Preset values

**gif-compressor** — ràng buộc engine: `colours < 256` ghim encoder `gifenc`, quality là dial
riêng của gifski nên thành inert (`gif-compressor-tool.tsx:153-155`). Preset không được set cả
hai rồi giả vờ quality có tác dụng.

| Chip | quality | colours | width | dropFrames | Encoder |
|---|---|---|---|---|---|
| Nhỏ nhất | *(inert)* | 128 | ×0.75 gốc | on | gifenc |
| Cân bằng *(mặc định)* | 80 | 256 | gốc | off | gifski |
| Nét nhất | 95 | 256 | gốc | off | gifski |

Chip "Nhỏ nhất" phải hiện lý do quality inert — copy đã có: `content.controls.qualityCappedPalette`.

**mp4-to-gif** — hệ số trên profile đã resolve, snap qua ladder.

| Chip | Desktop `{480,15}` | Mobile `{320,10}` |
|---|---|---|
| Nhỏ nhất | 320 / 10fps / q70 | 240 / 8fps / q70 |
| Cân bằng *(mặc định)* | 480 / 15fps / q80 | 320 / 10fps / q80 |
| Mượt nhất | 480 / 20fps / q90 | 320 / 15fps / q90 |

`trim` không bị chip đụng vào.

## 4. Rủi ro

**Chặn — `untouched()` sẽ nuốt mất preset.** `gif-workbench.tsx:323-325` chỉ chạy
`valuesForProbe` khi control còn `untouched` so với `defaultValues`. Bấm chip trước khi probe
trả lời (rất dễ: probe là round trip qua worker, GIF lớn về sau khi page đã interactive) →
`untouched` false → **width slider không bao giờ size theo file**, đứng ở fallback 1280.
Fix: lưu `presetId` active riêng; điều kiện chạy `valuesForProbe` đổi từ *"giá trị bằng default"*
sang *"chưa sửa tay"*.

Nhỏ hơn:

- `aria-describedby="compressor-primary-reason"` phải sống **ngoài** disclosure — nó mô tả nút
  primary, nút giờ nằm trên panel. Nếu lọt vào vùng `hidden` thì screen reader mất lý do disable.
- Nút "Reset" hiện ở header settings panel (`gif-compressor-tool.tsx:691`). Với preset,
  reset = về chip "Cân bằng". Gộp lại, bỏ 1 affordance.
- Test chọn theo control id; mobile giờ control ẩn → `e2e/` phải mở disclosure trước khi assert.
- `job-error.tsx` `onChangeSetting` ghi thẳng vào control → phải làm chip về "Tuỳ chỉnh",
  không để chip cũ vẫn sáng trong khi giá trị đã khác.

## 5. Acceptance

1. Drop file → 1 nút rõ ràng trong viewport đầu, không scroll, không mở gì.
2. Bấm chip → control đang hiện đổi giá trị nhìn thấy được; sửa tay → chip về "Tuỳ chỉnh".
3. Giá trị chip trên slider == giá trị trong `plan` engine chạy (không downgrade âm thầm).
4. `pnpm check:static` pass; HTML tĩnh vẫn chứa toàn bộ label + hint viết tay.
5. Không grid nào đổi số cột; `AdSlot` rail không dịch ngang ở bất kỳ thao tác nào.
6. Disclosure mở/đóng bằng bàn phím; mở được trên iOS Safari.
7. Probe về sau khi bấm chip vẫn size được width slider theo file (§4 hazard).

## 6. Ngoài scope

`resize-gif` · 4 page Discord + hub (preset chips ở đó **là** value proposition —
`preset-chips.tsx:9-20`) · 6 tool ≤2 control · engine · preset thứ 4.

## 7. Câu hỏi chưa chốt

- Tên chip tiếng Anh cuối cùng (copy viết tay, thuộc `src/content/`, không sinh từ template).
  Bản trên là placeholder tiếng Việt để bàn.
- Chip có nên hiện luôn ở trạng thái `idle` (chưa có file) hay chỉ sau khi drop? Hiện settings
  disable-with-reason khi idle (§5.1); chip nên theo cùng quy tắc, cần xác nhận.
