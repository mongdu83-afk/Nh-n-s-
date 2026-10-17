// Kiểm thử ghép nhân viên với dữ liệu ngoài theo tên (rà soát P0 17/10/2026): người trùng tên tách được bằng "tên trên hệ thống".
// Chạy: node --test tests/staffMatching.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
// lấy nguyên văn 1 hàm cấp cao nhất trong index.html
const fn = (name) => { const a = HTML.indexOf("\nfunction " + name + "("); assert.ok(a > 0, name); const b = HTML.indexOf("\n}", a); return HTML.slice(a, b + 2); };
const ctx = vm.createContext({ todayISO:() => "2026-10-17" });
vm.runInContext(["normalizeStaffName", "staffNameKeys", "isStaffResigned", "staffNameCollisions", "findWorkRegsForStaffDate"].map(fn).join("\n") +
  "\n;globalThis.__m = { staffNameKeys, staffNameCollisions, findWorkRegsForStaffDate };", ctx);
const { staffNameKeys, staffNameCollisions, findWorkRegsForStaffDate } = ctx.__m;

const namA = { id:"a", name:"Nguyễn Văn Nam", shop:"SHOP0059", tenHeThong:"Nguyễn Văn Nam A" };
const namB = { id:"b", name:"Nguyễn Văn Nam", shop:"SHOP0072", tenHeThong:"Nguyễn Văn Nam B" };
const regs = [ { WorkDate:"2026-10-17T00:00:00", EmployeeName:"Nguyễn Văn Nam A", TimeStart:"2026-10-17 07:00:00" },
               { WorkDate:"2026-10-17T00:00:00", EmployeeName:"Nguyen Van Nam B", TimeStart:"2026-10-17 14:00:00" } ];

test("Có tên trên hệ thống → dùng tên đó (nhiều tên cách dấu phẩy); không có → tên trong app", () => {
  assert.deepEqual(Array.from(staffNameKeys({ name:"Lan", tenHeThong:"Lê Thị Lan, Lan LT" })), ["le thi lan", "lan lt"]);
  assert.deepEqual(Array.from(staffNameKeys({ name:"Trần Thị Ý" })), ["tran thi i"]);
});

test("2 người trùng tên được tách ca nhờ tên trên hệ thống", () => {
  assert.equal(findWorkRegsForStaffDate(regs, [], namA, "2026-10-17").length, 1);
  assert.equal(findWorkRegsForStaffDate(regs, [], namA, "2026-10-17")[0].TimeStart.slice(11,16), "07:00");
  assert.equal(findWorkRegsForStaffDate(regs, [], namB, "2026-10-17")[0].TimeStart.slice(11,16), "14:00");
});

test("Cảnh báo trùng tên: chưa điền tên trên hệ thống thì báo; điền khác nhau thì hết; người đã nghỉ không tính", () => {
  const a = { id:"a", name:"Nguyễn Văn Nam", shop:"SHOP0059" }, b = { id:"b", name:"Nguyen van  Nam", shop:"SHOP0072" };
  assert.equal(staffNameCollisions([a, b]).length, 1);
  assert.equal(staffNameCollisions([namA, namB]).length, 0);
  assert.equal(staffNameCollisions([a, { ...b, ngayNghiViec:"2026-10-01" }]).length, 0);
});
