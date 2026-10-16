// Kiểm thử nghiệp vụ "Đánh giá đợt khuyến mại & gợi ý quyết định" (P1 CTKM — đề xuất cải tiến 14/10/2026).
// Chạy: node --test tests/promoDecision.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// PMD-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// PMD-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__p = { pmdDecide };", ctx);
const { pmdDecide } = ctx.__p;

function chainDaily(from, n, fn){ const m = {}; for(let i = 0; i < n; i++){ const d = new Date(from + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + i); const iso = d.toISOString().slice(0, 10); m[iso] = fn(iso, i); } return m; }
const camp = (over) => ({ from:"2026-10-01", to:"2026-10-10", dataFrom:"2026-10-01", dataTo:"2026-10-10", days:10,
  chain:{ cost:10e6, rev:1000e6, orders:10000, promoOrders:3000, promoRev:400e6 },
  shops:{ SHOP0058:{ n:2000, pn:700, rev:200e6, cost:{ v:2e6 } }, SHOP0059:{ n:1500, pn:150, rev:150e6, cost:{ v:1e6 } }, SHOP0072:{ n:1000, pn:300, rev:100e6, cost:{ v:5e6 } } }, ...(over||{}) });

test("Có kỳ đối chứng, doanh thu tăng, chi phí thấp → Tiếp tục, kèm căn cứ", () => {
  const D = chainDaily("2026-09-15", 30, (iso) => iso >= "2026-10-01" ? 100e6 : 90e6);
  const r = pmdDecide(camp(), D);
  assert.equal(Math.round(r.lift), 11);
  assert.equal(r.decision.code, "continue");
  assert.ok(r.evidence.some(t => /so với 10 ngày liền trước/.test(t)));
  assert.ok(r.caveats.some(t => /không quy toàn bộ chênh lệch/.test(t)), "phải nêu yếu tố khác có thể ảnh hưởng");
});

test("Thiếu kỳ đối chứng → không khẳng định hiệu quả tăng thêm", () => {
  const D = chainDaily("2026-09-28", 13, () => 100e6); // không phủ 10 ngày trước 01/10
  const r = pmdDecide(camp(), D);
  assert.equal(r.lift, null);
  assert.equal(r.decision.code, "watch");
  assert.match(r.decision.reason, /CHƯA khẳng định hiệu quả tăng thêm/);
  assert.ok(r.caveats.some(t => /chưa đủ cơ sở khẳng định doanh thu tăng thêm/.test(t)));
});

test("Doanh thu giảm và chi phí cao → Dừng để xem xét", () => {
  const D = chainDaily("2026-09-15", 30, (iso) => iso >= "2026-10-01" ? 90e6 : 100e6);
  const r = pmdDecide(camp({ chain:{ cost:40e6, rev:900e6, orders:9000, promoOrders:4000, promoRev:500e6 } }), D);
  assert.equal(r.decision.code, "stop");
});

test("Doanh thu không giảm nhưng chi phí cao → Điều chỉnh", () => {
  const D = chainDaily("2026-09-15", 30, () => 100e6);
  const r = pmdDecide(camp({ chain:{ cost:40e6, rev:1000e6, orders:10000, promoOrders:4000, promoRev:500e6 } }), D);
  assert.equal(r.decision.code, "adjust");
});

test("Chỉ ra nhà thuốc triển khai yếu (tỷ lệ đơn có KM thấp, chi phí/doanh thu cao)", () => {
  const r = pmdDecide(camp(), null);
  const shops = Array.from(r.weakShops.map(w => w.shop)).sort();
  assert.deepEqual(shops, ["SHOP0059", "SHOP0072"]);
  assert.ok(r.next.actions[0].includes("NT59"));
});

test("Không có chi phí/doanh thu → Chưa đủ dữ liệu để kết luận", () => {
  const r = pmdDecide({ chain:{} }, null);
  assert.equal(r.decision.code, "nodata");
});

test("Kỳ đối chứng trùng đợt KM khác → không kết luận Tiếp tục (audit KM-1)", () => {
  const D = chainDaily("2026-09-15", 30, (d) => d >= "2026-10-01" ? 120e6 : 100e6);
  const r = pmdDecide(camp(), D, { otherCampaigns: [{ from:"2026-09-20", to:"2026-09-25", name:"Đợt tháng 9" }] });
  assert.equal(r.decision.code, "watch");
  assert.ok(r.caveats.some(c => c.includes("trùng đợt khuyến mại khác")));
});
