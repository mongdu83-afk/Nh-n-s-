# Nâng cấp "Báo cáo tổng hợp tuần" — Tài liệu bàn giao (13/10/2026)

Vị trí trong app: **Báo cáo tuần → Báo cáo quản lý** (màn `WeeklyPlanManagerView`, chỉ quản lý thấy).
Ở đầu màn có thêm thẻ **"Báo cáo tổng hợp tuần — đánh giá kinh doanh & điều hành"** gồm 7 phần và mục Cấu hình.
Thẻ AI cũ (`analyzeManagerWeekNow`) vẫn giữ nguyên bên dưới, đổi tên thành "Nhận xét của AI (mô hình ngôn ngữ)".

## 1. Chức năng đã sửa và file liên quan

| File | Thay đổi |
|---|---|
| `index.html` — khối `MWE-ENGINE-BEGIN … END` | **Mới.** Bộ đánh giá `mweEvaluate()` chạy trên trình duyệt: KPI, nguyên nhân, cam kết, chấm điểm kế hoạch, kế hoạch hành động, kết luận. Không gọi AI, không ghi dữ liệu. Thêm `mweAiStaleness()` để phát hiện nhận xét AI đã cũ. |
| `index.html` — `MweReportPanel` | **Mới.** Giao diện 7 phần + Cấu hình. Phần 6 lưu cam kết quản lý. |
| `index.html` — `WeeklyPlanManagerView` | Nhận `isAdmin`. Báo cáo nhà thuốc đổi từ `.get()` sang `onSnapshot`, nên sửa hoặc gửi báo cáo là màn tự tính lại. Thêm phần đọc dữ liệu cho bộ đánh giá. Chặn bấm "Phân tích" 2 lần liên tiếp. Thêm cờ "Dữ liệu đã thay đổi — cần cập nhật" cho nhận xét AI. |
| `index.html` — `BaoCaoTuanView` | Truyền `isAdmin` vào màn quản lý. |
| `tests/managerWeekEval.test.js` | **Mới.** 12 ca kiểm thử nghiệm thu, chạy bằng `node --test tests/managerWeekEval.test.js`. |

**Dữ liệu được đọc** (chỉ đọc, đều đã có sẵn):
- `weeklyReports`: báo cáo tuần này, tuần trước và 2 tuần trước.
- `weeklyTargets/{tuần trước, tuần này, tuần sau}`: chỉ tiêu tuần (`byShop`) và số chốt (`review`).
- `opsConfig/revenueAnalytics`: doanh thu và số bill POS theo ngày, chỉ tiêu tháng, TBB.
- `opsConfig/opsDaySnapshot`: số việc quá hạn.
- `staff`: tên người phụ trách.

**Dữ liệu được ghi** (chỉ khi quản lý bấm Lưu):
- `opsConfig/managerWeekCommit_{thứ Hai}`: cam kết quản lý. Ghi vào đây chứ **không** ghi vào `weeklyPlans`, vì collection đó dùng chung với app Dashboard.
- `opsConfig/managerWeekEvalConfig`: ngưỡng và trọng số do quản lý chỉnh.

## 2. Logic đánh giá

### KPI (Phần 2)

| KPI | Chỉ tiêu | Thực tế (theo thứ tự ưu tiên nguồn) |
|---|---|---|
| Doanh thu tuần | `weeklyTargets.byShop.rev`. Nếu chưa có thì quy đổi chỉ tiêu tháng × 7 / số ngày trong tháng, ghi rõ là **ĐỀ XUẤT**. | Số chốt `weeklyTargets.review`, sau đó POS, cuối cùng là số nhà thuốc tự nhập. |
| Hàng hệ số tuần | `weeklyTargets.byShop.hhs` | Chỉ lấy số chốt. Chưa chốt thì để "Chưa đủ dữ liệu". |
| TB bill | Chỉ tiêu TBB tháng | Doanh thu POS ÷ số bill POS, sau đó số nhà thuốc nhập. |
| Số bill | Không có chỉ tiêu | POS. Chỉ theo dõi xu hướng. |
| Luỹ kế tháng | Chỉ tiêu tháng × số ngày đã qua / số ngày trong tháng | `monthTracking` |

