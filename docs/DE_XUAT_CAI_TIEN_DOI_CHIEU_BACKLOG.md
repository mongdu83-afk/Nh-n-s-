# Đề xuất cải tiến vận hành kinh doanh: đối chiếu với app, danh sách việc và kết quả đợt 1

Tài liệu nguồn: *Upharma — Đề xuất cải tiến chức năng vận hành kinh doanh* (chị Hà, 14/10/2026).
Mã nguồn đối chiếu: `index.html` trên `main` tại commit `849acdb`, gồm cả các cải tiến chị đã đẩy ngày 13–14/10.

Thực hiện đúng mục 8 của tài liệu: đối chiếu từng yêu cầu với module đang có, ghi rõ phần đã có / còn thiếu / trùng lặp, lập danh sách việc P0/P1/P2, rồi mới sửa.

## 0. Về bản "Báo cáo tổng hợp tuần" em làm ngày 13/10

Chị đã tự làm "Báo cáo tổng hợp tuần 7 phần" trên `main` (`WeeklyEvalPanel` dùng `opsConfig/managerWeekAi_{tuần}.scorecard`, `managerCommitments`, `lrWeekEval` trong Báo cáo lãnh đạo). Bản em làm ngày 13/10 ở nhánh này trùng chức năng. Theo nguyên tắc "một nghiệp vụ — một nguồn dữ liệu — một quy trình", em đã **hoàn tác bản của em** (commit `Revert …`, lịch sử vẫn giữ) và làm tiếp trên bản của chị.

## 1. Đối chiếu yêu cầu với chức năng hiện có

Chú thích: **Có** = đã đáp ứng phần lớn · **Một phần** = có khung nhưng thiếu ý quan trọng · **Thiếu** = chưa có. Mức đối chiếu: *rà kỹ* = đã đọc code luồng chính; *rà nhanh* = mới xác định module và chức năng chính, cần rà sâu trước khi sửa.

