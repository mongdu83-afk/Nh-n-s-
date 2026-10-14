// Kiểm thử nghiệp vụ "Kế hoạch cải thiện 7/14 ngày" (P1 Employee360 — đề xuất cải tiến 14/10/2026).
// Chạy: node --test tests/improvementPlan.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// IP-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// IP-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__i = { ipBuild, ipText, ipEvaluate, IP_CAUSES };", ctx);
const { ipBuild, ipText, ipEvaluate } = ctx.__i;
const plan = ipBuild({ metricLabel:"Doanh số (dự kiến)", baseline:0.62, target:0.75, days:7, startDate:"2026-10-06", causeType:"skill", mentor:"Hà", managerSupport:"1-1 thứ 4" });

test("Kế hoạch có chỉ số đầu kỳ, mục tiêu định lượng, hạn, nguyên nhân đã phân loại, người kèm cặp", () => {
  assert.equal(plan.endDate, "2026-10-13");
  const t = ipText(plan, "Lan");
  ["đầu kỳ 62%", "mục tiêu 75%", "hạn 13/10", "Khoảng trống kỹ năng", "Người kèm cặp: Hà", "Hỗ trợ của quản lý: 1-1 thứ 4"].forEach(k => assert.ok(t.includes(k), k));
  assert.equal(ipBuild({ ...plan, days:14 }).endDate, "2026-10-20");
});

test("Phân loại nguyên nhân quyết định cách hỗ trợ (quy trình / nguồn lực không giao đào tạo cá nhân)", () => {
  assert.match(ipText(ipBuild({ ...plan, causeType:"process" }), "Lan"), /KHÔNG cần đào tạo cá nhân/);
  assert.match(ipText(ipBuild({ ...plan, causeType:"resource" }), "Lan"), /không giao đào tạo/);
});

test("Đánh giá lại khi hết kỳ: đạt / cải thiện một phần / chưa cải thiện", () => {
  assert.equal(ipEvaluate(plan, 0.78, "2026-10-14").verdict, "achieved");
  assert.equal(ipEvaluate(plan, 0.68, "2026-10-14").verdict, "partial");
  assert.equal(ipEvaluate(plan, 0.61, "2026-10-14").verdict, "none");
  const running = ipEvaluate(plan, 0.66, "2026-10-10");
  assert.equal(running.ended, false); assert.match(running.status, /Đang thực hiện/);
  assert.match(ipEvaluate(plan, null, "2026-10-14").status, /Chưa đo được/);
  assert.match(ipEvaluate(ipBuild({ ...plan, startDate:"2026-09-28" }), 0.7, "2026-10-06").note, /tháng mới/);
});