Công thức:
- Tỷ lệ hoàn thành = thực tế ÷ chỉ tiêu × 100.
- Khoảng cách = chỉ tiêu − thực tế.
- Tăng/giảm = kỳ này − kỳ trước.

Khi tuần đang diễn ra, kết quả được so với **chỉ tiêu theo tiến độ** (chỉ tiêu × số ngày bán trọn vẹn / 7), kèm "cần X/ngày cho N ngày còn lại". So sánh với tuần trước dùng **cùng số ngày** của tuần trước.

Trạng thái theo ngưỡng riêng của từng KPI (ngưỡng đề xuất, chỉnh được):

| KPI | Vượt ≥ | Đạt ≥ | Nguy cơ ≥ | Hụt lớn < |
|---|---|---|---|---|
| Doanh thu, HHS | 105 | 100 | 90 | 75 |
| TBB | 105 | 98 | 92 | 85 |
| Luỹ kế tháng | 105 | 100 | 95 | 85 |

Các trường hợp đặc biệt:
- Chỉ tiêu bằng 0 → "Không áp dụng".
- Trống → "Chưa đủ dữ liệu" kèm lý do.
- Không phải số hoặc số âm → "Dữ liệu lỗi".

Không có phép chia nào cho 0.

**Nguyên nhân** chỉ nêu khi có số chứng minh. Bộ đánh giá tách chênh lệch doanh thu thành 2 phần: ảnh hưởng của số bill (Δbill × TBB cũ) và ảnh hưởng của TB bill (ΔTBB × bill mới), rồi so TBB với chỉ tiêu. Hệ thống không có dữ liệu lượt khách, tỷ lệ chuyển đổi, giá vốn hay lợi nhuận, nên báo cáo ghi rõ "chưa đủ cơ sở xác định nguyên nhân gốc" và không đánh giá lợi nhuận.

### Cam kết (Phần 3)

Cam kết là các dòng `keHoach` trong báo cáo **tuần trước**. Mỗi dòng được ghép với dòng `ketQua` của tuần này và xếp vào một trong các nhóm sau:

| Nhóm | Khi nào |
|---|---|
| Hoàn thành | Có số đạt ≥ cam kết, hoặc có số liệu / tệp minh chứng khi cam kết không có số. |
| Một phần | Số đạt < cam kết, dạng "8/20", hoặc ghi "đang làm…". |
| Chưa hoàn thành | Ghi "chưa / không làm…", "hoãn", hoặc số đạt = 0. |
| Đã làm hoạt động, chưa chứng minh kết quả | VD: "phát 500 tờ rơi" cho cam kết "doanh thu +10%". |
| Không đủ bằng chứng | Ghi chú chung chung: "đã làm", "ok", "ổn", "đạt tiến độ". |
| Chưa báo cáo / bị bỏ khỏi báo cáo | Không có dòng kết quả tương ứng. |

Bộ đánh giá còn phát hiện thêm:
- **Lặp lại 2–3 tuần**: việc tương tự chưa xong ở tuần trước hoặc 2 tuần trước.
- **Chưa chuyển sang kế hoạch tuần tới.**
- **Đã nêu nguyên nhân hay chưa.**
- **Doanh thu chưa đạt 2 tuần liên tiếp.**
- Cam kết quản lý của tuần trước kèm trạng thái.

### Chấm điểm kế hoạch tuần tới (Phần 4)

Thang 100 điểm, trọng số đề xuất (chỉnh được ở mục Cấu hình):

| Tiêu chí | Điểm | Cách tính |
|---|---|---|
| Mục tiêu định lượng | 25 | × tỷ lệ đầu việc có con số |
| Hành động cụ thể | 20 | × tỷ lệ đầu việc có động từ hành động hoặc con số, không chung chung ("tăng…", "…tốt hơn") |
| Liên kết với vấn đề thực tế | 20 | × tỷ lệ vấn đề tuần này (KPI chưa đạt, cam kết chưa xong, việc quá hạn, sự cố) đã có trong kế hoạch |
| Người phụ trách & thời hạn | 15 | (tỷ lệ có người + tỷ lệ có hạn hợp lệ) ÷ 2 |
| Chỉ số đo lường | 10 | × tỷ lệ đầu việc có chỉ tiêu kèm đơn vị đo |
| Rủi ro / dự phòng | 10 | Có ít nhất một phương án "nếu…/dự phòng…" |

