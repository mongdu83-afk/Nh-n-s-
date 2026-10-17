# Rà soát năng lực vận hành Upharma Ops cho Quản lý khu vực (17/10/2026)

Phạm vi: `index.html` (app), `scripts/`, `tests/`, `.github/workflows/`.
**Không có trong repo nên KHÔNG xác minh được:** mã Cloud Functions, `firestore.rules` / `storage.rules`
(nằm ở repo `upharma-cloud-functions`). Mọi điểm về quyền ở máy chủ dưới đây là suy luận hoặc dựa trên
`tests/rules/rules.test.js`, không được coi là "đạt".

Ký hiệu: **XM** = đã xác minh bằng đọc mã · **SL** = suy luận · **MC** = phụ thuộc máy chủ, chưa kiểm được.
Trạng thái: ✅ đã sửa (có kiểm thử) · 🟡 sửa một phần · ⬜ chưa làm.

---

## Đợt 1 — P0 đã triển khai (17/10/2026)

| # | Hiện trạng đã xác minh | Rủi ro | Vị trí mã | Tác động QLKV | Giải pháp đã làm | Nghiệm thu | Chức năng có thể ảnh hưởng | TT |
|---|---|---|---|---|---|---|---|---|
| P0-1 | Tab KPI tự điền "nâng hạng khách hàng" ngay khi đổi tháng, lúc dữ liệu tháng mới chưa tải → ghi **0**, kể cả **tháng cũ** (XM) | Kết quả KPI tháng cũ bị đổi chỉ vì có người mở xem | `KpiView`: các effect tự điền (`pickedUpgradeCount`, `myUpgradeCount`, `planDerived`, cận date) | Điểm KPI sai, phụ thuộc ai mở màn hình nào | Chỉ tự điền khi dữ liệu **đúng tháng** đã tải (`kpiLoaded`); số nâng hạng chỉ tự điền **tháng hiện tại** | Đổi qua tháng cũ không phát sinh ghi `kpiAssignments` | Tự điền chỉ tiêu/kết quả từ hệ thống bán hàng | ✅ |
| P0-2 | Mỗi lần tự điền gọi `saveActual` → đặt `trangThaiDuyet:""` (XM) | "QLKV đã duyệt" bị xoá sau mỗi lần đồng bộ | `KpiView.saveActual/saveTarget` | Phải duyệt lại liên tục, mất dấu đã chốt | Ghi **tự động** bỏ qua KPI đã duyệt; sửa **tay** vẫn huỷ duyệt như cũ | KPI đã duyệt giữ nguyên sau đồng bộ | Duyệt KPI, xuất HR | ✅ |
| P0-3 | Nhân viên đã nghỉ đăng nhập vẫn vào app đầy đủ; vẫn nhận thông báo của nhà thuốc (XM) | Người đã nghỉ xem dữ liệu khách hàng/KPI | `App` (sau `myStaff`), `fcmTokens` | Rò rỉ dữ liệu | Màn hình "Tài khoản đã ngừng hoạt động" + gỡ thiết bị nhận thông báo | Tài khoản có ngày nghỉ ≤ hôm nay chỉ thấy màn hình chặn | Khôi phục nghỉ việc (bỏ ngày nghỉ) → vào lại bình thường | 🟡 — **chặn ở máy chủ còn thiếu** (MC): thu hồi phiên đăng nhập, gỡ quyền, luật Firestore |
| P0-4 | AI tự giao việc lỗi 15–17/10 không ai biết; khung giờ bị đánh dấu "đã chạy" **trước** khi làm, lỗi giữa chừng không chạy lại; đọc dữ liệu lỗi vẫn giao việc (XM) | Ngừng giao việc âm thầm; có thể giao trùng khi thiếu dữ liệu chống trùng | `runAutoAssign`, `scripts/auto-assign.js` | Tưởng AI đang chạy nhưng không | Trạng thái `running/done/partial/failed`; lỗi hoặc treo > 15 phút → lần sau chạy lại; thiếu `staff/openTasks/recentAuto/issueActions` → **dừng**; lỗi → báo điện thoại quản lý + hiện đỏ trong thẻ AI tự giao việc | `tests/autoAssignRunner.test.js` (5 ca; 3 ca FAIL trên mã cũ) | AI tự giao việc (app + máy chủ) | ✅ |
| P0-5 | AI tự giao lại DT01 dù quản lý đã "Bỏ qua" (XM) | Giao việc quản lý đã quyết không làm | `aaPlan` (rule dt01), `IssueDetailModal360.reject` | Nhiễu, mất lòng tin vào AI | Tôn trọng "Bỏ qua" tới hết tháng; lưu `rejectedAt` | `tests/autoAssign.test.js` | AI tự giao DT01 | ✅ |
| P0-6 | Tải `index.html` cũ lên `main` từng làm mất 59 chức năng và hỏng lịch AI (XM, commit `52a542d`) | Mất tính năng / hỏng máy chủ mà không ai báo | quy trình triển khai | App lùi phiên bản | `scripts/check-release.js` + workflow **Kiểm tra bản phát hành**: chạy mỗi lần `main` đổi; lỗi → đỏ + báo điện thoại | Chạy thử trên đúng commit `52a542d`: phát hiện thiếu 8 khối + mất 59 hàm | Không | ✅ (cảnh báo sau khi đã lên — muốn **chặn trước** cần bật bảo vệ nhánh, xem mục Triển khai) |

