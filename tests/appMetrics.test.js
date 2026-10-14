// Kiểm thử "Chỉ số đo hiệu quả của chính app" (mục 5 — đề xuất cải tiến 14/10/2026).
// Chạy: node --test tests/appMetrics.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// AM-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// AM-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__a = { appMetrics };", ctx);
const { appMetrics } = ctx.__a;
const by = (arr, k) => arr.find(x => x.key === k);

test("Tính đúng các tỷ lệ từ dữ liệu sẵn có", () => {
  const m = appMetrics({ today:"2026-10-14", since:"2026-07-16",
    tasksDone:[ { trangThai:"Đã hoàn thành", deadline:"2026-10-05", ngayHoanThanh:"2026-10-04" }, { trangThai:"Đã hoàn thành", deadline:"2026-10-05", ngayHoanThanh:"2026-10-07" } ],
    issueActions:[
      { code:"HH01", status:"CLOSED", assignedTaskId:"t1", effectiveness:"hieu_qua", resultBefore:{ items:[1] }, detectedAtTs:"2026-10-01T08:00:00Z", assignedAtTs:"2026-10-01T14:00:00Z" },
      { code:"DT01", status:"REOPENED", assignedTaskId:"t2", effectiveness:"khong_hieu_qua", recurrence:true, resultBefore:{ items:[] } },
      { code:"NS01", status:"REJECTED" },
    ],
    issueHistory:[ { action:"REOPEN" } ],
    promoIndex:{ campaigns:[ { key:"c1", kind:"campaign" }, { key:"c2", kind:"campaign" }, { key:"c3", kind:"campaign", running:true } ] },
    promoReviews:{ c1:{ decision:"Tiếp tục" } } });
  assert.equal(by(m, "onTime").value, 0.5);
  assert.equal(by(m, "lead").value, 6);
  assert.equal(by(m, "resolved").value, 0.5);
  assert.equal(by(m, "recur").value, 0.5);
  assert.match(by(m, "recur").detail, /1 lần mở lại/);
  assert.equal(by(m, "evidence").value, 0.5);
  assert.equal(by(m, "goods").value, 1);
  assert.equal(by(m, "promo").value, 0.5, "chỉ tính đợt đã kết thúc");
});

test("Không có dữ liệu gốc → 'chưa đo được' kèm lý do, không ước lượng", () => {
  const m = appMetrics({ today:"2026-10-14", since:"2026-07-16", tasksDone:[], issueActions:[], issueHistory:[], promoIndex:null, promoReviews:{} });
  m.forEach(x => { assert.equal(x.value, null, x.key); assert.ok(x.insufficient, x.key); });
});