Xếp loại: ≥ 80 Tốt · ≥ 60 Khá · ≥ 40 Yếu · < 40 Chưa đạt yêu cầu. Mỗi đầu việc liệt kê chính xác phần còn thiếu.

### Kế hoạch hành động khu vực (Phần 5) và ưu tiên

| Ưu tiên | Khi nào |
|---|---|
| **P0** | Doanh thu dưới ngưỡng hụt lớn; sự cố an toàn, bảo quản thuốc hoặc pháp lý; từ 5 việc quá hạn trở lên |
| **P1** | Doanh thu chưa đạt hoặc có nguy cơ; cam kết chưa làm hoặc lặp lại; vấn đề chưa có trong kế hoạch; chưa gửi báo cáo; chưa lập kế hoạch; có việc quá hạn |
| **P2** | Cam kết làm một phần; TBB / HHS chưa đạt; kế hoạch dưới 60 điểm; cam kết chưa có bằng chứng; doanh thu đạt nhưng đang giảm |
| **P3** | Duy trì kết quả tốt; kế hoạch nhà thuốc đã lập nhưng không gắn với vấn đề nào |

- Việc trùng nhau được **gộp theo chủ đề** (tuyển dụng, hết hàng, chăm sóc khách hàng…). Mỗi nhóm vẫn giữ dòng riêng của từng nhà thuốc với chỉ tiêu, người phụ trách và hạn riêng.
- Người phụ trách chỉ lấy từ dữ liệu. Nếu không có thì hiện "Chưa có — quản lý chỉ định".
- Hạn do bộ đánh giá đặt được ghi "(đề xuất)".
- Mọi nhóm ở trạng thái **"Đề xuất — chờ duyệt"** cho đến khi quản lý bấm "Xác nhận thành cam kết" rồi "Lưu cam kết" ở Phần 6. Muốn lưu, mỗi cam kết phải có người chịu trách nhiệm.

Bộ đánh giá không tạo việc, không giao người, không sửa `weeklyPlans` và không ghi đè đánh giá của quản lý.

### Phân biệt 4 loại nội dung

Mỗi khối được gắn nhãn:
- **Dữ liệu thực tế**
- **Nhận định bộ đánh giá** (hoặc **Nhận định AI**)
- **Đề xuất — chờ duyệt**
- **Quản lý đã duyệt**

Màu sắc: đỏ / cam / vàng / xanh / xám, luôn kèm chữ trạng thái.

## 3. Ví dụ trước và sau

**Trước:** một đoạn AI tự do cho cả khu vực, ví dụ: "Tuần này doanh thu chung ổn, một số nhà thuốc cần cố gắng hơn… Đề xuất: tăng cường chăm sóc khách hàng." Không có tỷ lệ theo nhà thuốc, không đối chiếu cam kết, không chấm kế hoạch. Nếu nhà thuốc sửa báo cáo sau khi phân tích, nhận xét cũ vẫn hiển thị như mới.

