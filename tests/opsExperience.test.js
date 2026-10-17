// Kiểm thử "kinh nghiệm vận hành do quản lý xác nhận" (đặc tả AI vận hành, giai đoạn 4b, 17/10/2026).
// Chạy: node --test tests/opsExperience.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// EXPUI-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// EXPUI-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__t = { expXn, expNeedsReconfirm };", ctx);
const { expXn, expNeedsReconfirm } = ctx.__t;
const e0 = { vanDe:"Thiếu hàng", cachXuLy:"Đặt bổ sung", hieuQua:"Hiệu quả", xacNhan:"da_xac_nhan" };

test("Kinh nghiệm cũ chưa có trạng thái là Chưa xác nhận, AI không dùng", () => {
  assert.equal(expXn({ vanDe:"x" })[0], "Chưa xác nhận");
  assert.match(expXn(e0)[0], /AI dùng/);
});
test("Sửa nội dung thì phải xác nhận lại, sửa khoảng trắng hay người xử lý thì không", () => {
  assert.equal(expNeedsReconfirm(e0, { ...e0, cachXuLy:"Đặt bổ sung trước thứ Sáu" }), true);
  assert.equal(expNeedsReconfirm(e0, { ...e0, hieuQua:"Không hiệu quả" }), true);
  assert.equal(expNeedsReconfirm(e0, { ...e0, vanDe:"Thiếu hàng  ", nguoiXuLy:"Lan" }), false);
});
