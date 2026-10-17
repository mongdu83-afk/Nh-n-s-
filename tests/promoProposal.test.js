// Kiểm thử "AI đề xuất CTKM theo 8 mục" (đặc tả AI vận hành, giai đoạn 4d, 17/10/2026). Chạy: node --test tests/promoProposal.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// PROMOPROPUI-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// PROMOPROPUI-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__t = { promoPropSections };", ctx);
const { promoPropSections } = ctx.__t;
test("Luôn đủ 8 mục, mục thiếu ghi rõ AI chưa ghi", () => {
  const s = promoPropSections({ vanDe:"Bỏ lỡ KM", maDuKien:["K1"], nhaThuoc:["SHOP0058"], chiSo:"bills", mucTieuPct:5, thoiGianThu:14 }, [{ id:"K1", text:"42 đơn bỏ lỡ" }]);
  assert.equal(s.length, 8);
  assert.match(s[1].text, /K1 42 đơn bỏ lỡ/);
  assert.match(s[2].text, /SHOP0058/);
  assert.match(s[4].text, /Số bill\/ngày, mục tiêu \+5%.*đối chứng/);
  assert.equal(s[5].text, "14 ngày");
  assert.equal(s[6].missing, true); assert.equal(s[6].text, "AI chưa ghi mục này");
});
test("Căn cứ không có mã dữ kiện thì ghi rõ", () => {
  assert.match(promoPropSections({ canCu:"cảm thấy" }, [])[1].text, /Chưa dẫn được dữ kiện/);
});