---

## Đợt 2 — P0 đã triển khai (17/10/2026)

| # | Hiện trạng đã xác minh | Đã làm | Nghiệm thu / kiểm thử | Còn lại | TT |
|---|---|---|---|---|---|
| P0-8 | Ghép nhân viên theo tên: ca làm, chỉ tiêu, nâng hạng, nhập Excel; trường "Tên trên hệ thống" có nhưng không dùng; nhập Excel không có cột nhà thuốc → lấy người trùng tên đầu tiên | `staffNameKeys()` dùng "Tên trên hệ thống" (nhiều tên, dấu phẩy) cho ca làm, chỉ tiêu, nâng hạng, AI giao theo ca; nâng hạng ghép tên + nhà thuốc; nhập Excel trùng tên → báo "trùng tên — cần cột Nhà thuốc", không ghi; Danh sách nhân viên cảnh báo nhóm trùng tên | `tests/staffMatching.test.js` (3), ca mới trong `autoAssign.test.js` (FAIL trên mã cũ) | Ca làm từ hệ thống ngoài không có mã nhà thuốc → người trùng tên **bắt buộc** điền "Tên trên hệ thống" khác nhau; khớp theo mã nhân viên cần máy chủ (MC) | 🟡 |
| P0-10 | Đóng vấn đề đi tắt; giao việc từ Tổng quan không ghi hồ sơ; "Chi tiết" mở bằng chứng tồn kho cho mã không liên quan; trạng thái ACKNOWLEDGED mất nút giao việc; CHT báo xong việc AI/rủi ro ở Action Center tự đóng | Shop360: vấn đề đo được đang xử lý → nút "Đo & đánh giá kết quả" (không đóng tắt); Tổng quan/Shop360: vấn đề đo được → giao trong hồ sơ (lưu số liệu trước), mã khác → tạo việc + `markIssueAssigned()` ghi ĐÃ GIAO VIỆC, xoá đánh giá chu kỳ cũ, đánh dấu tái diễn; "Chi tiết" chỉ mở hồ sơ cho mã có bằng chứng; ACKNOWLEDGED giao việc được; CHT báo xong việc có nguồn → "Chờ kiểm tra" | `tests/issueLifecycle.test.js` (3) | Rủi ro (risks) tạo việc chưa chuyển trạng thái — phụ thuộc máy chủ (MC); máy trạng thái chung (P1) | ✅ |
| P0-9 (bước 1) | ≥ 5 công thức "dự kiến %"; ngưỡng 0.85 / 95–80 viết cứng nhiều nơi; Tổng quan ghi "Dự kiến cả tháng" cho cả số lũy kế | `KPI_DEFS` (định nghĩa, ngưỡng, kỳ, nguồn) — các ngưỡng ở Tổng quan, KPI, Employee360 đọc từ đây; nhãn "Đã đạt tới hôm nay (chưa có số dự kiến)" khi máy chủ chưa có số dự kiến | 58/58 kiểm thử | Gom công thức dự kiến về 1 hàm; khối ENGINE (máy chủ cũng chạy) phải tự chứa nên giữ số riêng có ghi chú | 🟡 |
| P0-7 | `saveConfigDoc` ghi đè | **Hạ xuống P1**: chỉ 1–2 quản lý sửa cấu hình, màn hình cập nhật thời gian thực; sửa đúng cần khoá phiên bản theo từng màn sửa → làm cùng P1 | — | — | ⬜ |

