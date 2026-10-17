// Kiểm thử vòng đời vấn đề nhà thuốc (rà soát P0 17/10/2026): giao việc từ danh sách vấn đề phải ghi hồ sơ "ĐÃ GIAO VIỆC",
// chu kỳ mới xoá đánh giá cũ, không ghi đè hồ sơ đang xử lý.
// Chạy: node --test tests/issueLifecycle.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const fn = (name) => { const a = HTML.indexOf("\nasync function " + name + "(") >= 0 ? HTML.indexOf("\nasync function " + name + "(") : HTML.indexOf("\nfunction " + name + "("); assert.ok(a >= 0, name); return HTML.slice(a, HTML.indexOf("\n}", a) + 2); };

function setup(existing){
  const writes = [], hist = [];
  const db = { collection:(c) => ({ doc:(id) => ({ get: async () => ({ exists: !!existing, data: () => existing }), set: async (d) => { writes.push({ c, id, d }); } }) }) };
  const ctx = vm.createContext({ db, firebase:{ firestore:{ FieldValue:{ serverTimestamp:() => "ts" } } }, logSystemError(){},
    issueActionKeyOf:(s, c) => s + "__" + c, logIssueHistory: async (x) => { hist.push(x); } });
  vm.runInContext(fn("markIssueAssigned") + ";globalThis.__f = markIssueAssigned;", ctx);
  return { run: ctx.__f, writes, hist };
}
const preset = { title:"[NT59] Hết hàng", shop:"SHOP0059", extra:{ sourceType:"shopHealthIssue", sourceIssueCode:"HH02", sourceShop:"SHOP0059" } };

test("Giao việc từ vấn đề → hồ sơ ĐÃ GIAO VIỆC + lịch sử", async () => {
  const t = setup(null); await t.run(preset, "task1");
  assert.equal(t.writes.length, 1); assert.equal(t.writes[0].id, "SHOP0059__HH02");
  assert.equal(t.writes[0].d.status, "IN_PROGRESS"); assert.equal(t.writes[0].d.assignedTaskId, "task1");
  assert.equal(t.hist[0].action, "ASSIGN");
});

test("Mở lại rồi giao chu kỳ mới → xoá đánh giá cũ, đánh dấu tái diễn", async () => {
  const t = setup({ status:"REOPENED", effectiveness:"khong_hieu_qua", resultAfter:{ items:[1] } }); await t.run(preset, "task2");
  assert.equal(t.writes[0].d.effectiveness, null); assert.equal(t.writes[0].d.resultAfter, null); assert.equal(t.writes[0].d.recurrence, true);
});

test("Hồ sơ đang xử lý / việc không phải từ vấn đề nhà thuốc → không ghi", async () => {
  const a = setup({ status:"PENDING_VERIFICATION" }); await a.run(preset, "t"); assert.equal(a.writes.length, 0);
  const b = setup(null); await b.run({ ...preset, extra:{ ...preset.extra, sourceType:"risk" } }, "t"); assert.equal(b.writes.length, 0);
});
