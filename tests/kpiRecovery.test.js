// Kiểm thử nghiệp vụ "Kế hoạch bù KPI nhân viên" (P0 KPI — đề xuất cải tiến 14/10/2026).
// Chạy: node --test tests/kpiRecovery.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// KBP-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// KBP-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__k = { kbpPlan, kbpAssumption, kbpTaskLines, kbpWorkdays };", ctx);
const { kbpPlan, kbpAssumption, kbpTaskLines, kbpWorkdays } = ctx.__k;
const TODAY = "2026-10-15"; // 14 ngày đã qua, tháng 31 ngày

test("Kế hoạch bù có mức thiếu, cần/ngày làm còn lại (đã trừ ngày nghỉ), cam kết và mốc kiểm tra", () => {
  const p = { staffId:"s1", staffName:"Lan", shop:"SHOP0059", thang:"2026-10", workedBefore:12,
    doanhSoTarget:60e6, doanhSoActual:18e6, pctDoanhSoProjected:0.66, hesoTarget:20e6, hesoActual:8e6, pctHeSoProjected:0.88, kpiPctProjected:0.72 };
  const x = kbpPlan(p, TODAY);
  // đã nghỉ 2 ngày → còn 2 ngày nghỉ; 17 ngày lịch còn lại → 15 ngày làm
  assert.equal(x.workdays.workLeft, 15);
  const ds = x.metrics.find(m => m.key === "ds");
  assert.equal(ds.gap, 42e6);
  assert.equal(Math.round(ds.needPerWorkday), 2.8e6);
  assert.equal(Math.round(ds.curPerWorkday), 1.5e6);
  assert.equal(x.weakest.key, "ds");
  assert.ok(x.plan && /Doanh số ≥ 2,8 tr\/ngày làm/.test(x.plan.commitment));
  assert.match(x.plan.checkpoint, /Kiểm tra 18\/10/);
  assert.ok(x.coaching[0].startsWith("Doanh số dự kiến 66%"), "gợi ý huấn luyện phải dựa trên chỉ số yếu có số liệu");
  assert.match(x.assumption, /12 ngày đã làm cho 15 ngày làm còn lại/);
});

test("Xét ngày công: làm ít ngày → nhắc kiểm tra ca/nghỉ phép trước khi kết luận", () => {
  const x = kbpPlan({ staffId:"s2", thang:"2026-10", workedBefore:6, doanhSoTarget:60e6, doanhSoActual:9e6, pctDoanhSoProjected:0.5, kpiPctProjected:0.6 }, TODAY);
  assert.ok(x.notes.some(n => /Chỉ ghi nhận 6 ca trong 14 ngày/.test(n)));
  assert.ok(x.notes.some(n => /không quy kết/.test(n)));
});

test("Không có dữ liệu ca → nói rõ dự báo theo ngày lịch; không có chỉ tiêu → chưa đủ dữ liệu, không có kế hoạch", () => {
  assert.match(kbpAssumption({ thang:"2026-10", doanhSoActual:1 }, TODAY), /Chưa có dữ liệu ca làm/);
  const x = kbpPlan({ staffId:"s3", thang:"2026-10", workedBefore:13 }, TODAY);
  assert.equal(x.plan, null);
  assert.ok(x.insufficient.length);
});

test("Nhân viên đang kịp KPI → không tạo kế hoạch bù", () => {
  const x = kbpPlan({ staffId:"s4", thang:"2026-10", workedBefore:13, doanhSoTarget:60e6, doanhSoActual:35e6, pctDoanhSoProjected:1.1, kpiPctProjected:0.95 }, TODAY);
  assert.equal(x.weakest, null); assert.equal(x.plan, null);
});

test("Tháng đã qua → không còn dự báo, không có kế hoạch", () => {
  const x = kbpPlan({ staffId:"s5", thang:"2026-09", workedBefore:26, doanhSoTarget:60e6, doanhSoActual:40e6, pctDoanhSoProjected:0.67, kpiPctProjected:0.7 }, TODAY);
  assert.equal(x.workdays.inMonth, false); assert.equal(x.plan, null);
  assert.match(x.assumption, /đã kết thúc/);
});

test("Nội dung giao việc có cam kết, mốc kiểm tra và gợi ý hỗ trợ từng người", () => {
  const p = { staffId:"s1", staffName:"Lan", thang:"2026-10", workedBefore:12, doanhSoTarget:60e6, doanhSoActual:18e6, pctDoanhSoProjected:0.66, kpiPctProjected:0.72 };
  const t = kbpTaskLines([kbpPlan(p, TODAY)]);
  ["• Lan", "Cam kết:", "Kiểm tra", "Hỗ trợ:"].forEach(k => assert.ok(t.includes(k), k));
});