## Tồn đọng — chưa làm (theo thứ tự ưu tiên)

### P0 còn lại
| # | Hiện trạng (XM/SL/MC) | Rủi ro | Vị trí | Giải pháp đề xuất | Nghiệm thu | Ảnh hưởng |
|---|---|---|---|---|---|---|
| P0-7 | `saveConfigDoc` ghi đè cả tài liệu (`merge:false`) cho `shopList`, `kpiTemplates`, `dailyChecklist`… (XM) | 2 người sửa cùng lúc → người sau xoá thay đổi người trước | `saveConfigDoc` (~1143) | Ghi theo phiên bản (transaction + `version`), báo "có người vừa sửa" | 2 lần sửa song song không mất dữ liệu | Mọi màn hình cấu hình |
| P0-8 | Khớp nhân viên theo **tên**: ca làm không lọc nhà thuốc; chỉ tiêu lấy bản ghi đầu tiên; nhập Excel không có nhà thuốc → lấy người trùng tên bất kỳ; trường `tenHeThong` có nhưng không dùng (XM) | Gán nhầm ca/doanh số/KPI cho người trùng tên | `findWorkRegsForStaffDate`, `findEmployeePlanFor`, nhập Excel KPI | Khớp tên + nhà thuốc, dùng `tenHeThong`, hiện danh sách "không khớp / trùng tên" | 2 người trùng tên ở 2 nhà thuốc có số liệu tách biệt | Checklist, KPI, ca, tự giao việc |
| P0-9 | Có ≥ 5 cách tính "dự kiến %" doanh số; màn Doanh thu hiện **2 con số dự kiến khác nhau** cùng lúc (XM) | Huấn luyện trên số sai | `kpiMakeProjectorBase`, `paceProjected`, `kbpWorkdays`, `rvdDiagnose`, `metricBlock` (MC), Productivity360 | **KPI Registry** dùng chung (công thức, kỳ, mẫu số, ngưỡng, nguồn, độ tươi tối đa) | Cùng NV/nhà thuốc/ngày → cùng % ở mọi màn hình | Mọi màn KPI/doanh thu — làm từng bước, có kiểm thử ảnh chụp số |
| P0-10 | Vòng đời vấn đề bị "đi tắt": Shop360 đóng CLOSED không cần đo; ActionCenter hoàn thành bỏ qua "Chờ kiểm tra"; trạng thái `ACKNOWLEDGED` làm mất nút Giao việc (XM) | "Xong việc" bị coi là "đã giải quyết" | `issueLife` (Shop360), `completeTask` (ActionCenter) | Một máy trạng thái; CLOSED chỉ từ RESOLVED/REJECTED có lý do | Không đường nào ghi CLOSED khi chưa đánh giá | Shop360, Action Center |
| P0-11 | Luật máy chủ chưa có kiểm thử cho: ghi `staff` (tự đổi vai trò), `opsConfig`, xoá, tự hoàn thành việc, tự sửa chỉ tiêu; kiểm thử luật không chạy tự động (XM/MC) | Leo thang quyền không phát hiện | `tests/rules/rules.test.js` | Bổ sung ca kiểm thử; chạy trong CI của repo máy chủ | CI đỏ khi NV sửa được `staff/{mình}.role` | Không (chỉ thêm kiểm thử) |

