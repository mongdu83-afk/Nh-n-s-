// Kiểm thử "Trung tâm hành động khách hàng" (nâng cấp CRM 19/10/2026): lý do, ưu tiên, chống trùng, kết quả chuẩn, gợi ý an toàn.
// Chạy: node --test tests/careAction.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// CAREACT-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// CAREACT-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__t = { CARE_OUTCOMES, careBuildRow, careOutcomeEffect, careSuggestion, careTrustedCycle, careItemTrusted, careIsRxText };", ctx);
const T = ctx.__t;
const today = "2026-10-19";
const item = (o) => ({ productId:"P1", productName:"Thuốc A", lastDate:"2026-09-19", lastQty:2, unit:"hộp", confidence:"Cao", daysLeft:0, runOutDate:"2026-10-19", ...o });

test("Bộ kết quả chuẩn có đủ 9 kết quả theo đặc tả", () => {
  assert.deepEqual([...T.CARE_OUTCOMES.map(o => o.label)], ["Đã trao đổi, khách còn nhu cầu","Khách dự kiến quay lại","Đã mua tại Upharma","Còn hàng, hẹn liên hệ lại",
    "Không liên hệ được","Đã mua nơi khác","Không còn nhu cầu","Khách không muốn nhận thông tin","Cần hỗ trợ chuyên môn hoặc xử lý phản ánh"]);
});

test("Kết quả → lịch hẹn / tạm ẩn / từ chối nhận tin / ngưng nhắc sản phẩm", () => {
  const a = T.careOutcomeEffect("con_hang", today, null);
  assert.equal(a.next, "2026-10-26"); assert.equal(a.snoozeUntil, "2026-10-26");
  assert.equal(T.careOutcomeEffect("se_quay_lai", today, "2026-10-22").next, "2026-10-22");
  assert.equal(T.careOutcomeEffect("se_quay_lai", today, "2026-10-01").next, "2026-10-22", "ngày hẹn trong quá khứ → dùng mặc định");
  assert.equal(T.careOutcomeEffect("mua_noi_khac", today).snoozeUntil, "2026-11-18");
  assert.equal(T.careOutcomeEffect("khong_lien_he", today).snoozeUntil, "2026-10-20");
  const o = T.careOutcomeEffect("tu_choi", today); assert.equal(o.optOut, true); assert.equal(o.replResult, "Ngưng dùng");
  assert.equal(T.careOutcomeEffect("het_nhu_cau", today).replResult, "Ngưng dùng");
  assert.equal(T.careOutcomeEffect("can_ho_tro", today).needSupport, true);
  assert.equal(T.careOutcomeEffect("xyz", today), null);
});

test("Khách 1 dòng, gộp lý do từ nhắc tái mua + phân khúc; khách từ chối nhận tin bị loại", () => {
  const r = T.careBuildRow({ phone:"0901", cust:{ name:"Lan", shop:"SHOP01", segments:["Có nguy cơ rời bỏ"], stats:{ lastPurchaseAt:"2026-08-01" } },
    repl:{ phone:"0901", items:[item()] } }, today);
  assert.deepEqual([...r.reasons.map(z => z.code)], ["den_ky", "roi_bo"]);
  assert.equal(r.prio.key, "tb");
  assert.equal(T.careBuildRow({ phone:"0901", cust:{ careOptOut:true, segments:["Có nguy cơ rời bỏ"] } }, today).excluded, "optOut");
});

test("Không đoán ngày hết thuốc khi chỉ có nhịp chung của khách khác", () => {
  const r = T.careBuildRow({ phone:"0902", repl:{ phone:"0902", items:[item({ confidence:"Theo SP" })] } }, today);
  assert.equal(r.reasons[0].code, "co_the_mua");
  assert.match(r.reasons[0].detail, /chưa đủ dữ liệu/);
  assert.equal(T.careItemTrusted(item({ lastQty:0 })), false);
  // sản phẩm đã ghi liên hệ → không nhắc lại
  assert.equal(T.careBuildRow({ phone:"0903", repl:{ phone:"0903", items:[item({ contact:{ result:"x" } })] } }, today).excluded, "none");
});

test("VIP: dùng chu kỳ cá nhân đáng tin, không thì ngưỡng chung 21 ngày", () => {
  const vip = (days, intel) => T.careBuildRow({ phone:"0904", cust:{ segments:["VIP (chăm sóc tự động)"], stats:{ lastPurchaseAt: new Date(Date.parse(today) - days * 864e5).toISOString().slice(0,10) }, intelligence:intel } }, today);
  assert.equal(vip(25, null).reasons[0].code, "vip");
  assert.equal(vip(15, null).excluded, "none");
  assert.equal(vip(15, { avgCycleDays:7, cycleConfidence:"cao" }).reasons[0].code, "vip", "chu kỳ 7 ngày → 15 ngày đã là lâu");
  assert.equal(vip(25, { avgCycleDays:30, cycleConfidence:"trung bình" }).excluded, "none", "chu kỳ 30 ngày → 25 ngày chưa lâu");
  assert.equal(T.careTrustedCycle({ avgCycleDays:30, cycleConfidence:"thấp" }), null);
});

