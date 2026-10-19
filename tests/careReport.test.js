// Kiểm thử "Báo cáo hiệu quả chăm sóc khách" (CRM mục 6, 19/10/2026): tử số/mẫu số, không tính trùng, dữ liệu thiếu, lọc, danh sách cần xử lý.
// Chạy: node --test tests/careReport.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// CAREREPORT-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// CAREREPORT-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__t = { careReportCompute, crDay, crWeek };", ctx);
const T = ctx.__t;
const today = "2026-10-30", from = "2026-10-01", to = "2026-10-30";
const ts = (d, h) => new Date(Date.parse(d + "T00:00:00+07:00") + (h || 9) * 3600e3).toISOString();
const I = (phone, day, code, o) => ({ phone, shop:"SHOPA", staffId:"nvA", staffName:"Lan", createdAtTs:ts(day), careOutcome:code, ...(o || {}) });
const M = (r, k) => r.metrics.find(m => m.key === k);
const base = (o) => T.careReportCompute({ from, to, today, inters:[], appts:[], daily:[], custs:{}, risk:[], ret:null, ...o });

test("Ngày theo giờ Việt Nam; tuần bắt đầu thứ Hai", () => {
  assert.equal(T.crDay("2026-10-18T17:30:00.000Z"), "2026-10-19");
  assert.equal(T.crWeek("2026-10-25"), "2026-10-19");
});

test("Liên hệ thành công: 1 khách × 1 ngày tính 1 lần, lấy kết quả cuối ngày", () => {
  const r = base({ inters:[I("0901", "2026-10-05", "khong_lien_he"), { ...I("0901", "2026-10-05", "con_nhu_cau"), createdAtTs:ts("2026-10-05", 15) },
    I("0902", "2026-10-06", "khong_lien_he"), I("0903", "2026-10-07", "da_mua"), { phone:"0904", createdAtTs:ts("2026-10-07"), note:"ghi chú tự do" }] });
  const m = M(r, "contact"); assert.equal(m.den, 3); assert.equal(m.num, 2); assert.equal(m.rate, 66.7);
  assert.ok(m.formula && m.source && m.period && m.kind);
});

test("Đúng hạn: lịch hẹn + danh sách gọi, chỉ tính hạn đến hết hôm qua", () => {
  const r = base({
    inters:[I("0901", "2026-10-09", "con_nhu_cau"), I("0902", "2026-10-12", "con_nhu_cau"), I("0905", "2026-10-20", "da_mua")],
    appts:[{ phone:"0901", shop:"SHOPA", staffId:"nvA", nextFollowUpDate:"2026-10-10", createdAtTs:ts("2026-10-03") },
      { phone:"0902", shop:"SHOPA", staffId:"nvA", nextFollowUpDate:"2026-10-10", createdAtTs:ts("2026-10-03") },
      { phone:"0903", shop:"SHOPA", staffId:"nvA", nextFollowUpDate:"2026-10-11", createdAtTs:ts("2026-10-03") },
      { phone:"0906", shop:"SHOPA", staffId:"nvA", nextFollowUpDate:"2026-10-30", createdAtTs:ts("2026-10-03") }],
    daily:[{ date:"2026-10-20", shop:"SHOPA", items:[{ phone:"0905" }, { phone:"0907" }] }],
  });
  const m = M(r, "ontime"); assert.equal(m.den, 5, "hẹn hôm nay chưa tính"); assert.equal(m.num, 2);
  assert.ok(r.actions.some(a => a.kind === "Quá hẹn chưa liên hệ" && a.phone === "0903"));
});

test("Quay lại mua 14 ngày: chỉ khách đủ 14 ngày theo dõi; đơn phải SAU ngày liên hệ; khách thiếu hồ sơ ghi rõ", () => {
  const r = base({
    inters:[I("0901", "2026-10-02", "con_nhu_cau"), I("0902", "2026-10-03", "se_quay_lai"), I("0903", "2026-10-04", "con_nhu_cau"), I("0904", "2026-10-25", "con_nhu_cau"), I("0909", "2026-10-02", "con_nhu_cau")],
    custs:{ "0901":{ stats:{ purchaseAmountHistory:[{ date:"2026-10-02", amount:100 }, { date:"2026-10-10", amount:250000 }] } },
      "0902":{ stats:{ purchaseAmountHistory:[{ date:"2026-10-02", amount:90000 }] } },
      "0903":{ stats:{ lastPurchaseAt:"2026-10-30" } }, "0904":{ stats:{} } },
  });
  const m = M(r, "return"); assert.equal(m.den, 3); assert.equal(m.num, 1);
  assert.equal(r.missing.noProfile, 1);
  assert.equal(M(r, "revenue").num, 250000);
  assert.match(M(r, "revenue").detail, /không phải doanh thu tăng thêm/);
  assert.match(M(r, "return").detail, /Chưa đủ mẫu/);
});