### P1
| # | Vấn đề (XM) | Giải pháp | Nghiệm thu |
|---|---|---|---|
| P1-1 | Tổng quan điều hành không có "5 việc hôm nay" xếp hạng ở đầu; 2 cách đếm "quá hạn" trên cùng trang; ô "Đỏ/Có cảnh báo" đếm nguồn khác với màn mở ra | Khối **Top 5 việc hôm nay** (rủi ro chưa giao, DT01 chưa có kế hoạch, đề xuất AI chờ duyệt, việc đến hạn đo) mỗi mục 1 nút | Màn đầu ≤ 5 việc, số khớp màn đích |
| P1-2 | Giao việc từ Tổng quan/Shop360 không cập nhật `issueActions` → vấn đề vẫn "Mới phát hiện" và không đo kết quả | Mọi nút "giao việc từ vấn đề" ghi IN_PROGRESS + số liệu trước | Sau khi giao, hồ sơ = Đang xử lý |
| P1-3 | 5 "động cơ" đánh giá rủi ro doanh thu khác ngưỡng (server health, `rvdDiagnose`, risks, shopDiagnosis, opsProposals) | 1 nguồn sự thật cho mỗi mã | DT01 giống nhau ở mọi màn |
| P1-4 | Trường công việc không chuẩn (ưu tiên có 4 tên trường; cam kết chỉ DT01); `findOpenTaskBySource` `limit(80)` có thể sót trùng | Lược đồ chuẩn `source/priority/commitment/result` + `buildTask()` | Tìm theo mã nguồn ra việc từ mọi nguồn |
| P1-5 | Việc không có liên kết "Nguồn" quay về bằng chứng; tạo việc từ rủi ro không chuyển rủi ro sang Đang xử lý | Liên kết 1 chạm, cập nhật trạng thái rủi ro | Từ việc bất kỳ mở được bằng chứng |
| P1-6 | Chu kỳ mới của `issueActions` mang đánh giá cũ (`effectiveness`) → chỉ số hiệu quả sai | Lưu chu kỳ cũ vào lịch sử, xoá trường khi giao lại | Sau mở lại + giao mới, hiệu quả = trống |
| P1-7 | ≥ 5 định nghĩa "đúng hạn" | `onTimeRateOf()` dùng chung, ghi rõ kỳ | Employee360 = Chỉ số app |
| P1-8 | Không phát hiện mẫu lỗi lặp **giữa các nhà thuốc** (chỉ checklist theo từng nhà thuốc) | Bảng "Mẫu lỗi toàn chuỗi" (≥ 3 nhà thuốc) | Có nhãn "lỗi hệ thống" |
| P1-9 | Tải dữ liệu lỗi im lặng còn nhiều (59 `catch` rỗng; vài `onSnapshot` không xử lý lỗi); độ tươi dữ liệu 3 ngưỡng khác nhau, KPI không có cảnh báo dữ liệu cũ | Mở rộng `loadFail` + `StaleDataNotice` cho mọi thẻ KPI | Nguồn lỗi → có thông báo |
| P1-10 | Đề xuất AI: "Duyệt nhanh/Giao tất cả" duyệt hàng loạt; không có trường "thiếu dữ liệu" có cấu trúc; AI tự giao việc đi ngoài luồng đề xuất | Bắt duyệt riêng mức cao/độ tin cậy thấp; `sourceRefs[]`, `missingData[]` | Mọi việc AI truy được nguồn |
| P1-11 | Đo trước–sau chỉ phủ 9 mã vấn đề; việc KPI/CTKM/checklist/nhà thuốc mới không đo | Bước "đến hạn đo" chung | Mọi việc AI có kết quả hoặc lý do không đo |
| P1-12 | Không có số liệu sử dụng app / thời gian tiết kiệm; không có ảnh chụp chênh lệch KPI theo tuần | `usageDaily`, ảnh chụp tuần | Chỉ số app có trước–sau |
| P1-13 | `fcmTokens/admin` dùng chung → chỉ thiết bị quản lý đăng ký sau cùng nhận thông báo (XM) | Lưu theo từng tài khoản quản lý | 2 máy quản lý cùng nhận |