test("Lịch hẹn đến hạn lên đầu; có liên hệ hoặc mua sau lúc hẹn thì không còn", () => {
  const appt = { nextFollowUpDate:"2026-10-18", createdAtTs:"2026-10-11T09:00:00Z", note:"hẹn gọi lại" };
  const r = T.careBuildRow({ phone:"0905", cust:{ segments:["Giảm tần suất mua"], lastInteractionTs:"2026-10-11T09:00:00Z" }, appt }, today);
  assert.equal(r.reasons[0].code, "hen"); assert.match(r.reasons[0].detail, /trễ 1 ngày/);
  assert.equal(T.careBuildRow({ phone:"0905", cust:{ lastInteractionTs:"2026-10-15T09:00:00Z" }, appt }, today).excluded, "none");
  assert.equal(T.careBuildRow({ phone:"0905", cust:{ stats:{ lastPurchaseAt:"2026-10-14" } }, appt }, today).excluded, "none");
});

test("Tạm ẩn theo kết quả trước, trừ khi cần hỗ trợ chuyên môn", () => {
  const segs = ["Có nguy cơ rời bỏ"];
  assert.equal(T.careBuildRow({ phone:"0906", cust:{ segments:segs, careSnoozeUntil:"2026-11-01" } }, today).excluded, "snooze");
  const r = T.careBuildRow({ phone:"0906", cust:{ segments:segs, careSnoozeUntil:"2026-11-01", careLast:{ code:"can_ho_tro", at:"2026-10-18T01:00:00Z", note:"khách phản ánh" }, lastInteractionTs:"2026-10-18T01:00:00Z" } }, today);
  assert.equal(r.reasons[0].code, "ho_tro"); assert.equal(r.prio.key, "cao");
});

test("Gợi ý: hỏi nhu cầu trước; thuốc kê đơn / chưa rõ loại không tư vấn mua lại", () => {
  const row = { reasons:[{ code:"den_ky" }], items:[item(), item({ productId:"P2", productName:"Thuốc B" }), item({ productId:"P3", productName:"Vitamin C" })] };
  const s0 = T.careSuggestion(row, false, {});
  assert.equal(s0.offer.length, 0); assert.notEqual(s0.zaloKind, "refill");
  const s1 = T.careSuggestion(row, true, { P1:true, P2:null, P3:false });
  assert.match(s1.offer[0], /kê đơn/); assert.match(s1.offer[1], /chưa rõ/); assert.match(s1.offer[2], /giữ hàng/);
  assert.equal(s1.zaloKind, "refill");
  assert.match(s1.safety, /Không hướng dẫn khách tự đổi liều/);
  assert.equal(T.careIsRxText("Thuốc kê đơn"), true); assert.equal(T.careIsRxText("Thuốc không kê đơn"), false); assert.equal(T.careIsRxText(""), null);
});

test("Không liên hệ được: gọi lại hôm sau, đủ 3 lần liên tiếp thì tạm dừng 14 ngày", () => {
  const e1 = T.careOutcomeEffect("khong_lien_he", today, null, null);
  assert.equal(e1.noContactCount, 1); assert.equal(e1.snoozeUntil, "2026-10-20");
  const e2 = T.careOutcomeEffect("khong_lien_he", today, null, { code:"khong_lien_he", noContactCount:1 });
  assert.equal(e2.noContactCount, 2);
  const e3 = T.careOutcomeEffect("khong_lien_he", today, null, { code:"khong_lien_he", noContactCount:2 });
  assert.equal(e3.noContactCount, 3); assert.equal(e3.snoozeUntil, "2026-11-02");
  assert.equal(T.careOutcomeEffect("khong_lien_he", today, null, { code:"da_mua" }).noContactCount, 1);
  // sản phẩm nhắc tái mua đã "không liên hệ được" vẫn còn trong danh sách để gọi lại
  const r = T.careBuildRow({ phone:"0907", cust:{ careLast:{ code:"khong_lien_he", noContactCount:1 } }, repl:{ phone:"0907", items:[item({ contact:{ result:"Không liên hệ được" } })] } }, today);
  assert.equal(r.reasons[0].code, "den_ky"); assert.equal(r.noContact, 1);
});
