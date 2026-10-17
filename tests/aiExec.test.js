// Kiểm thử thẻ "Việc AI giao có được làm không" (đặc tả AI vận hành, giai đoạn 2a, 17/10/2026).
// Chạy: node --test tests/aiExec.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// AIEXEC-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// AIEXEC-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__t = { aiExecSummary, aiExecStage, aiExecSource };", ctx);
const { aiExecSummary, aiExecStage, aiExecSource } = ctx.__t;
const TODAY = "2026-10-17", NOW = "2026-10-17T10:00";
const ai = (o) => ({ ngayGiao:TODAY, nguoiGiaoViec:"AI điều hành · AI tự giao", opsProposalId:"p", trangThai:"Đang giao", shop:"SHOP0059", ...o });

test("Chỉ đếm việc do AI giao, trong đúng kỳ", () => {
  const r = aiExecSummary({ today:TODAY, nowTs:NOW, days:7, tasks:[
    ai({}), { ngayGiao:TODAY, nguoiGiaoViec:"Phương", trangThai:"Đang giao", shop:"SHOP0059" },
    ai({ ngayGiao:"2026-10-10" }), ai({ ngayGiao:"2026-10-11" }) ] });
  assert.equal(r.total.total, 2);
  assert.equal(r.from, "2026-10-11");
});

test("Phân loại trạng thái thật: xong, chờ kiểm tra, chưa nhận, quá hạn, bị thay, huỷ", () => {
  assert.equal(aiExecStage(ai({ trangThai:"Đã hoàn thành" }), NOW), "done");
  assert.equal(aiExecStage(ai({ subTrangThai:"Chờ kiểm tra", deadline:"2026-10-01" }), NOW), "review");
  assert.equal(aiExecStage(ai({ subTrangThai:"Mới giao", deadline:"2026-10-17", hanGio:"09:00" }), NOW), "overdue");
  assert.equal(aiExecStage(ai({ subTrangThai:"Mới giao", deadline:"2026-10-18" }), NOW), "untouched");
  assert.equal(aiExecStage(ai({ subTrangThai:"Bị vướng", deadline:"2026-10-18" }), NOW), "doing");
  assert.equal(aiExecStage(ai({ trangThai:"Đã huỷ", nguoiHuy:"Hệ thống (thay bằng việc mới)" }), NOW), "replaced");
  assert.equal(aiExecStage(ai({ trangThai:"Đã huỷ", lyDoHuy:"Không cần nữa" }), NOW), "cancelled");
});

test("Nguồn giao: AI điều hành tự giao / quản lý duyệt / Trợ lý AI / AI tự giao việc", () => {
  assert.equal(aiExecSource(ai({})), "AI điều hành (tự giao)");
  assert.equal(aiExecSource(ai({ nguoiGiaoViec:"AI điều hành · Phương" })), "AI điều hành (quản lý duyệt)");
  assert.equal(aiExecSource(ai({ nguoiGiaoViec:"AI điều hành · Trợ lý AI (thay CHT)" })), "Trợ lý AI thay CHT");
  assert.equal(aiExecSource({ autoAssigned:true, nguoiGiaoViec:"AI tự giao" }), "AI tự giao việc (quy tắc)");
  assert.equal(aiExecSource({ nguoiGiaoViec:"Phương" }), null);
});

test("% xong tính trên việc còn hiệu lực; nhà thuốc nhiều việc chưa nhận xếp đầu; dữ kiện không nêu nguyên nhân", () => {
  const tasks = [
    ai({ trangThai:"Đã hoàn thành", shop:"SHOP0072" }),
    ai({ trangThai:"Đã huỷ", nguoiHuy:"Hệ thống (thay bằng việc mới)", shop:"SHOP0072" }),
    ai({ subTrangThai:"Mới giao", deadline:"2026-10-18" }), ai({ subTrangThai:"Mới giao", deadline:"2026-10-20" }),
    ai({ subTrangThai:"Mới giao", deadline:"2026-10-16" }),
  ];
  const r = aiExecSummary({ today:TODAY, nowTs:NOW, days:7, tasks });
  assert.equal(r.total.live, 4);
  assert.equal(r.total.donePct, 25);
  assert.equal(r.shops[0].shop, "SHOP0059");
  assert.equal(r.shops[0].untouched, 2); assert.equal(r.shops[0].overdue, 1);
  assert.equal(r.total.soon, 1);
  assert.ok(r.notes.some(n => /NT59/.test(n)), "nêu nhà thuốc 3 việc chưa xong việc nào");
  assert.ok(r.notes.every(n => !/vì|do nhân viên|lười/.test(n)), "không suy ra nguyên nhân");
});
