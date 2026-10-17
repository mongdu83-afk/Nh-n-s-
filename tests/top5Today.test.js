// Kiểm thử "5 việc hôm nay" cho QLKV (rà soát P1-1, 17/10/2026).
// Chạy: node --test tests/top5Today.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// TOP5-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// TOP5-ENGINE-END");
assert.ok(b > 0 && e > b);
const fn = (name) => { const a = HTML.indexOf("\nfunction " + name + "("); return HTML.slice(a, HTML.indexOf("\n}", a) + 2); };
const ctx = vm.createContext({ todayISO:() => "2026-10-17", nowHM:() => "10:00" });
vm.runInContext(HTML.slice(b, e) + fn("taskSubStatus") + fn("taskDeadlineTs360") + fn("isTaskOverdue") + "\n;globalThis.__t = { top5Today, top5Overdue, isTaskOverdue };", ctx);
const { top5Today, top5Overdue, isTaskOverdue } = ctx.__t;
const NOW = "2026-10-17T10:00";

test("Không có gì gấp → danh sách rỗng", () => {
  assert.equal(top5Today({ today:"2026-10-17", nowTs:NOW }).length, 0);
});

test("Xếp đúng thứ tự: rủi ro nghiêm trọng > vấn đề đỏ > đến hạn đánh giá > ...; tối đa 5 mục, mỗi mục có nút", () => {
  const tasks = [ { id:"t1", trangThai:"Đang giao", deadline:"2026-10-16", shop:"SHOP0059" },
                  { id:"t2", trangThai:"Đang giao", deadline:"2026-10-20", subTrangThai:"Chờ kiểm tra", shop:"SHOP0072" } ];
  const r = top5Today({ today:"2026-10-17", nowTs:NOW, tasks,
    risks:[ { level:"CRITICAL", status:"OPEN", shop:"SHOP0058" } ],
    issues:[ { shopCode:"SHOP0059", code:"HH01", severity:"red", title:"Hết hàng" }, { shopCode:"SHOP0089", code:"CP01", severity:"orange", title:"x" } ],
    issueActions:{ "SHOP0072__DT01":{ shop:"SHOP0072", code:"DT01", status:"IN_PROGRESS", assignedTaskId:"done-task" } },
    pendingProposals:3 });
  assert.equal(r.length, 5);
  assert.deepEqual(Array.from(r.map(x => x.key)), ["risk", "red", "eval", "over", "wait"]);
  r.forEach(x => { assert.ok(x.cta); assert.ok(x.nav && x.nav.tab); });
});

test("Vấn đề đã có người xử lý không tính; mở lại thì tính lại", () => {
  const issues = [ { shopCode:"SHOP0059", code:"HH01", severity:"red", title:"Hết hàng" } ];
  assert.equal(top5Today({ nowTs:NOW, issues, issueActions:{ "SHOP0059__HH01":{ status:"IN_PROGRESS", assignedTaskId:"t1" } }, tasks:[{ id:"t1", trangThai:"Đang giao" }] }).filter(x => x.key === "red").length, 0);
  assert.equal(top5Today({ nowTs:NOW, issues, issueActions:{ "SHOP0059__HH01":{ status:"REOPENED" } } }).filter(x => x.key === "red").length, 1);
});

test("'Quá hạn' trùng định nghĩa chung của app (isTaskOverdue)", () => {
  const cases = [ { trangThai:"Đang giao", deadline:"2026-10-17", hanGio:"09:00" }, { trangThai:"Đang giao", deadline:"2026-10-17" },
    { trangThai:"Đang giao", deadline:"2026-10-16", subTrangThai:"Chờ kiểm tra" }, { trangThai:"Đã hoàn thành", deadline:"2026-10-01" }, { trangThai:"Đang giao" } ];
  cases.forEach(t => assert.equal(top5Overdue(t, NOW), isTaskOverdue(t, NOW), JSON.stringify(t)));
});
