// Kiểm thử "AI tự giao việc" cho các phần bổ sung (14/10/2026).
// Chạy: node --test tests/autoAssign.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const block = (name) => { const b = HTML.indexOf(`\n// ${name}-ENGINE-BEGIN\n`), e = HTML.indexOf(`\n// ${name}-ENGINE-END`); assert.ok(b > 0 && e > b, name); return HTML.slice(b, e); };
const ctx = vm.createContext({});
vm.runInContext(["RVD", "KBP", "PMD", "CLQ", "NS", "AA"].map(block).join("\n") + "\n;globalThis.__x = { aaPlan, rvdDiagnose };", ctx);
const { aaPlan, rvdDiagnose } = ctx.__x;

const TODAY = "2026-10-15";
function daily(from, n, fn){ const D = { revenueByDay:{}, orderCountByDay:{}, lineCountByDay:{}, hhsRevenueByDay:{} }; for(let i = 0; i < n; i++){ const d = new Date(from + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + i); const iso = d.toISOString().slice(0, 10); const x = fn(i); D.revenueByDay[iso] = x.rev; D.orderCountByDay[iso] = x.bills; D.lineCountByDay[iso] = x.bills*3; D.hhsRevenueByDay[iso] = x.rev*0.3; } return D; }
const staff = [ { id:"c59", name:"CHT 59", role:"Cửa hàng trưởng", shop:"SHOP0059" }, { id:"n72", name:"NV 72", role:"Nhân viên bán hàng", shop:"SHOP0072" } ];
const meta = { daysElapsed:14, daysInMonth:31, isCurrentMonth:true };
const D = daily("2026-09-15", 30, (i) => i < 23 ? { rev:10e6, bills:50 } : { rev:7e6, bills:35 });
const rows = { SHOP0059:{ revenue:{ target:400e6, actual:119e6 } }, SHOP0072:{ fromOrders:true, revenue:{ target:400e6, actual:119e6 } }, SHOP0058:{ revenue:{ target:300e6, actual:150e6 } } };
const revenue = { diagnose:(shop) => rvdDiagnose({ shop, month:"2026-10", today:TODAY, daily:D, computedAt:"2026-10-15T06:00:00", nowIso:"2026-10-15T12:00:00", monthRow:rows[shop], monthMeta:meta }) };
const base = (over) => ({ today:TODAY, nowMs:Date.parse("2026-10-15T12:00:00Z"), config:null, shops:["SHOP0058","SHOP0059","SHOP0072"], staff, openTasks:[], issueActions:{}, revenue, ...(over||{}) });

test("Doanh thu: chỉ giao nhà thuốc nguy cơ cao có số liệu đã xác nhận; giao cửa hàng trưởng", () => {
  const r = aaPlan(base());
  const dt = r.tasks.filter(t => t.rule === "dt01");
  assert.equal(dt.length, 1);
  assert.equal(dt[0].shop, "SHOP0059"); assert.equal(dt[0].assignType, "staff"); assert.equal(dt[0].staffId, "c59");
  assert.match(dt[0].mota, /CHỈ SỐ CAM KẾT/);
  assert.ok(r.skipped.some(s => s.rule === "dt01" && /chưa xác nhận/.test(s.reason)), "NT72 số chưa xác nhận → không giao");
});

test("Chống giao trùng: đã có việc DT01 đang mở hoặc hồ sơ đang xử lý → bỏ qua", () => {
  assert.equal(aaPlan(base({ openTasks:[{ trangThai:"Đang giao", sourceIssueCode:"DT01", shop:"SHOP0059" }] })).tasks.filter(t => t.rule==="dt01").length, 0);
  assert.equal(aaPlan(base({ issueActions:{ SHOP0059__DT01:{ status:"IN_PROGRESS" } } })).tasks.filter(t => t.rule==="dt01").length, 0);
});

test("Việc nhân sự (KPI) mặc định không tự giao; bật mới giao", () => {
  const pace = [{ staffId:"x", staffName:"Lan", shop:"SHOP0059", thang:"2026-10", workedBefore:12, doanhSoTarget:60e6, doanhSoActual:18e6, pctDoanhSoProjected:0.66, kpiPctProjected:0.72 }];
  assert.equal(aaPlan(base({ kpiPace:pace })).tasks.filter(t => t.rule==="kpi").length, 0);
  const on = aaPlan(base({ kpiPace:pace, config:{ rules:{ kpi:true } } })).tasks.filter(t => t.rule==="kpi");
  assert.equal(on.length, 1); assert.equal(on[0].module, "HR");
});

