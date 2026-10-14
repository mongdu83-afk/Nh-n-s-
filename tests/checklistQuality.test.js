// Kiểm thử "Lỗi checklist theo mức nghiêm trọng & tái diễn" (P2 — đề xuất cải tiến 14/10/2026).
// Chạy: node --test tests/checklistQuality.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// CLQ-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// CLQ-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__c = { clqAnalyze, clqSeverity };", ctx);
const { clqAnalyze, clqSeverity } = ctx.__c;
const tpl = { "Nhân viên bán hàng":[ { id:"a", label:"Kiểm tra hạn sử dụng, tách riêng hàng cận date" }, { id:"b", label:"Mặc đồng phục, đeo bảng tên" }, { id:"c", label:"Tư vấn khách", severity:"critical" } ] };
const staffById = { s1:{ role:"Nhân viên bán hàng", shop:"SHOP0059" }, s2:{ role:"Nhân viên bán hàng", shop:"SHOP0072" } };
const days = ["2026-10-08","2026-10-09","2026-10-10","2026-10-11","2026-10-12"];
const reports = days.map(d => ({ staffId:"s1", ngay:d, doneIds:{ b:true, c:true } }))      // NT59 bỏ sót "hạn sử dụng" 5 ngày
  .concat(days.map(d => ({ staffId:"s2", ngay:d, doneIds:{ a:true, c:true, b: d!=="2026-10-09" } })));

test("Xếp mức nghiêm trọng theo mẫu hoặc từ khoá", () => {
  assert.equal(clqSeverity(tpl["Nhân viên bán hàng"][0]), "critical");
  assert.equal(clqSeverity(tpl["Nhân viên bán hàng"][1]), "minor");
  assert.equal(clqSeverity(tpl["Nhân viên bán hàng"][2]), "critical");
  assert.equal(clqSeverity({ label:"Báo cáo cuối ca" }), "major");
});

test("% tổng cao vẫn nêu lỗi nghiêm trọng; phát hiện tái diễn theo nhà thuốc", () => {
  const r = clqAnalyze({ reports, templatesByRole:tpl, staffById, since:"2026-10-01", today:"2026-10-14" });
  assert.equal(r.list[0].id, "a", "lỗi nghiêm trọng xếp đầu");
  assert.deepEqual(Array.from(r.list[0].recurringShops), ["SHOP0059"]);
  assert.match(r.headline, /Hoàn thành 80% đầu việc, nhưng có 5 lần bỏ sót việc NGHIÊM TRỌNG/);
  const minor = r.list.find(x => x.id === "b");
  assert.equal(minor.recurringShops.length, 0);
});

test("Tách 'đã khắc phục' với 'đã xác minh không tái diễn'", () => {
  const r1 = clqAnalyze({ reports, templatesByRole:tpl, staffById, since:"2026-10-01", today:"2026-10-14",
    fixTasks:[ { checklistItemId:"a", shop:"SHOP0059", trangThai:"Đã hoàn thành", ngayHoanThanh:"2026-10-10" } ] });
  assert.equal(r1.list[0].fixStatus[0].state, "recurred");
  const r2 = clqAnalyze({ reports, templatesByRole:tpl, staffById, since:"2026-10-01", today:"2026-10-14",
    fixTasks:[ { checklistItemId:"a", shop:"SHOP0059", trangThai:"Đã hoàn thành", ngayHoanThanh:"2026-10-12" } ] });
  assert.equal(r2.list[0].fixStatus[0].state, "fixed");
});

test("Không có báo cáo → chưa đủ dữ liệu để kết luận", () => {
  assert.match(clqAnalyze({ reports:[], templatesByRole:tpl, staffById, since:"2026-10-01", today:"2026-10-14" }).headline, /chưa đủ dữ liệu/);
});
