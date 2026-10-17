// Kiểm thử "3 ý của một việc": Xong việc / Đạt chất lượng / Đạt kết quả kinh doanh (đặc tả AI vận hành, giai đoạn 3c, 17/10/2026).
// Chạy: node --test tests/triState.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// TRISTATE-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// TRISTATE-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__t = { taskTriState };", ctx);
const { taskTriState } = ctx.__t;
const done = { trangThai:"Đã hoàn thành", subTrangThai:"Đã hoàn thành" };

test("Việc xong + duyệt đạt nhưng chưa đo thì KHÔNG tính là thành công", () => {
  const r = taskTriState({ ...done, ketQuaDat:true, verifiedAtTs:"x", opsProposalId:"p1" }, { prop:{ lifecycle:"EXECUTED" } });
  assert.equal(r.work.key, "done");
  assert.equal(r.quality.key, "dat");
  assert.equal(r.outcome.key, "wait_measure");
});

test("Việc xong, đạt chất lượng nhưng chỉ số không lên → Không đạt kết quả", () => {
  const r = taskTriState({ ...done, ketQuaDat:true, sourceIssueCode:"DT01" }, { act:{ effectiveness:"khong_hieu_qua", effectivenessNote:"DT vẫn giảm" } });
  assert.equal(r.quality.key, "dat");
  assert.equal(r.outcome.key, "khong_hieu_qua");
  assert.match(r.outcome.note, /DT vẫn giảm/);
  const p = taskTriState({ ...done, opsProposalId:"p" }, { prop:{ actualOutcome:{ success:true } } });
  assert.equal(p.outcome.key, "hieu_qua");
});

test("Chất lượng: chờ kiểm tra, không đạt, đạt sau làm lại, đóng không qua kiểm tra", () => {
  assert.equal(taskTriState({ trangThai:"Đang giao", subTrangThai:"Chờ kiểm tra" }).quality.key, "cho");
  assert.equal(taskTriState({ trangThai:"Đang giao", subTrangThai:"Chờ kiểm tra" }).work.key, "submitted");
  assert.equal(taskTriState({ trangThai:"Đang giao", subTrangThai:"Không đạt", lyDoKhongDat:"thiếu ảnh" }).quality.key, "khong_dat");
  assert.equal(taskTriState({ ...done, ketQuaDat:true, lyDoKhongDat:"thiếu ảnh" }).quality.label, "Đạt (sau khi làm lại)");
  assert.equal(taskTriState({ ...done }).quality.key, "chua_kiem_tra");
});

test("Việc thường không gắn chỉ số; việc huỷ không đo; việc chưa xong đo sau", () => {
  assert.equal(taskTriState({ ...done }).outcome.key, "none");
  assert.equal(taskTriState({ trangThai:"Đã huỷ", opsProposalId:"p" }).outcome.key, "na");
  assert.equal(taskTriState({ trangThai:"Đang giao", sourceRiskId:"r" }).outcome.key, "wait_done");
});

test("Tác động quản lý tự ghi chỉ là ghi chú, không biến thành Đạt", () => {
  const r = taskTriState({ ...done, sourceIssueCode:"DT01", tacDong:"doanh thu tăng 14%" });
  assert.equal(r.outcome.key, "wait_measure");
  assert.match(r.outcome.note, /tăng 14%/);
});