| Yêu cầu (mục 3) | Module hiện có | Đánh giá | Phần thiếu / trùng | Mức đối chiếu |
|---|---|---|---|---|
| **P0 Doanh thu:** mục tiêu, thực tế, % hoàn thành, phần thiếu, tốc độ cần đạt | Doanh thu → Theo kỳ (`TargetCompletionTable`: thực tế, target, TL đạt, dự kiến, target ngày) | Có | — | rà kỹ |
| P0 Doanh thu: phân rã số đơn, TBB, nhóm hàng/SKU, ngày trong tuần, so kỳ đối chứng | "So sánh theo kỳ" (2 khoảng tuỳ chọn), "Theo ngành" | Một phần | Chưa có **chẩn đoán theo từng nhà thuốc** gộp các chỉ số thành nhận định; chưa có ngày trong tuần; vấn đề DT01 luôn ghi cứng "Chưa đủ dữ liệu xác định nguyên nhân" dù đã có dữ liệu | rà kỹ |
| P0 Doanh thu: xếp hạng theo khoảng cách / nguy cơ, không theo doanh thu tuyệt đối | Bảng target xếp theo thứ tự cửa hàng; Báo cáo lãnh đạo xếp theo target | Thiếu | Chưa có bảng xếp theo nguy cơ không đạt | rà kỹ |
| P0 Doanh thu: đề xuất theo tín hiệu thực tế, không đổ cho nhân viên | DT01: chỉ "giao CHT rà soát" | Thiếu | Không có đề xuất gắn với tín hiệu | rà kỹ |
| P0 Doanh thu: phân biệt dữ liệu đã xác nhận / chưa cập nhật | Dấu `*` khi số thực đạt lấy tạm từ POS (`fromOrders`); hiện "Tính lúc…" | Một phần | Chưa đưa trạng thái này vào kết luận; chưa cảnh báo số POS cũ | rà kỹ |
| **P0 KPI:** tách KPI kết quả và KPI hoạt động; dự báo cuối kỳ nêu giả định | KPI, `dailyKpiPace` (dự kiến cuối tháng), Nhịp vận hành | Một phần | Dự báo chưa nêu giả định | rà nhanh |
| P0 KPI: kế hoạch bù KPI (mức thiếu, hành động, người, hạn, chỉ số cam kết) | Không có ("kế hoạch bù" không xuất hiện trong code) | Thiếu | — | rà kỹ |
| P0 KPI: xét ngày công, ca, nghỉ phép trước khi so sánh nhân viên | Có dữ liệu ca / đăng ký làm việc; xếp hạng nhân viên so với trung bình | Một phần | So sánh nhân viên chưa chuẩn hoá theo ngày công | rà nhanh |
| **P0 Hàng hoá:** cận hạn, tồn cao bán chậm, thiếu hàng, điều chuyển có SKU, nguồn/đích, số lượng, căn cứ | Hàng hoá & tồn kho, `transferSuggestions`, `externalInventoryExpiry`, `lostSalesSummary`, dự trù POS, phiếu điều chuyển, vấn đề HH01/02/03/06 khép kín | Có | Cần kiểm tra: phân biệt "tồn 0" với "chưa cập nhật"; điều chuyển có xét nhu cầu nơi nhận | rà nhanh |
| **P1 CTKM:** theo chương trình/NT/SKU, chưa đạt, kỳ đối chứng, gợi ý tiếp tục/điều chỉnh/dừng | Khuyến mại (Theo dõi chiến dịch, So sánh theo kỳ, đơn bỏ lỡ), `promoEffectNow` | Một phần | Chưa có kết luận "tiếp tục / điều chỉnh / dừng" kèm căn cứ; chưa lưu dự báo vs thực tế từng đợt | rà nhanh |
| **P1 CRM:** danh sách theo quy tắc, phân công, kết quả chuẩn hoá, tỷ lệ quay lại | Khách hàng (phân khúc, danh sách gọi, chăm sóc), `ketQuaLoai` bắt buộc (chị thêm 14/10), `computeCareOutcomes` | Có | Cần thống nhất cửa sổ thời gian "quay lại" | rà nhanh |
| **P1 Employee360:** đa chiều, kế hoạch cải thiện 7/14 ngày | Hồ sơ nhân viên 360 (KPI, việc, checklist, luyện tình huống), "Giao việc cải thiện năng suất" | Một phần | Chưa có kế hoạch cải thiện có chỉ số đầu kỳ, mục tiêu và đánh giá lại | rà nhanh |
| **P1 Action Center:** 1 hồ sơ / vấn đề, bằng chứng, chỉ số cam kết, tách "xong việc" và "vấn đề đã giải quyết", mở lại | `issueActions` + `issueHistory` (NEW → IN_PROGRESS → PENDING_VERIFICATION → RESOLVED / REOPENED → CLOSED), chặn việc trùng, "Xong chưa đạt", "Hiệu quả sau xử lý" | Có | **Lỗi:** đo kết quả DT01 đọc lại đúng các ngày *trước* khi giao nên trước = sau; chưa có chỉ số cam kết định lượng | rà kỹ |
| **P1 Command Center + AI báo cáo tuần** | Tổng quan điều hành, AI điều hành, Báo cáo quản lý / lãnh đạo, `WeeklyEvalPanel` của chị | Có | — (bản trùng của em đã hoàn tác) | rà nhanh |
| **P2 Checklist & sức khoẻ NT:** phân loại lỗi theo mức ảnh hưởng, xác minh sau khắc phục | Checklist ngày, `computeShopHealth` (điểm theo nhóm) | Một phần | Chưa phân loại lỗi checklist theo mức nghiêm trọng / tái diễn | rà nhanh |
| **P1 Mở nhà thuốc mới:** benchmark, lộ trình 30/60/90 ngày | "Kế hoạch mở nhà thuốc mới (AI chọn nhà thuốc tương đồng làm chuẩn)", DNA & cụm | Một phần | Cần đối chiếu lộ trình 30/60/90 và so kế hoạch với thực tế | rà nhanh |

## 2. Danh sách việc (backlog)

