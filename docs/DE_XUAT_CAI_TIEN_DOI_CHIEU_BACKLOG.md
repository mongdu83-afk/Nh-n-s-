# Đề xuất cải tiến vận hành kinh doanh: đối chiếu, danh sách việc và bàn giao

- **Tài liệu nguồn:** *Upharma — Đề xuất cải tiến chức năng vận hành kinh doanh* (chị Hà, 14/10/2026).
- **Mã nguồn:** `index.html` trên `main` (commit `849acdb`, gồm các cải tiến chị đẩy ngày 13–14/10), làm tiếp trên nhánh `claude/upharma-app-folder-tlupz4`.
- **Cách làm** theo mục 8 của tài liệu: đối chiếu yêu cầu với module có sẵn, lập danh sách việc P0/P1/P2, rồi mới sửa. Không tạo module mới khi mở rộng được luồng hiện có, và không thay công thức nghiệp vụ.

## 0. Về bản "Báo cáo tổng hợp tuần" em làm ngày 13/10

Chị đã có `WeeklyEvalPanel` trên `main`, nên bản em làm ngày 13/10 bị trùng. Em đã hoàn tác (commit `Revert …`, lịch sử vẫn giữ) để giữ nguyên tắc một nghiệp vụ — một nguồn.

## 1. Đối chiếu yêu cầu và trạng thái sau khi làm

| Yêu cầu | Trước | Sau | Ở đâu trong app |
|---|---|---|---|
| **P0 Doanh thu:** mục tiêu, thực tế, % hoàn thành, phần thiếu, tốc độ cần đạt | Có | Có | Doanh thu → Theo kỳ |
| P0 Doanh thu: phân rã số đơn, TBB, SKU/bill, hàng hệ số, ngày trong tuần, kỳ đối chứng | Một phần | **Có** | Doanh thu → Theo kỳ → bảng nguy cơ / chẩn đoán; vấn đề DT01 |
| P0 Doanh thu: xếp theo nguy cơ, không theo doanh thu tuyệt đối | Thiếu | **Có** | Bảng "Nguy cơ không đạt & chẩn đoán" |
| P0 Doanh thu: đề xuất theo tín hiệu, không đổ cho nhân viên | Thiếu | **Có** | Chẩn đoán: dữ kiện / giả thuyết / đề xuất |
| P0 Doanh thu: phân biệt dữ liệu đã xác nhận / chưa cập nhật | Một phần | **Có** | Đánh dấu "cần xác minh", cảnh báo số POS cũ |
| **P0 KPI:** dự báo nêu giả định và thời gian còn lại | Một phần | **Có** | Banner tiến độ KPI, vấn đề NS01 |
| P0 KPI: kế hoạch bù (mức thiếu, hành động, người, hạn, cam kết, đánh giá lại) | Thiếu | **Có** | Vấn đề NS01 → "Giao kế hoạch bù KPI"; DT01 → "Kế hoạch bù doanh thu" |
| P0 KPI: xét ngày công / ca / nghỉ trước khi so sánh | Một phần (dự báo đã tính ngày làm) | **Có** | Kế hoạch bù tính theo ngày làm còn lại; nhắc kiểm tra ca; ghi chú ở bảng xếp hạng |
| P0 KPI: gợi ý huấn luyện theo chỉ số yếu có bằng chứng | Thiếu | **Có** | Kế hoạch bù KPI |
| **P0 Hàng hoá:** cận hạn, tồn cao, thiếu hàng, điều chuyển có SKU / nguồn / đích / số lượng / căn cứ | Có | Có | Hàng hoá & tồn kho, vấn đề HH01/02/03/06 |
| P0 Hàng hoá: phân biệt "tồn 0" với "chưa cập nhật" | Thiếu | **Có** | Cảnh báo ở Đề xuất điều chuyển, Tiêu thụ tồn kho, vấn đề hàng hoá |
| P0 Hàng hoá: điều chuyển xét nhu cầu nơi nhận; theo dõi sau xử lý | Có (số ngày bán nơi cho → nơi nhận, đo lại sau xử lý) | Có | — |
| **P1 CTKM:** kỳ đối chứng, chưa đạt, NT yếu, gợi ý tiếp tục / điều chỉnh / dừng, lưu kết quả từng đợt | Một phần | **Có** | Khuyến mại → Theo dõi chiến dịch → "Đánh giá đợt & gợi ý quyết định" |
| **P1 CRM:** danh sách theo quy tắc, phân công, kết quả chuẩn hoá, tỷ lệ quay lại | Có | Có | Khách hàng (chị thêm `ketQuaLoai` ngày 14/10) |
| **P1 Employee360:** kế hoạch cải thiện 7/14 ngày, phân loại quy trình / nguồn lực / kỹ năng, ghi nhận hỗ trợ của quản lý | Thiếu | **Có** | Hồ sơ nhân viên → Tổng quan → "Kế hoạch cải thiện" |
| **P1 Action Center:** 1 hồ sơ / vấn đề, tách "xong việc" và "đã giải quyết", mở lại | Có | Có, đã **sửa lỗi đo DT01** | Việc cần xử lý; `issueActions` |
| P1 Action Center: tỷ lệ đúng hạn, giải quyết, tái diễn, cải thiện | Một phần | **Có** | Việc cần xử lý → Hiệu quả sau xử lý → "Chỉ số đo hiệu quả của app" |
| **P1 Command Center / AI báo cáo tuần** | Có (bản của chị) | Có | — |
| **P2 Checklist:** phân loại lỗi theo mức nghiêm trọng / tái diễn, xác minh sau khắc phục, % tổng không che lỗi nặng | Thiếu | **Có** | Checklist ngày → "Lỗi checklist theo mức nghiêm trọng & tái diễn"; chọn mức trong mẫu checklist |
| **P1 Mở nhà thuốc mới:** benchmark, lộ trình 30/60/90 | Có | Có | Nhân bản chuẩn → Mở nhà thuốc mới |
| P1 Mở nhà thuốc mới: so kế hoạch với thực tế, cập nhật bài học, nêu giả định | Thiếu | **Có** | Mỗi kế hoạch đã soạn → "Theo dõi thực tế sau khai trương" |
| **Mục 5:** chỉ số đo hiệu quả của chính app | Thiếu | **Có (7/9 chỉ số)** | "Chỉ số đo hiệu quả của app" |