test("Khách nguy cơ: tính đã liên hệ/đã mua trong kỳ; bỏ hồ sơ trùng; khách từ chối không vào danh sách cần gọi", () => {
  const r = base({ risk:[
    { phone:"0901", shop:"SHOPA", segments:["Có nguy cơ rời bỏ"], lastInteractionTs:ts("2026-10-12") },
    { phone:"0902", shop:"SHOPA", segments:["Giá trị cao im lặng"], stats:{ lastPurchaseAt:"2026-10-15" } },
    { phone:"0903", shop:"SHOPA", segments:["Có nguy cơ rời bỏ"] },
    { phone:"0904", shop:"SHOPA", segments:["Có nguy cơ rời bỏ"], careOptOut:true },
    { phone:"0905", shop:"SHOPA", segments:["Có nguy cơ rời bỏ"], duplicateOf:"0901" },
    { phone:"0906", shop:"SHOPB", segments:["Có nguy cơ rời bỏ"] }] , filter:{ shop:"SHOPA" } });
  const m = M(r, "risk"); assert.equal(m.den, 4); assert.equal(m.num, 2);
  const acts = r.actions.filter(a => a.kind === "Khách nguy cơ chưa liên hệ").map(a => a.phone);
  assert.deepEqual([...acts], ["0903"]);
});

test("Phản ánh: giải quyết trong 2 ngày; quá hạn lên đầu danh sách cần xử lý", () => {
  const r = base({ inters:[I("0901", "2026-10-05", "can_ho_tro"), I("0901", "2026-10-06", "con_nhu_cau"),
    I("0902", "2026-10-05", "can_ho_tro"), I("0902", "2026-10-12", "con_nhu_cau"),
    I("0903", "2026-10-10", "can_ho_tro"), I("0904", "2026-10-29", "can_ho_tro")] });
  const m = M(r, "support"); assert.equal(m.den, 3); assert.equal(m.num, 1);
  assert.equal(r.actions[0].kind, "Phản ánh chưa xử lý"); assert.equal(r.actions[0].phone, "0903");
});

test("Lọc theo nhân viên / phân khúc; kết quả không có SĐT được đếm là dữ liệu thiếu", () => {
  const inters = [I("0901", "2026-10-05", "con_nhu_cau"), I("0902", "2026-10-05", "con_nhu_cau", { staffId:"nvB" }), { careOutcome:"con_nhu_cau", createdAtTs:ts("2026-10-05") }];
  const custs = { "0901":{ segments:["Khách VIP"] }, "0902":{ segments:[] } };
  assert.equal(M(base({ inters, custs, filter:{ staffId:"nvB" } }), "contact").den, 1);
  assert.equal(M(base({ inters, custs, filter:{ seg:"Khách VIP" } }), "contact").den, 1);
  assert.equal(base({ inters, custs }).missing.noPhone, 1);
});

test("'Đã mua' chưa thấy đơn POS vào danh sách cần xử lý; tham khảo nhóm đối chứng chỉ khi đủ mẫu", () => {
  const r = base({ inters:[I("0901", "2026-10-05", "da_mua", { posCheck:"unmatched" })], ret:{ enoughSample:true, calledRate:30, notCalledRate:20 } });
  assert.ok(r.actions.some(a => /chưa thấy đơn POS/.test(a.kind)));
  assert.match(M(r, "return").detail, /không phải thử nghiệm đối chứng/);
});

test("Khách chưa có lịch sử mua đồng bộ không vào mẫu số quay lại; khách nguy cơ có dòng liên hệ trong kỳ là đã xử lý", () => {
  const r = base({ inters:[I("0901", "2026-10-05", "con_nhu_cau")], custs:{ "0901":{ stats:{} } },
    risk:[{ phone:"0901", shop:"SHOPA", segments:["Có nguy cơ rời bỏ"] }] });
  assert.equal(M(r, "return").den, 0); assert.equal(r.missing.noPurchaseData, 1);
  assert.equal(M(r, "risk").num, 1);
});
