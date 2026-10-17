// Kiểm thử duyệt đề xuất AI: sửa đề xuất thì phải ghi lý do (đặc tả AI vận hành, giai đoạn 3b, 17/10/2026).
// Chạy: node --test tests/opsDecision.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = /\nfunction opsEditedNoReason\(r, e\)\{[^\n]*\}\n/.exec(HTML);
assert.ok(m, "thiếu hàm opsEditedNoReason");
const ctx = vm.createContext({});
vm.runInContext(m[0] + ";globalThis.__f = opsEditedNoReason;", ctx);
const f = ctx.__f;
const r = { title:"Gọi khách", huongDan:"- gọi", deadline:"2026-10-19" };

test("Không sửa gì thì không cần lý do", () => {
  assert.equal(f(r, null), false);
  assert.equal(f(r, { title:"Gọi khách" }), false);
});
test("Sửa tiêu đề, hướng dẫn hoặc hạn mà chưa ghi lý do thì chặn", () => {
  assert.equal(f(r, { title:"Gọi 30 khách" }), true);
  assert.equal(f(r, { huongDan:"- gọi\n- nhắn" }), true);
  assert.equal(f(r, { deadline:"2026-10-20", lyDoSua:"  " }), true);
});
test("Có lý do thì cho duyệt", () => {
  assert.equal(f(r, { title:"Gọi 30 khách", lyDoSua:"Ghi rõ số khách" }), false);
});