## 2. Danh sách việc

| # | Ưu tiên | Việc | Trạng thái |
|---|---|---|---|
| 1 | P0 | Chẩn đoán doanh thu + xếp hạng nguy cơ | Xong |
| 2 | P0 | Kế hoạch bù doanh thu có chỉ số cam kết | Xong |
| 3 | P0 | Sửa lỗi đo kết quả DT01 (trước = sau) | Xong |
| 4 | P0 | Kế hoạch bù KPI nhân viên (NS01) theo ngày làm | Xong |
| 5 | P0 | Dự báo KPI nêu giả định; lưu ý ngày công ở bảng xếp hạng | Xong |
| 6 | P0 | Hàng hoá: cảnh báo số liệu chưa cập nhật | Xong |
| 7 | P1 | CTKM: đánh giá đợt, gợi ý quyết định, lưu kết quả từng đợt | Xong |
| 8 | P1 | Employee360: kế hoạch cải thiện 7/14 ngày | Xong |
| 9 | P1 | Chỉ số hiệu quả app (mục 5) | Xong (KPI-xu hướng chưa đo được: xem mục 4) |
| 10 | P2 | Checklist: mức nghiêm trọng, tái diễn, xác minh sau khắc phục | Xong |
| 11 | P1 | Mở nhà thuốc mới: so kế hoạch với thực tế | Xong |

## 3. Logic chính từng phần

- **Chẩn đoán doanh thu (`rvdDiagnose`)**
  - Tính phần thiếu, nhu cầu mỗi ngày còn lại, và dự báo kèm giả định giữ nguyên tốc độ.
  - So 7 ngày gần nhất với 7 ngày liền trước. Chênh lệch doanh thu được tách thành phần do số bill và phần do TB bill; xem thêm số mã/bill, tỷ trọng hàng hệ số và ngày yếu trong tuần (28 ngày gần nhất).
  - Ngưỡng tín hiệu: bill −10%, TBB −8%, số mã/bill −10%, hàng hệ số −3 điểm %, ngày yếu −15%.
  - Mỗi giả thuyết có căn cứ và mức chắc chắn. Thiếu căn cứ thì ghi "Chưa đủ dữ liệu để kết luận".