test("Checklist: giao khắc phục lỗi nghiêm trọng lặp lại; nhà thuốc chưa có CHT → giao cả nhà thuốc; đã khắc phục thì thôi", () => {
  const tpl = { "Nhân viên bán hàng":[ { id:"a", label:"Kiểm tra hạn sử dụng" } ] };
  const reports = ["2026-10-10","2026-10-11","2026-10-12"].map(d => ({ staffId:"n72", ngay:d, doneIds:{} }));
  const cl = { reports, templatesByRole:tpl, staffById:{ n72:staff[1] }, since:"2026-10-02", today:TODAY, fixTasks:[] };
  const r = aaPlan(base({ revenue:null, checklist:cl }));
  const t = r.tasks.find(x => x.rule === "checklist");
  assert.ok(t); assert.equal(t.assignType, "shop"); assert.equal(t.shop, "SHOP0072");
  const fixed = aaPlan(base({ revenue:null, checklist:{ ...cl, fixTasks:[{ checklistItemId:"a", shop:"SHOP0072", trangThai:"Đã hoàn thành", ngayHoanThanh:"2026-10-13" }] } }));
  assert.equal(fixed.tasks.filter(x => x.rule==="checklist").length, 0);
});

test("CTKM: chỉ đợt đang chạy; mỗi nhà thuốc yếu giao 1 lần cho mỗi đợt", () => {
  const camp = { running:true, label:"CTKM T10", from:"2026-10-01", to:"2026-10-31", chain:{ cost:10e6, rev:1000e6, orders:10000, promoOrders:3000, promoRev:400e6 }, shops:{ SHOP0059:{ n:1500, pn:150, rev:150e6, cost:{ v:1e6 } } } };
  const r = aaPlan(base({ revenue:null, promo:{ campKey:"c10", camp, chainDaily:null } }));
  assert.equal(r.tasks.filter(t => t.rule==="promo").length, 1);
  const again = aaPlan(base({ revenue:null, promo:{ campKey:"c10", camp, chainDaily:null }, recentAuto:[{ autoKey:"promo:c10:SHOP0059", trangThai:"Đã hoàn thành" }] }));
  assert.equal(again.tasks.filter(t => t.rule==="promo").length, 0);
  assert.equal(aaPlan(base({ revenue:null, promo:{ campKey:"c10", camp:{ ...camp, running:false }, chainDaily:null } })).tasks.length, 0);
});

test("Số liệu tồn kho cũ → giao quản lý (không giao nhà thuốc); tắt toàn bộ → không giao gì", () => {
  const r = aaPlan(base({ revenue:null, stale:{ ts:"2026-10-13T00:00:00Z" } }));
  const t = r.tasks.find(x => x.rule === "stale");
  assert.equal(t.assignType, "admin");
  assert.equal(aaPlan(base({ config:{ enabled:false }, stale:{ ts:"2026-10-13T00:00:00Z" } })).tasks.length, 0);
});

// ----- Giao theo ca làm việc (15/10/2026) -----
const shStaff = [
  { id:"c59", name:"Trần Thị Hà", role:"Cửa hàng trưởng", shop:"SHOP0059" },
  { id:"a59", name:"Nguyễn Văn An", role:"Nhân viên bán hàng", shop:"SHOP0059" },
  { id:"b59", name:"Lê Bình", role:"Nhân viên bán hàng", shop:"SHOP0059" },
  { id:"h59", name:"Học Việc", role:"Nhân viên học việc", shop:"SHOP0059" },
];
const sh = (name, date, s, e, ot) => ({ EmployeeName:name, WorkDate:date, TimeStart:`${date} ${s}:00`, TimeEnd:`${date} ${e}:00`, __isOT:!!ot });
const clIn = () => ({ reports:["2026-10-12","2026-10-13","2026-10-14"].map(d => ({ staffId:"a59", ngay:d, doneIds:{} })),
  templatesByRole:{ "Nhân viên bán hàng":[ { id:"a", label:"Kiểm tra hạn sử dụng" } ] }, staffById:{ a59:shStaff[1] }, since:"2026-10-02", today:TODAY, fixTasks:[] });

test("Việc làm ngay giao người ĐANG trong ca; hạn = giờ hết ca; không giao học việc / người đã hết ca", () => {
  const shifts = [ sh("Tran Thi Ha", TODAY, "06:00", "09:00"), sh("Nguyễn Văn An", TODAY, "07:00", "15:00"), sh("Lê Bình", TODAY, "15:00", "22:00"), sh("Học Việc", TODAY, "07:00", "22:00") ];
  const t = aaPlan(base({ revenue:null, staff:shStaff, shifts, nowHM:"09:20", checklist:clIn() })).tasks.find(x => x.rule==="checklist");
  assert.equal(t.staffId, "a59", "CHT đã hết ca 9h → giao An đang trong ca");
  assert.equal(t.deadline, TODAY); assert.equal(t.hanGio, "15:00");
  assert.match(t.mota, /Ca nhận việc: Nguyễn Văn An — hôm nay 07:00–15:00 \(đang trong ca\)/);
  const pm = aaPlan(base({ revenue:null, staff:shStaff, shifts, nowHM:"15:20", checklist:clIn() })).tasks.find(x => x.rule==="checklist");
  assert.equal(pm.staffId, "b59", "15h20: An hết ca → giao Bình ca chiều"); assert.equal(pm.hanGio, "22:00");
});

