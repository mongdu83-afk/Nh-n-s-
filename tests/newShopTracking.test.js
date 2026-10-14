// Kiểm thử "So kế hoạch mở nhà thuốc mới với thực tế 30/60/90 ngày" (P1 — đề xuất cải tiến 14/10/2026).
// Chạy: node --test tests/newShopTracking.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// NS-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// NS-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__n = { nsTrack };", ctx);
const { nsTrack } = ctx.__n;
function daily(from, n, fn){ const D = { revenueByDay:{}, orderCountByDay:{} }; for(let i = 0; i < n; i++){ const d = new Date(from + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + i); const iso = d.toISOString().slice(0, 10); const x = fn(i); D.revenueByDay[iso] = x.rev; D.orderCountByDay[iso] = x.bills; } return D; }

test("So từng giai đoạn với kỳ vọng và nhà thuốc chuẩn; giai đoạn chưa tới / đang diễn ra", () => {
  const D = daily("2026-08-01", 75, (i) => i < 30 ? { rev:8e6, bills:50 } : { rev:12e6, bills:70 });
  const r = nsTrack({ openDate:"2026-08-01", today:"2026-10-15", daily:D, expectedRevDay:10e6, benchmarkRevDay:15e6 });
  assert.equal(r.phases[0].revDay, 8e6); assert.equal(Math.round(r.phases[0].vsExpected), 80); assert.equal(r.phases[0].tone, "orange");
  assert.equal(r.phases[1].revDay, 12e6); assert.equal(r.phases[1].status, "Đạt kỳ vọng"); assert.equal(Math.round(r.phases[1].vsBench), 80);
  assert.match(r.phases[2].status, /đang diễn ra/);
  assert.equal(Math.round(r.trend), 50);
  assert.ok(r.notes.some(n => /không áp máy móc/.test(n)));
});

test("Ngoài vùng dữ liệu / chưa khai trương / không có kỳ vọng", () => {
  const D = daily("2026-09-20", 25, () => ({ rev:9e6, bills:40 }));
  const r = nsTrack({ openDate:"2026-08-01", today:"2026-10-15", daily:D, expectedRevDay:10e6 });
  assert.match(r.phases[0].status, /Chưa đủ dữ liệu/);
  const f = nsTrack({ openDate:"2026-11-01", today:"2026-10-15", daily:D, expectedRevDay:10e6 });
  f.phases.forEach(p => assert.equal(p.status, "Chưa tới giai đoạn"));
  const n = nsTrack({ openDate:"2026-09-20", today:"2026-10-15", daily:D });
  assert.match(n.phases[0].status, /chưa có doanh thu kỳ vọng/);
});