- **Kế hoạch bù KPI (`kbpPlan`)**
  - Ngày làm còn lại = số ngày lịch còn lại − số ngày nghỉ còn lại (cùng quy tắc nghỉ 4 ngày/tháng của `kpiMakeProjector`).
  - Cần mỗi ngày làm = phần thiếu ÷ ngày làm còn lại.
  - Chọn chỉ số yếu nhất (dự kiến < 85%) và gợi ý huấn luyện theo đúng chỉ số đó.
  - Khi số ca ghi nhận ít hơn mức nghỉ cho phép thì nhắc kiểm tra ca trước khi kết luận.
- **CTKM (`pmdDecide`)**
  - Kỳ đối chứng là cùng số ngày ngay trước đợt (doanh thu chuỗi theo ngày).
  - Quy tắc quyết định:

    | Điều kiện | Gợi ý |
    |---|---|
    | Doanh thu ≥ +5% và chi phí ≤ 3% doanh thu | Tiếp tục |
    | Doanh thu không giảm nhưng chi phí > 3% | Điều chỉnh |
    | Doanh thu giảm và chi phí > 3% | Dừng để xem xét |
    | Thiếu kỳ đối chứng | Chỉ đánh giá theo chi phí; không khẳng định hiệu quả tăng thêm |

  - Nhà thuốc triển khai yếu: tỷ lệ đơn có KM dưới 70% mức chuỗi, hoặc chi phí > 3% doanh thu.
- **Kế hoạch cải thiện (`ipEvaluate`):**
  - Hết kỳ: chỉ số ≥ mục tiêu → Đạt; tăng ≥ 2 điểm % → Một phần; còn lại → Chưa cải thiện.
  - Kỳ vắt sang tháng mới thì kết quả chỉ mang tính tham khảo.
- **Checklist (`clqAnalyze`)**
  - Mức nghiêm trọng lấy từ mẫu, không có thì theo từ khoá.
  - Tái diễn: bỏ sót ≥ 3 ngày tại cùng nhà thuốc.
  - Sau khi việc khắc phục hoàn thành, nếu còn bỏ sót thì ghi "Tái diễn sau khắc phục".
- **Chỉ số app (`appMetrics`):** chỉ tính từ dữ liệu có sẵn. Không có dữ liệu thì ghi "Chưa đo được" kèm lý do.
- **Nhà thuốc mới (`nsTrack`):** 3 giai đoạn so với kỳ vọng và với nhà thuốc chuẩn, kèm xu hướng giữa các giai đoạn.

## 4. Kiểm thử (mẫu nghiệm thu mục 7)

Lệnh chạy: `for f in tests/*.test.js; do node --test $f; done`. **33/33 ca ĐẠT.**

| Bộ kiểm thử | Số ca | Nội dung chính | Kết luận |
|---|---|---|---|
| `revenueDiagnosis.test.js` | 10 | Mục tiêu / thiếu / cần mỗi ngày / dự báo kèm giả định; thiếu dữ liệu → chưa đủ để kết luận; không quy kết nhân viên; số chưa xác nhận / chưa cập nhật; xếp theo nguy cơ; phân rã 4 tín hiệu + ngày yếu; tháng đã qua; đo sau giao việc; nội dung giao việc đủ 7 mục; độ mới số liệu | ĐẠT |
| `kpiRecovery.test.js` | 6 | Cần mỗi ngày làm sau khi trừ ngày nghỉ (2,8 tr/ngày, 15 ngày làm); ít ca → nhắc kiểm tra; không có ca → nói rõ dự báo theo ngày lịch; đang kịp → không có kế hoạch; tháng đã qua; nội dung giao việc | ĐẠT |
| `promoDecision.test.js` | 6 | Tiếp tục / theo dõi khi thiếu kỳ đối chứng / dừng / điều chỉnh; nhà thuốc yếu; chưa đủ dữ liệu | ĐẠT |
| `improvementPlan.test.js` | 3 | Chỉ số đầu kỳ, mục tiêu, hạn 7/14 ngày, nguyên nhân quyết định cách hỗ trợ; đạt / một phần / chưa cải thiện | ĐẠT |
| `appMetrics.test.js` | 2 | Tỷ lệ đúng giá trị; không có dữ liệu → "chưa đo được" | ĐẠT |
| `checklistQuality.test.js` | 4 | Mức nghiêm trọng; % tổng 80% vẫn nêu 5 lần bỏ sót nghiêm trọng; tái diễn; tách "đã khắc phục" với "tái diễn sau khắc phục" | ĐẠT |
| `newShopTracking.test.js` | 2 | So kỳ vọng / nhà thuốc chuẩn theo giai đoạn; ngoài vùng dữ liệu / chưa khai trương / không có kỳ vọng | ĐẠT |
| Render giao diện (Chromium 1200px và 390px) | — | Bảng nguy cơ doanh thu, đánh giá đợt KM, kế hoạch cải thiện, checklist, chỉ số app, nhà thuốc mới: không lỗi console, không tràn ngang; các nút mở hồ sơ / giao việc trả đúng dữ liệu | ĐẠT |
| Luồng thật trên Firebase | — | Đăng nhập, ghi Firestore, giao việc thật, đo kết quả thật | **CHƯA KIỂM THỬ** (môi trường làm việc không đăng nhập được app) |

