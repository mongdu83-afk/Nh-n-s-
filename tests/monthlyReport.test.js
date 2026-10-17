// Kiểm thử báo cáo tháng (đặc tả AI vận hành, giai đoạn 4c, 17/10/2026). Chạy: node --test tests/monthlyReport.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// MONTHUI-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// MONTHUI-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__t = { mrFmtPct, mrRate, mrMonthsBack };", ctx);
const { mrFmtPct, mrRate, mrMonthsBack } = ctx.__t;
test("Chọn 6 tháng gần nhất, qua năm đúng", () => {
  assert.equal(mrMonthsBack("2026-02-10", 4).join(","), "2026-02,2026-01,2025-12,2025-11");
});
test("Hiện phần trăm kiểu Việt Nam, thiếu số thì gạch", () => {
  assert.equal(mrFmtPct(12.34, true), "+12,3%"); assert.equal(mrFmtPct(null), "—"); assert.equal(mrRate(1, 0), "—"); assert.equal(mrRate(2, 6), "33%");
});
test("Tab Báo cáo tháng có trong nhóm Báo cáo của quản lý và không mở cho nhân viên", () => {
  assert.match(HTML, /tabs:\["baocaotuan","baocaolanhdao","baocaothang"\]/);
  const staff = /const STAFF_TABS = \[([^\]]*)\]/.exec(HTML)[1];
  assert.equal(staff.includes("baocaothang"), false);
});