| # | Ưu tiên | Việc | Lý do nghiệp vụ | Phạm vi | Phương án | Trạng thái |
|---|---|---|---|---|---|---|
| 1 | P0 | Chẩn đoán doanh thu từng nhà thuốc + xếp hạng nguy cơ | Quản lý chưa trả lời được "vì sao" và "nhà thuốc nào nguy cơ nhất" | Doanh thu → Theo kỳ; vấn đề DT01 | Bộ chẩn đoán `rvdDiagnose` dùng chung | **Xong đợt 1** |
| 2 | P0 | Kế hoạch bù doanh thu có chỉ số cam kết | Mỗi KPI chưa đạt phải có kế hoạch, người, hạn, đánh giá lại | Giao việc từ DT01 | Mô tả việc + trường `commitTarget` / `checkDate`; dùng luồng giao việc sẵn có | **Xong đợt 1** |
| 3 | P0 | Sửa lỗi đo kết quả DT01 | "Sau xử lý" đang trùng "trước xử lý" → đánh giá hiệu quả sai | `measureResult` | Đo các ngày sau ngày giao, so với trước và với cam kết | **Xong đợt 1** |
| 4 | P0 | Kế hoạch bù cho KPI nhân viên (NS01) | Tương tự mục 2 cho cấp nhân viên | Vấn đề NS01, KPI | Tái dùng mẫu của mục 2, xét ngày công / ca | Chưa làm |
| 5 | P0 | Dự báo KPI nêu giả định + chuẩn hoá so sánh theo ngày công | Tránh so sánh nhân viên khi khác số ca | KPI, xếp hạng nhân viên | Chia theo ngày công thực tế | Chưa làm |
| 6 | P0 | Hàng hoá: phân biệt "tồn 0" với "chưa cập nhật"; điều chuyển xét nhu cầu nơi nhận | Tránh điều chuyển sai | Hàng hoá, `transferSuggestions` | Rà backend trước khi sửa | Chưa rà sâu |
| 7 | P1 | CTKM: kết luận tiếp tục / điều chỉnh / dừng + lưu kết quả từng đợt | Rút kinh nghiệm sau mỗi đợt | Khuyến mại | Thêm kết luận có căn cứ vào "Theo dõi chiến dịch" | Chưa làm |
| 8 | P1 | Employee360: kế hoạch cải thiện 7/14 ngày | Đo hiệu quả kèm cặp | Hồ sơ nhân viên | Chỉ số đầu kỳ → mục tiêu → đánh giá lại | Chưa làm |
| 9 | P1 | Action Center: chỉ số app (thời gian phát hiện → giao việc, tỷ lệ giải quyết, tái diễn) | Mục 5 của tài liệu | Việc cần xử lý → Hiệu quả sau xử lý | Tính từ `issueHistory` | Chưa làm |
| 10 | P2 | Checklist: phân loại lỗi theo mức nghiêm trọng / tái diễn | Điểm tổng không che lỗi nặng | Checklist, sức khoẻ NT | — | Chưa làm |

## 3. Kết quả đợt 1 (mẫu nghiệm thu mục 7)

**Chức năng:** chẩn đoán doanh thu nhà thuốc, xếp hạng nguy cơ, kế hoạch bù, đo kết quả sau xử lý.

**Những gì thay đổi trong app:**
- **Doanh thu → Theo kỳ:**
  - Khi xem "Tất cả": thêm bảng **"Nguy cơ không đạt & chẩn đoán theo nhà thuốc"**, xếp theo dự báo thấp nhất. Bấm một dòng để xem chẩn đoán.
  - Khi chọn một nhà thuốc: thêm khối **"Chẩn đoán doanh thu"**.
  - Quản lý có nút **"Mở hồ sơ xử lý"**. Nút này mở đúng hồ sơ DT01 của nhà thuốc (cùng hồ sơ với màn Hồ sơ nhà thuốc), nên không tạo việc trùng.
- **Vấn đề DT01:**
  - Thay câu gán cứng "Chưa đủ dữ liệu xác định nguyên nhân" bằng chẩn đoán thật.
  - Nút Giao việc điền sẵn nội dung: vấn đề, dữ kiện, giả thuyết cần xác minh, hành động đề xuất, chỉ số cam kết, mốc kiểm tra, bằng chứng cần nộp. Kèm trường `commitTarget` / `checkDate`.
  - Đo kết quả dùng các ngày **sau** ngày giao việc và kết luận ĐẠT / CHƯA ĐẠT so với cam kết.
  - "Lưu kinh nghiệm" ghi nguyên nhân, cách xử lý và kết quả thật thay vì để trống.

**Quy tắc chẩn đoán** (ngưỡng đề xuất, khai báo ở `RVD_RULES`):

| Mục | Cách tính |
|---|---|
| Phần thiếu | Chỉ tiêu − thực tế |
| Cần/ngày | Phần thiếu ÷ số ngày còn lại |
| Dự báo | Thực tế + tốc độ hiện tại × số ngày còn lại. Luôn ghi rõ giả định giữ nguyên tốc độ, chưa tính lễ, CTKM, nghỉ |

Trạng thái:
- Tháng đang chạy: dự báo ≥ 100% → Đúng tiến độ · 90–100% → Có nguy cơ · < 90% → Nguy cơ cao.
- Tháng đã qua: Đã đạt hoặc Không đạt.
- Số thực đạt chưa xác nhận (lấy tạm từ POS) → đổi sang màu vàng "cần xác minh".
- Số POS cũ hơn 36 giờ → cảnh báo "chưa cập nhật".

Phân rã: so 7 ngày gần nhất với 7 ngày liền trước (cùng các thứ trong tuần). Chênh lệch doanh thu được tách thành phần do số bill và phần do TB bill; xem thêm số mã/bill, tỷ trọng hàng hệ số, và ngày yếu trong tuần (28 ngày gần nhất).

Giả thuyết chỉ được đưa ra khi chỉ số vượt ngưỡng:

| Tín hiệu | Ngưỡng |
|---|---|
| Số bill | giảm ≥ 10% |
| TB bill | giảm ≥ 8% |
| Số mã/bill | giảm ≥ 10% |
| Tỷ trọng hàng hệ số | giảm ≥ 3 điểm % |
| Ngày trong tuần | thấp hơn trung bình ≥ 15% |

Mỗi giả thuyết có căn cứ và mức chắc chắn, và mỗi đề xuất gắn với một giả thuyết. Không có tín hiệu thì kết luận "Chưa đủ dữ liệu để kết luận nguyên nhân" và chỉ đề xuất CHT rà soát. Báo cáo luôn ghi rằng hệ thống không có lượt khách vào cửa, nên không quy kết cho nhân viên.

**Kiểm thử:** `node --test tests/revenueDiagnosis.test.js` cho kết quả **9/9 ĐẠT**.

| Tình huống đầu vào | Kết quả kỳ vọng | Kết luận |
|---|---|---|
| NT, tháng 10, ngày 15/10: target 400 tr, đạt 119 tr; số bill 7 ngày gần nhất −30% | Thiếu 281 tr, cần 16,5 tr/ngày (+94,5% so với tốc độ hiện tại), dự báo 65,9% kèm giả định, "Nguy cơ cao"; dữ kiện số bill −30%; giả thuyết "lượng đơn giảm" (mức Trung bình); đề xuất kéo khách quay lại; kế hoạch bù có cam kết ≥ 16,5 tr/ngày và mốc kiểm tra 18/10 | ĐẠT |
| Không có chỉ tiêu, không có dữ liệu ngày | "Chưa đủ dữ liệu để kết luận", không có số, không có kế hoạch bù; chỉ tiêu = 0 không gây chia cho 0 | ĐẠT |
| Thiếu doanh thu nhưng các chỉ số không đổi | Không đưa giả thuyết; "Chưa đủ dữ liệu để kết luận nguyên nhân"; chỉ đề xuất CHT rà soát; không có từ quy kết nhân viên | ĐẠT |
| Số thực đạt lấy tạm từ POS, số POS cũ 3 ngày | Đúng tiến độ nhưng màu vàng "cần xác minh" + cảnh báo chưa cập nhật | ĐẠT |
| 3 NT: doanh thu lớn dự báo 88%, nhỏ 105%, vừa 97% | Thứ tự: lớn (88%) → vừa → nhỏ | ĐẠT |
| TB bill, số mã/bill, hàng hệ số giảm; Chủ nhật thấp | Đủ 4 giả thuyết, không có giả thuyết số bill, ngày yếu = Chủ nhật | ĐẠT |
| Tháng 9 đã qua, đạt 93,8% | "Không đạt", không có kế hoạch bù | ĐẠT |
| Giao việc 10/10; các ngày sau đạt 18 tr/ngày, cam kết 16,5 tr | Đo 11–14/10, bình quân 18 tr, ĐẠT, gợi ý "Hiệu quả"; giao hôm qua → chưa đo được | ĐẠT |
| Nội dung giao việc | Đủ 7 mục: vấn đề, dữ kiện, giả thuyết, hành động, cam kết, mốc kiểm tra, bằng chứng | ĐẠT |
| Render giao diện (Chromium 1200px và 390px) | Không lỗi console, không tràn ngang, mở đúng hồ sơ NT khi bấm nút | ĐẠT |
| Luồng thật trên Firebase: mở DT01 → giao việc → đo → đánh giá | — | **CHƯA KIỂM THỬ** (môi trường làm việc không đăng nhập được app) |

**Giới hạn:**
- Không có lượt khách vào cửa, nên không tách được "ít khách" với "khách không mua".
- Chưa phân rã theo nhóm hàng/SKU trong chẩn đoán; dữ liệu nằm ở tab "Theo ngành", sẽ nối ở đợt sau.
- So sánh 7 ngày cần ít nhất 14 ngày dữ liệu theo ngày; dữ liệu POS theo ngày chỉ lưu khoảng 30–90 ngày gần nhất.
- Kết quả sau xử lý chịu ảnh hưởng của nhiều yếu tố khác (mùa vụ, CTKM, ngày lễ). App chỉ đo, không khẳng định doanh thu tăng là nhờ việc đã giao.

**Không ảnh hưởng chức năng cũ:**
- Các loại vấn đề khác (HH, NS, KH, VH) không đổi.
- Hồ sơ DT01 cũ đã đo theo cách cũ vẫn hiển thị bảng trước/sau như trước.
- Không thêm collection mới; chỉ thêm trường `revenuePlan` vào `issueActions` và các trường cam kết vào `tasks`.