## 5. Dữ liệu mới được ghi

Không thêm collection mới.

| Nơi ghi | Trường | Ai ghi |
|---|---|---|
| `tasks` (mở rộng `extra`) | `commitMetric`, `commitTarget`, `commitBaseline`, `commitText`, `checkDate` (kế hoạch bù doanh thu); `commitKind:"kpiRecovery"`, `commitPlans` (KPI); `improvementPlan` (360); `checklistItemId`, `sourceScreen:"checklistQuality"` (checklist) | Người giao việc |
| `issueActions` (thêm trường) | `revenuePlan`, `detectedAtTs`, `assignedAtTs`; `resultAfter.summary` cho DT01 | Quản lý |
| `opsConfig/promoCampaignReviews` | Quyết định từng đợt khuyến mại | Quản lý |
| `opsConfig/newPharmacyTracking` | Gắn kế hoạch mở mới với nhà thuốc thật | Quản lý |

**Cần chị kiểm tra Firestore rules:** quản lý phải ghi được 2 tài liệu `opsConfig` mới ở trên. App hiện đã có nhiều chỗ quản lý ghi `opsConfig` nên nhiều khả năng ghi được; nếu rules liệt kê cụ thể từng tài liệu thì cần thêm 2 tài liệu này.

## 6. Giới hạn và việc còn lại

- **Không có lượt khách vào cửa:** không phân biệt được "ít khách" với "khách không mua".
- **Chỉ số "nhà thuốc cải thiện khoảng cách mục tiêu"** chưa đo được: cần lưu ảnh chụp khoảng cách theo tuần (việc ở backend).
- **Thời gian phát hiện → giao việc** chỉ có số từ 14/10/2026 trở đi, vì hồ sơ cũ chưa lưu thời điểm phát hiện.
- **Bảng xếp hạng doanh thu nhân viên (30 ngày)** chưa chia theo ngày công vì khác kỳ với dữ liệu ca; mới thêm ghi chú. Đánh giá hiệu suất nên dùng tab KPI.
- **Đánh giá CTKM** dựa vào doanh thu chuỗi theo ngày, nên kỳ đối chứng chỉ có khi nằm trong vùng dữ liệu đã lưu (khoảng 30–90 ngày).
- **Checklist** chỉ tính báo cáo đã nộp; nhân viên có ca mà không nộp báo cáo vẫn xem ở bảng hiện có.
- **Kết quả sau xử lý** chịu ảnh hưởng của mùa vụ, CTKM, ngày lễ… App chỉ đo, không khẳng định doanh thu tăng là nhờ app hay nhờ việc đã giao.

## 7. Không ảnh hưởng chức năng hiện có

- Các luồng cũ giữ nguyên. Phần mới chỉ thêm khối hiển thị, thêm nội dung giao việc và thêm trường dữ liệu.
- Thay đổi hành vi duy nhất: "Đo kết quả" của DT01 nay dùng các ngày **sau** khi giao việc. Hồ sơ DT01 đã đo theo cách cũ vẫn hiển thị bảng trước/sau như trước.
