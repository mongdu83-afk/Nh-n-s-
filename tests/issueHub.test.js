// Kiểm thử danh sách vấn đề gộp (đặc tả AI vận hành, giai đoạn 2b, 17/10/2026).
// Chạy: node --test tests/issueHub.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// ISSUEHUB-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// ISSUEHUB-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__t = { issueHubMerge };", ctx);
const { issueHubMerge } = ctx.__t;
const NOW = "2026-10-17T10:00";

test("Cùng nhà thuốc + mã ở Sức khoẻ, Rủi ro, Đề xuất AI → 1 dòng, ghi số cảnh báo đã gộp", () => {
  const r = issueHubMerge({ nowTs:NOW, healthAt:"2026-10-17T06:55:00Z",
    issues:[ { shopCode:"SHOP0059", code:"HH01", title:"Thiếu hàng bán nhanh", severity:"red" } ],
    risks:[ { id:"r1", shop:"SHOP0059", code:"HH01", level:"HIGH", isOpen:true, title:"Thiếu hàng", evidence:{ computedAt:"2026-10-17T07:00:00Z" } } ],
    proposals:[ { id:"p1", shop:"SHOP0059", type:"HH01", status:"pending", title:"Đặt bổ sung 5 mã", why:"Tồn dưới 3 ngày bán" } ] });
  assert.equal(r.rows.length, 1);
  assert.equal(r.merged, 2);
  const x = r.rows[0];
  assert.deepEqual(Array.from(x.sources), ["health", "risk", "ai"]);
  assert.equal(x.status, "AI_PENDING");
  assert.equal(x.action, "Đặt bổ sung 5 mã");
  assert.equal(x.dataAsOf, "2026-10-17T07:00:00Z");
  assert.equal(x.causeConfirmed, null, "chưa ai xác nhận nguyên nhân");
  assert.equal(x.hypothesis, "Tồn dưới 3 ngày bán");
});

test("Rủi ro / đề xuất không có ở Sức khoẻ vẫn thành dòng riêng, đúng phạm vi nhà thuốc", () => {
  const r = issueHubMerge({ nowTs:NOW, scopeShop:"SHOP0072",
    risks:[ { id:"r1", shop:"SHOP0072", code:"CP01", level:"MEDIUM", isOpen:true, title:"Checklist thiếu" }, { id:"r2", shop:"SHOP0059", code:"DT02", level:"HIGH", isOpen:true } ],
    proposals:[ { id:"p1", shop:"SHOP0072", type:"KM_PUSH", status:"pending" }, { id:"p2", target:{ shop:"SHOP0072" }, type:"NS01", status:"pending", sev:"HIGH", title:"Kèm NV chậm KPI" } ] });
  assert.equal(r.rows.length, 2, "loại việc không phải mã vấn đề (KM_PUSH) và nhà thuốc ngoài phạm vi bị bỏ");
  assert.equal(r.rows[0].code, "NS01"); assert.equal(r.rows[0].severity, "red"); assert.equal(r.rows[0].onlyFrom, "ai");
  assert.equal(r.rows[1].code, "CP01"); assert.equal(r.rows[1].tab, "risk"); assert.equal(r.rows[1].param.riskId, "r1");
});

test("Người phụ trách và quá hạn lấy từ việc đã giao; đã nộp kết quả thì không tính quá hạn", () => {
  const base = { nowTs:NOW, issues:[ { shopCode:"SHOP0059", code:"DT01", severity:"orange" }, { shopCode:"SHOP0058", code:"DT01", severity:"orange" } ],
    issueActions:{ "SHOP0059__DT01":{ status:"IN_PROGRESS", assignedTaskId:"t1" }, "SHOP0058__DT01":{ status:"IN_PROGRESS", assignedTaskId:"t2" } },
    openTasks:[ { id:"t1", staffName:"Hà Thị Ngọc Ánh", deadline:"2026-10-16" }, { id:"t2", assignType:"shop", shop:"SHOP0058", deadline:"2026-10-16", subTrangThai:"Chờ kiểm tra" } ] };
  const r = issueHubMerge(base);
  const a = r.rows.find(x => x.shopCode==="SHOP0059"), c = r.rows.find(x => x.shopCode==="SHOP0058");
  assert.equal(a.owner, "Hà Thị Ngọc Ánh"); assert.equal(a.overdue, true); assert.equal(a.status, "IN_PROGRESS");
  assert.equal(c.owner, "Cả nhà thuốc SHOP0058"); assert.equal(c.overdue, false);
  assert.equal(r.rows[0].shopCode, "SHOP0059", "việc quá hạn xếp trước khi cùng mức");
});

test("Chỉ ghi 'đã xác nhận' khi hồ sơ có causeConfirmed", () => {
  const r = issueHubMerge({ nowTs:NOW, issues:[ { shopCode:"SHOP0059", code:"NS01", severity:"orange", hypothesis:"Thiếu ca" } ],
    issueActions:{ "SHOP0059__NS01":{ status:"IN_PROGRESS", rootCause:"2 NV nghỉ phép", causeConfirmed:true } } });
  assert.equal(r.rows[0].causeConfirmed, "2 NV nghỉ phép"); assert.equal(r.rows[0].hypothesis, null);
});