test("Việc kế hoạch ưu tiên cửa hàng trưởng có ca hôm nay / ngày mai; CHT nghỉ dài → người đang trong ca", () => {
  const tomorrow = "2026-10-16";
  const s1 = [ sh("Trần Thị Hà", tomorrow, "07:00", "15:00"), sh("Nguyễn Văn An", TODAY, "07:00", "15:00") ];
  const t1 = aaPlan(base({ staff:shStaff, shifts:s1, nowHM:"09:20" })).tasks.find(x => x.rule==="dt01");
  assert.equal(t1.staffId, "c59"); assert.ok(t1.deadline >= tomorrow, "hạn không rơi trước ca nhận việc");
  const s2 = [ sh("Trần Thị Hà", "2026-10-20", "07:00", "15:00"), sh("Nguyễn Văn An", TODAY, "07:00", "15:00") ];
  const t2 = aaPlan(base({ staff:shStaff, shifts:s2, nowHM:"09:20" })).tasks.find(x => x.rule==="dt01");
  assert.equal(t2.staffId, "a59");
});

test("Chỉ dùng ca hôm nay & ngày mai: ca ngày kia bị bỏ qua", () => {
  const far = [ sh("Nguyễn Văn An", "2026-10-17", "07:00", "15:00") ];
  const t = aaPlan(base({ revenue:null, staff:shStaff, shifts:far, nowHM:"09:20", checklist:clIn() })).tasks.find(x => x.rule==="checklist");
  assert.equal(t.staffId, "c59", "ca 17/10 (ngày kia) không được dùng → quay về CHT"); assert.match(t.mota, /Chưa có ai đăng ký ca hôm nay/);
});

test("Không ai có ca hôm nay / ngày mai / không có dữ liệu ca → giao theo nhà thuốc và ghi rõ", () => {
  const t = aaPlan(base({ revenue:null, staff:shStaff, shifts:[ sh("Người Khác", TODAY, "07:00", "15:00") ], nowHM:"09:20", checklist:clIn() })).tasks.find(x => x.rule==="checklist");
  assert.equal(t.staffId, "c59"); assert.match(t.mota, /Chưa có ai đăng ký ca hôm nay \/ ngày mai/);
  const t2 = aaPlan(base({ revenue:null, staff:shStaff, shifts:null, shiftsMissing:true, nowHM:"09:20", checklist:clIn() })).tasks.find(x => x.rule==="checklist");
  assert.match(t2.mota, /Chưa có dữ liệu lịch ca/);
});

test("Trần việc AI/nhà thuốc/ngày tính cả việc đã hoàn thành hôm nay; việc huỷ không tính", () => {
  const ai = (st) => ({ shop:"SHOP0059", ngayGiao:TODAY, trangThai:st, autoAssigned:true });
  const dt = (r) => r.tasks.filter(t => t.rule === "dt01").length;
  const done3 = [ai("Đã hoàn thành"), ai("Đã hoàn thành"), ai("Đã hoàn thành")];
  const r = aaPlan(base({ todayTasks:done3 }));
  assert.equal(dt(r), 0);
  assert.ok(r.skipped.some(s => /đã đủ 3 việc AI hôm nay/.test(s.reason)));
  assert.equal(dt(aaPlan(base({ todayTasks:[ai("Đã huỷ"), ai("Đã huỷ"), ai("Đã huỷ")] }))), 1);
  assert.equal(dt(aaPlan(base({ todayTasks:done3, config:{ dayCapPerShop:4 } }))), 1);
});

test("Quản lý đã bỏ qua DT01 trong tháng → AI không tự giao lại; bỏ qua từ tháng trước → giao lại", () => {
  const dt = (acts) => aaPlan(base({ issueActions:acts })).tasks.filter(t => t.rule === "dt01").length;
  assert.equal(dt({ SHOP0059__DT01:{ status:"REJECTED", rejectedAt:"2026-10-05T03:00:00Z" } }), 0);
  assert.equal(dt({ SHOP0059__DT01:{ status:"REJECTED", updatedAtTs:{ toDate:() => new Date("2026-10-02T03:00:00Z") } } }), 0);
  assert.equal(dt({ SHOP0059__DT01:{ status:"REJECTED", rejectedAt:"2026-09-20T03:00:00Z" } }), 1);
});
