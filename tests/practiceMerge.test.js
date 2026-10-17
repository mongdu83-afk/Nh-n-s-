// Kiểm thử gộp lịch sử luyện tập: nhân viên lên từ học việc thấy cả bài cũ ở bảng quản lý; người đã nghỉ ghi ngày nghỉ (17/10/2026).
// Chạy: node --test tests/practiceMerge.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const fn = (name) => { const a = HTML.indexOf("\nfunction " + name + "("); assert.ok(a > 0, name); return HTML.slice(a, HTML.indexOf("\n}", a) + 2); };
const ctx = vm.createContext({});
vm.runInContext(["normalizeStaffName", "staffNameKeys", "practiceMergeRows", "resignedTag"].map(fn).join("\n") + "\n;globalThis.__m = { practiceMergeRows, resignedTag };", ctx);
const { practiceMergeRows, resignedTag } = ctx.__m;

const lien = { id:"st9", name:"Lưu Thị Liên", shop:"SHOP0059", role:"Nhân viên bán hàng" };
test("Dòng học việc + dòng nhân viên của cùng 1 người → 1 dòng, cộng số bài, nút Xem bài gồm hồ sơ cũ", () => {
  const rows = [ { key:"s", hireId:"st9", name:"Lưu Thị Liên", shop:"SHOP0059", kind:"Nhân viên", graded:0, total:0 },
                 { key:"h", hireId:"hire1", name:"Luu Thi Lien", shop:"SHOP0059", kind:"Học việc", graded:8, total:9, avg10:72, last:"2026-10-01T03:00:00Z" } ];
  const out = practiceMergeRows(rows, [lien], []);
  assert.equal(out.length, 1);
  assert.equal(out[0].hireId, "st9"); assert.deepEqual(Array.from(out[0].oldIds), ["hire1"]);
  assert.equal(out[0].graded, 8); assert.equal(out[0].total, 9); assert.equal(out[0].avg10, 72);
  assert.equal(out[0].promoted, true);
});
test("Chỉ còn dòng học việc nhưng hồ sơ đã là nhân viên bán hàng → ghi 'từ học việc'; chỉ có hồ sơ liên kết → không gắn nhãn", () => {
  const one = practiceMergeRows([ { key:"h", hireId:"hire1", name:"Lưu Thị Liên", shop:"SHOP0059", kind:"Học việc / thử việc", graded:8, total:8 } ], [lien], []);
  assert.equal(one[0].promoted, true); assert.match(one[0].kind, /từ học việc/);
  const linked = practiceMergeRows([ { key:"s", hireId:"st9", name:"Lưu Thị Liên", shop:"SHOP0059", kind:"Nhân viên", graded:0, total:0 } ], [lien], [{ id:"hA", staffId:"st9" }]);
  assert.equal(linked[0].promoted, false);
});
test("Máy chủ không trả dòng học việc → lấy hồ sơ học việc liên kết (newHires.staffId hoặc cùng tên + nhà thuốc)", () => {
  const rows = [ { key:"s", hireId:"st9", name:"Lưu Thị Liên", shop:"SHOP0059", kind:"Nhân viên", graded:0, total:0 } ];
  assert.deepEqual(Array.from(practiceMergeRows(rows, [lien], [{ id:"hA", staffId:"st9" }])[0].oldIds), ["hA"]);
  assert.deepEqual(Array.from(practiceMergeRows(rows, [lien], [{ id:"hB", name:"Lưu Thị Liên", shop:"SHOP0059" }])[0].oldIds), ["hB"]);
  assert.equal(practiceMergeRows(rows, [lien], [{ id:"hC", name:"Lưu Thị Liên", shop:"SHOP0072" }])[0].oldIds.length, 0);
});
test("Người khác nhà thuốc không bị gộp; ngày nghỉ hiện dạng (nghỉ dd/mm)", () => {
  const rows = [ { key:"a", hireId:"a", name:"Lan", shop:"SHOP0059", total:1 }, { key:"b", hireId:"b", name:"Lan", shop:"SHOP0072", total:1 } ];
  assert.equal(practiceMergeRows(rows, [], []).length, 2);
  assert.equal(resignedTag({ ngayNghiViec:"2026-10-10" }), " (nghỉ 10/10)"); assert.equal(resignedTag(null), "");
});
