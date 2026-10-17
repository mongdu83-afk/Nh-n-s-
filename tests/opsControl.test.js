// Kiểm thử "đo kết quả có nhà thuốc đối chứng" (đặc tả AI vận hành, giai đoạn 4a, 17/10/2026).
// Chạy: node --test tests/opsControl.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// TRISTATE-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// TRISTATE-ENGINE-END");
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__t = { taskTriState };", ctx);
const { taskTriState } = ctx.__t;
const done = { trangThai:"Đã hoàn thành", subTrangThai:"Đã hoàn thành", opsProposalId:"p" };
const ctl = (attribution) => ({ attribution, effect: attribution==="co_tac_dong" ? 12 : attribution==="kem_hon" ? -8 : 1, text:"x" });

test("Đạt chỉ số nhưng cả chuỗi cùng tăng → chưa chắc do việc này", () => {
  const r = taskTriState(done, { prop:{ actualOutcome:{ success:true, control:ctl("khong_ro") } } });
  assert.equal(r.outcome.key, "hieu_qua_khong_ro");
  assert.equal(r.outcome.tone, "gold");
});
test("Đạt và hơn hẳn đối chứng → Đạt thật", () => {
  const r = taskTriState(done, { prop:{ actualOutcome:{ success:true, control:ctl("co_tac_dong") } } });
  assert.equal(r.outcome.tone, "good"); assert.match(r.outcome.label, /hơn hẳn/);
});
test("Việc không có chỉ số riêng vẫn có kết quả nhờ đối chứng", () => {
  const r = taskTriState(done, { prop:{ outcome:"Chưa đo được", actualOutcome:{ success:null, control:ctl("kem_hon") } } });
  assert.equal(r.outcome.key, "ctrl_kem_hon"); assert.equal(r.outcome.tone, "warn");
});
test("Đối chứng chưa đo được thì giữ kết luận cũ, không bịa", () => {
  const r = taskTriState(done, { prop:{ outcome:"Chưa đo được", actualOutcome:{ success:null, control:{ attribution:"chua_doi_chung", effect:null } } } });
  assert.equal(r.outcome.key, "khong_do_duoc"); assert.equal(r.outcome.label, "Chưa đo được");
});
