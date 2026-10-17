// Kiểm thử thẻ "AI phân tích nhà thuốc" — 8 mục (đặc tả AI vận hành, giai đoạn 3a, 17/10/2026).
// Chạy: node --test tests/shopAnalysis.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// SHOPAN-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// SHOPAN-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({ fmtVNDCompact:(n)=>Math.round(n/1e6)+"tr", fmtNum:(n)=>String(n) });
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__t = { shopAnSections, shopAnFmt };", ctx);
const { shopAnSections, shopAnFmt } = ctx.__t;
const doc = {
  facts:[ { id:"F1", label:"Doanh thu thực hiện lũy kế tháng (đ)", value:150e6 }, { id:"F2", label:"Chỉ tiêu doanh thu tháng (đ)", value:400e6 },
    { id:"F3", label:"% thay đổi 7 ngày gần nhất so với 7 ngày trước", value:-20 }, { id:"F4", label:"Số ngày còn lại trong tháng", value:15 } ],
  refs:{ actual:{ revenue:"F1", perDay:null }, target:{ revenue:"F2" }, gap:{ daysLeft:"F4" }, trend:{ change:"F3" } },
  confirmed:[{ text:"Doanh thu giảm", evidence:["F3","F99"] }], hypotheses:[{ text:"Thiếu hàng", check:"Xem tồn", demoted:false }],
  missing:["Chưa có lượt khách"], solutions:[{ title:"Gọi khách", owner:"CHT", priority:1, basis:["F3"], steps:"- Gọi" }], metrics:[{ metric:"Doanh thu 7 ngày / mức cần đạt", how:"tự đo", auto:true }],
};

test("Đủ 8 mục, đúng thứ tự đặc tả", () => {
  const s = shopAnSections(doc);
  assert.equal(s.map(x => x.no).join(","), "1,2,3,4,5,6,7,8");
  assert.equal(s[0].rows[0].value, "150tr");
  assert.equal(s[0].rows[0].label, "Doanh thu thực hiện lũy kế tháng");
  assert.equal(s[2].rows[0].value, "15");
});

test("Nguyên nhân hiện dữ liệu chứng minh, bỏ mã dữ kiện không có; giả thuyết tách riêng", () => {
  const c = shopAnSections(doc)[4];
  assert.equal(c.confirmed[0].evidence.length, 1);
  assert.match(c.confirmed[0].evidence[0], /-20%/);
  assert.equal(c.hypotheses[0].text, "Thiếu hàng");
});

test("Định dạng: % thay đổi có dấu, chưa có doc thì không có mục", () => {
  assert.equal(shopAnFmt({ label:"% thay đổi số hoá đơn", value:12.5 }), "+12,5%");
  assert.equal(shopAnFmt({ label:"% dự kiến đạt", value:72 }), "72%");
  assert.equal(shopAnSections(null).length, 0);
});