**Sau** (dữ liệu thử trong bộ kiểm thử, tuần 05/10–11/10):
- *Phần 1:* "Khu vực đạt 97,8% chỉ tiêu doanh thu tuần: 528,0 tr / 540,0 tr, tính trên 6/7 nhà thuốc có đủ số liệu. Vượt 1 · Đạt 4 · Nguy cơ 0 · Chưa đạt 1 · Thiếu dữ liệu 1."
- *Phần 2, NT59:* chỉ tiêu 100,0 tr, thực tế 65,0 tr, đạt 65%, thiếu 35,0 tr, giảm 18,8% so với cùng kỳ, trạng thái **Chưa đạt — hụt lớn**. Nguyên nhân: "số bill −11,1% (≈ −8,9 tr), TB bill −8,6% (≈ −6,1 tr); TBB 162k chỉ đạt 81,3% chỉ tiêu". Báo cáo cũng ghi rõ chưa đủ dữ liệu lượt khách để xác định nguyên nhân gốc.
- *Phần 3, NT72:* "Tuyển 1 nhân viên bán hàng" → "Chưa tuyển được" · **Chưa hoàn thành** · **Lặp lại 2 tuần** · chưa có trong kế hoạch tuần tới.
- *Phần 4, NT74:* "Tăng doanh thu", "Chăm sóc khách hàng tốt hơn" → **20/100 · Chưa đạt yêu cầu**, thiếu chỉ tiêu, người phụ trách, thời hạn, cách đo và phương án dự phòng.
- *Phần 5:* **P0** NT59 bù doanh thu, mục tiêu ≥ 105,0 tr (chỉ tiêu tuần tới đã chốt); **P1** "Thiếu / hết hàng — chung 2 nhà thuốc" với NT95 (20 mã) và NT121 (15 mã) giữ chỉ tiêu riêng.

## 4. Kết quả kiểm thử

Lệnh `node --test tests/managerWeekEval.test.js` cho kết quả **12/12 đạt**.

| # | Tình huống | Kết quả |
|---|---|---|
| 1 | Đạt 120% | Đạt — "Vượt mục tiêu", tách được tác động số bill và TBB, TBB được nêu là chỉ số hỗ trợ |
| 2 | Đạt 65% | Đạt — thiếu 35 tr, hụt lớn, P0, mục tiêu tuần tới lấy từ dữ liệu |
| 3 | Cam kết tuyển dụng chưa làm | Đạt — Chưa hoàn thành, lặp lại 2 tuần, P1, người phụ trách lấy từ dữ liệu |
| 4 | Kế hoạch chung chung | Đạt — dưới 40 điểm, chỉ ra từng phần thiếu |
| 5 | Thiếu dữ liệu | Đạt — "Chưa đủ dữ liệu", không có số bịa; chỉ tiêu = 0, số lỗi hay số âm không làm lỗi phép tính; ghi chú chung chung không được coi là hoàn thành; "phát tờ rơi" được xếp là hoạt động, không phải kết quả |
| 6 | Vấn đề chung nhiều nhà thuốc | Đạt — phát hiện "Thiếu / hết hàng" ở 2 nhà thuốc, giữ chỉ tiêu riêng |
| 7 | Vấn đề chưa có trong kế hoạch | Đạt — đề xuất bổ sung P1; nhà thuốc đã có trong kế hoạch thì không bị đề xuất |
| 8 | Sửa báo cáo sau khi AI phân tích | Đạt — nhận xét AI bị đánh dấu cũ; bộ đánh giá tính lại ngay theo dữ liệu mới |
| 9 | Phân quyền | Đạt ở giao diện — tab quản lý chỉ hiện với quản lý, `runMgrAi` tự chặn người không phải quản lý. Kiểm tra quyền phía máy chủ: xem mục 7 |
| 10 | Khớp dữ liệu nguồn | Đạt — kỳ, tên nhà thuốc, doanh thu, chỉ tiêu, tổng khu vực, số cam kết và nhà thuốc trong hành động đều khớp nguồn |
| + | Cấu hình ngưỡng, tuần đang diễn ra | Đạt |

Ngoài ra đã kiểm tra:
- Cú pháp toàn bộ script của app (`node --check`) không lỗi.
- Render thử thẻ mới trong Chromium ở màn 1200px và 390px: không lỗi console, không tràn ngang.
- Bấm thử cả 8 tab và luồng "Xác nhận thành cam kết → Lưu": nút Lưu bị khoá khi thiếu người chịu trách nhiệm.

## 5. Giới hạn do dữ liệu nguồn