### P2
| # | Vấn đề | Giải pháp |
|---|---|---|
| P2-1 | Đo hiệu quả doanh thu cho phép 1 ngày sau giao, không cân ngày trong tuần | Tối thiểu 7 ngày, so cùng thứ |
| P2-2 | CTKM so với cả chuỗi kỳ trước, chưa so nhà thuốc không tham gia, chưa xét sau đợt, chi phí chỉ là chiết khấu | So nhóm đối chứng + 7 ngày sau đợt |
| P2-3 | "Kinh nghiệm tương tự" chỉ lưu ca thành công → tỷ lệ thành công ảo | Lưu cả ca không hiệu quả |
| P2-4 | Phản hồi đề xuất: duyệt hàng loạt không bắt lý do; việc AI tự giao không có nút "không hữu ích" | Bắt lý do; tự tạm dừng rule bị huỷ nhiều |
| P2-5 | Chỉ số app: "đã giải quyết" chia cho số đã giao (không phải số đã đánh giá); nhãn "mở lại vì không hiệu quả" đếm nhầm sự kiện; không lọc 90 ngày | Sửa nhãn + lọc kỳ |

---

## Kiểm thử hồi quy đợt 1
- Cú pháp khối script chính: OK.
- `node --test tests/*.test.js`: đợt 1 **51/51**; sau đợt 2: 11 tệp, **58/58 đạt** (thêm `staffMatching`, `issueLifecycle`, 1 ca trùng tên trong `autoAssign`).
- Ca mới chạy trên mã cũ (`origin/main` trước đợt 1): 3/5 ca **thất bại** → chứng minh kiểm thử bắt đúng lỗi.
- `scripts/check-release.js` chạy lại trên commit lỗi `52a542d` → báo lỗi đúng.
- **Chưa kiểm thử được** (cần tài khoản/thiết bị thật): màn chặn nhân viên đã nghỉ, thông báo lỗi về điện thoại, tự điền KPI trên dữ liệu thật.

## Triển khai & hoàn nguyên
- Triển khai: gộp PR vào `main` → Netlify tự cập nhật app; GitHub Actions tự dùng bản mới. Không cần deploy Cloud Functions.
- Hoàn nguyên: GitHub → PR đã gộp → **Revert** (tạo PR hoàn nguyên) → gộp. Không có thay đổi dữ liệu/lược đồ cần hoàn nguyên;
  trường mới (`lastStatus`, `rejectedAt`, `resignedAt`) bản cũ bỏ qua được.
- Khuyến nghị: GitHub → Settings → Branches → bảo vệ `main`, bắt buộc check **Kiểm tra bản phát hành** đạt trước khi gộp → chặn được bản cũ **trước** khi lên app.

## Checklist nghiệm thu cho QLKV (đợt 1)
- [ ] Mở KPI → chọn tháng trước → quay lại tháng này: số "nâng hạng" tháng trước không đổi.
- [ ] Duyệt cuối 1 KPI → chờ lần đồng bộ sau (6h/12h/18h) → mở lại: vẫn "đã duyệt".
- [ ] Đặt ngày nghỉ = hôm nay cho 1 tài khoản thử → đăng nhập tài khoản đó: thấy "Tài khoản đã ngừng hoạt động". Bỏ ngày nghỉ → vào lại được.
- [ ] Thẻ "AI tự giao việc": sau 9h20 / 15h20 có dòng lần chạy gần nhất; nếu lỗi có dòng đỏ và điện thoại quản lý nhận thông báo.
- [ ] Bỏ qua DT01 của 1 nhà thuốc → lần chạy AI sau không giao lại DT01 nhà thuốc đó trong tháng.
- [ ] GitHub → Actions → "Kiểm tra bản phát hành" xanh sau khi gộp.

## Checklist nghiệm thu cho QLKV (đợt 2)
- [ ] Nhân viên → nếu có khung vàng "TRÙNG TÊN": Sửa từng người, điền "Tên trên hệ thống bán hàng/chấm công" đúng như trên hệ thống chấm công → khung biến mất.
- [ ] Nhập chỉ tiêu Excel có 2 người trùng tên mà không có cột Nhà thuốc → thông báo "trùng tên — cần cột Nhà thuốc", không ghi nhầm.
- [ ] Tổng quan → "＋ Việc" ở 1 vấn đề hàng hoá/nhân sự/khách hàng → mở hồ sơ vấn đề (có số liệu trước); giao xong hồ sơ = "ĐÃ GIAO VIỆC".
- [ ] Shop360 → vấn đề đang giao việc không còn nút "✓ Đã xử lý xong", chỉ "Đo & đánh giá kết quả".
- [ ] CHT báo xong 1 việc AI tự giao ở Action Center → việc sang "Chờ kiểm tra".