- Không có lượt khách, tỷ lệ chuyển đổi, giá vốn hay lợi nhuận, nên không kết luận nguyên nhân gốc và không đánh giá lợi nhuận.
- HHS tuần chỉ có sau khi hệ thống chốt (sáng thứ Hai tuần sau). Trong tuần, KPI này hiện "Chưa đủ dữ liệu".
- Số bill chưa có chỉ tiêu tuần nên chỉ theo dõi xu hướng.
- `revenueAnalytics` chỉ giữ khoảng 30 ngày gần nhất theo ngày. Với tuần cũ hơn, báo cáo dùng số chốt hoặc số nhà thuốc nhập và ghi rõ nguồn.
- Báo cáo nhà thuốc chỉ có 4 mảng (Khách hàng, Hàng hoá, Nhân sự, Cơ sở vật chất). Mảng "Doanh thu" và "Mặt bằng" dùng cho vấn đề KPI, việc quá hạn và sự cố.
- Việc phân loại kết quả dựa trên chữ tiếng Việt và từ khoá nên có thể sai với cách viết lạ. Mọi phân loại đều kèm lý do để quản lý kiểm tra.
- Số việc quá hạn lấy từ ảnh chụp mới nhất (`opsDaySnapshot`), không phải theo đúng tuần đang xem.

## 6. Không ảnh hưởng chức năng hiện có

- Luồng nhân viên gửi báo cáo tuần, chấm điểm và nhận xét của quản lý, AI báo cáo tuần từng nhà thuốc: không sửa.
- Báo cáo lãnh đạo (`LeaderReportView`): không sửa.
- Thẻ AI quản lý giữ nguyên toàn bộ nội dung cũ, gồm so tuần trước, đánh giá Khách hàng / Hàng hoá / Nhân sự / Cơ sở vật chất, đề xuất kế hoạch, target tuần tới, nút "Đưa vào kế hoạch". Chỉ thêm cờ dữ liệu cũ và nhãn.
- Không ghi vào `weeklyPlans`. Phân quyền và Firebase rules không đổi.
- Thay đổi duy nhất trên luồng cũ: báo cáo nhà thuốc ở màn quản lý chuyển từ đọc 1 lần sang theo dõi trực tiếp. Dữ liệu và trường đọc vẫn như cũ.

## 7. Lỗi còn tồn tại và cách xử lý

1. **Mã nguồn backend `analyzeManagerWeekNow` không có trong các repo được cấp quyền.** Phần mô hình ngôn ngữ vì vậy chưa được nâng cấp prompt và schema; toàn bộ đánh giá có cấu trúc đang do bộ đánh giá trên trình duyệt đảm nhận. Đề xuất khi có mã backend:
   - Truyền vào prompt kết quả `mweEvaluate()` (hoặc cùng logic port sang Node) làm "dữ liệu đã tính sẵn".
   - Yêu cầu mô hình trả JSON có các khoá `overview`, `causes[]` (mỗi ý có `evidence`), `risks[]`, `recommendations[]` (`priority`, `shops`, `kpi`, `owner`, `deadline`), `dataGaps[]`.
   - Cấm mô hình đưa ra số không có trong đầu vào; dùng tiếp `aiValidation` để đối chiếu số.
   - Lưu thêm `inputHash` và `analyzedReportsUpdatedAt` vào `opsConfig/managerWeekAi_{tuần}`.
2. **Kiểm tra quyền phía máy chủ** của `analyzeManagerWeekNow` không kiểm chứng được từ repo này. Cần xác nhận hàm trả 403 với tài khoản không phải quản lý; theo ghi chú trong app, các job này đã giới hạn cho quản lý.
3. **Firestore rules**: cần cho quản lý quyền ghi `opsConfig/managerWeekCommit_*` và `opsConfig/managerWeekEvalConfig`. Quản lý hiện đã ghi được nhiều tài liệu `opsConfig` khác, nhưng nếu rules liệt kê từng tài liệu cụ thể thì phải thêm 2 mẫu này. Nếu bị chặn, nút Lưu sẽ báo "Lỗi lưu: Missing or insufficient permissions".
4. Chưa kiểm thử với dữ liệu Firebase thật (môi trường làm việc không đăng nhập được app). Lần đầu mở, nên đối chiếu Phần 2 với tab Doanh thu cho 1–2 nhà thuốc.
