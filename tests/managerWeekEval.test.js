// Bộ kiểm thử nghiệm thu "Báo cáo tổng hợp tuần" (bộ đánh giá MWE trong index.html).
// Chạy: node --test tests/managerWeekEval.test.js   (Node ≥ 18, không cần cài thêm gì)
// Bộ đánh giá được cắt nguyên văn từ index.html (giữa 2 dòng MWE-ENGINE-BEGIN / MWE-ENGINE-END) nên luôn kiểm
// đúng mã đang chạy trong app.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const begin = HTML.indexOf("\n// MWE-ENGINE-BEGIN\n"), end = HTML.indexOf("\n// MWE-ENGINE-END");
assert.ok(begin > 0 && end > begin, "Không tìm thấy khối MWE-ENGINE trong index.html");
const ctx = vm.createContext({ console });
vm.runInContext(HTML.slice(begin, end) + "\n;globalThis.__mwe = { mweEvaluate, mweClassifyResult, mweAnalyzePlanRow, mweAiStaleness, mweEvalKpi, mweMergeConfig, MWE_DEFAULT_CONFIG };", ctx);
const M = ctx.__mwe;

// ---------- Dữ liệu mẫu ----------
const W = "2026-10-05", PW = "2026-09-28", P2W = "2026-09-21";
const TODAY = "2026-10-13"; // tuần W đã kết thúc
const days = (start, n) => Array.from({ length:n }, (_, i) => { const d = new Date(start + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
function pos(weekRev, weekOrd, prevRev, prevOrd){
  const revenueByDay = {}, orderCountByDay = {};
  days(PW, 7).forEach(d => { revenueByDay[d] = prevRev/7; orderCountByDay[d] = prevOrd/7; });
  days(W, 7).forEach(d => { revenueByDay[d] = weekRev/7; orderCountByDay[d] = weekOrd/7; });
  return { revenueByDay, orderCountByDay };
}
const row = (noiDung, extra) => ({ id:Math.random().toString(36).slice(2), noiDung, target:"", nguoiThucHienIds:[], deadline:"", ketQua:"", ...extra });
const emptyCats = () => ({ khachHang:[], hangHoa:[], nhanSu:[], coSoVatChat:[] });
const report = (shop, week, parts) => ({ shop, tuanNgay:week, nguoiBaoCao:"CHT "+shop, ketQua:{ ...emptyCats(), ...(parts.ketQua||{}) }, keHoach:{ ...emptyCats(), ...(parts.keHoach||{}) }, ...(parts.extra||{}) });
const goodPlan = [row("Gọi lại 30 khách VIP lâu chưa quay lại, nếu không liên lạc được thì nhắn Zalo", { target:"30 khách", nguoiThucHienIds:["s1"], deadline:"2026-10-15" })];

function baseInput(){
  const A = "SHOP0058", B = "SHOP0059", C = "SHOP0072", D = "SHOP0074", E = "SHOP0089", F = "SHOP0095", G = "SHOP0121";
  return {
    weekStart:W, today:TODAY,
    shops:[A, B, C, D, E, F, G],
    staffNames:{ s1:"Lan", s2:"Minh" },
    weekTargets:{ [A]:{ rev:100e6, hhs:30e6 }, [B]:{ rev:100e6 }, [C]:{ rev:80e6 }, [D]:{ rev:80e6 }, [F]:{ rev:90e6 }, [G]:{ rev:90e6 } },
    prevWeekTargets:{ [B]:{ rev:100e6 } },
    weekReview:{ [A]:{ rev:120e6, hhs:33e6 } },
    nextWeekTargets:{ [B]:{ rev:105e6 } },
    monthTargets:{ [A]:{ revenue:430e6, tbb:200000 }, [B]:{ revenue:430e6, tbb:200000 } },
    pos:{
      [A]: pos(120e6, 560, 100e6, 500),
      [B]: pos(65e6, 400, 80e6, 450),
      [C]: pos(80e6, 400, 80e6, 400),
      [D]: pos(82e6, 410, 80e6, 400),
      [F]: pos(90e6, 450, 90e6, 450),
      [G]: pos(91e6, 450, 90e6, 450),
    },
    overdue:{ [A]:0, [B]:0, [C]:0, [D]:0, [E]:0, [F]:0, [G]:0 },
    reports:{
      [A]: report(A, W, { keHoach:{ khachHang:goodPlan } }),
      // 65% doanh thu; kế hoạch tuần tới chỉ có việc cơ sở vật chất → vấn đề doanh thu chưa có trong kế hoạch
      [B]: report(B, W, { keHoach:{ coSoVatChat:[row("Sửa điều hoà phòng bán hàng", { target:"1 máy", nguoiThucHienIds:["s2"], deadline:"2026-10-14" })] } }),
      // cam kết tuyển nhân sự chưa làm (lặp lại từ tuần trước)
      [C]: report(C, W, { ketQua:{ nhanSu:[row("Tuyển 1 nhân viên bán hàng", { target:"1 người", fromPlan:true, ketQua:"Chưa tuyển được, chưa có ứng viên phù hợp" })] }, keHoach:{ khachHang:goodPlan } }),
      // kế hoạch chung chung
      [D]: report(D, W, { keHoach:{ khachHang:[row("Tăng doanh thu"), row("Chăm sóc khách hàng tốt hơn")] } }),
      // E: không gửi báo cáo, không có POS, không có chỉ tiêu
      [F]: report(F, W, { ketQua:{ hangHoa:[row("Đặt hàng bổ sung các mã hết hàng", { target:"20 mã", fromPlan:true, ketQua:"Mới đặt được 8/20 mã, còn lại chờ công ty" })] }, keHoach:{ hangHoa:[row("Đặt nốt 12 mã hết hàng, nếu công ty chưa giao thì xin điều chuyển", { target:"12 mã", nguoiThucHienIds:["s1"], deadline:"2026-10-14" })] } }),
      [G]: report(G, W, { ketQua:{ hangHoa:[row("Đặt hàng các mã đang hết hàng", { target:"15 mã", fromPlan:true, ketQua:"Chưa đặt được do hệ thống lỗi" })] }, keHoach:{ khachHang:goodPlan } }),
    },
    prevReports:{
      [C]: report(C, PW, { keHoach:{ nhanSu:[row("Tuyển 1 nhân viên bán hàng", { target:"1 người", nguoiThucHienIds:["s2"], deadline:"2026-10-10" })] },
                          ketQua:{ nhanSu:[row("Tuyển 1 nhân viên bán hàng", { target:"1 người", fromPlan:true, ketQua:"Chưa có ứng viên" })] } }),
      [E]: report(E, PW, { keHoach:{ khachHang:[row("Gọi 20 khách cũ", { target:"20 khách" })] } }),
      [F]: report(F, PW, { keHoach:{ hangHoa:[row("Đặt hàng bổ sung các mã hết hàng", { target:"20 mã" })] } }),
      [G]: report(G, PW, { keHoach:{ hangHoa:[row("Đặt hàng các mã đang hết hàng", { target:"15 mã" })] } }),
    },
    prev2Reports:{},
  };
}
const shopOf = (ev, code) => ev.shops.find(e => e.shop === code);

test("1. Nhà thuốc đạt 120% doanh thu: ghi nhận vượt mục tiêu + phân tích chỉ số hỗ trợ", () => {
  const ev = M.mweEvaluate(baseInput());
  const a = shopOf(ev, "SHOP0058");
  assert.equal(a.kpis.revenue.status.code, "exceed");
  assert.equal(Math.round(a.kpis.revenue.pct), 120);
  assert.equal(a.kpis.revenue.source, "Số chốt tuần (weeklyTargets)");
  assert.ok(a.causes.some(c => c.kind === "decomp" && /số bill \+12%/.test(c.text)), "phải tách được tác động số bill");
  assert.ok(a.causes.some(c => c.kind === "tbb" && /hỗ trợ/.test(c.text)), "phải nêu TBB hỗ trợ kết quả");
  assert.equal(a.kpis.hhs.status.code, "exceed");
  assert.ok(ev.part1.positives.some(p => /NT58 vượt chỉ tiêu doanh thu: 120%/.test(p)));
});

test("2. Nhà thuốc đạt 65%: chỉ rõ khoảng cách, mức ưu tiên và hành động", () => {
  const ev = M.mweEvaluate(baseInput());
  const b = shopOf(ev, "SHOP0059");
  assert.equal(Math.round(b.kpis.revenue.pct), 65);
  assert.equal(b.kpis.revenue.status.code, "severe");
  assert.equal(b.kpis.revenue.status.tone, "red");
  assert.equal(Math.round(b.kpis.revenue.gap), 35e6);
  const act = ev.actions.find(x => x.key === "kpi:revenue:P0");
  assert.ok(act && act.shops.some(s => s.shop === "SHOP0059"), "phải có hành động P0 cho NT59");
  const e = act.shops.find(s => s.shop === "SHOP0059");
  assert.match(e.detail, /còn thiếu 35,0 tr/);
  assert.match(e.target, /105,0 tr/);  // chỉ tiêu tuần tới lấy từ dữ liệu
  assert.ok(b.causes.some(c => c.kind === "decomp" && c.driver === "bills"), "nguyên nhân chính phải là số bill giảm (có số chứng minh)");
  assert.ok(b.causeGap.some(t => /lượt khách/.test(t)), "phải ghi rõ chưa đủ dữ liệu xác định nguyên nhân gốc");
});

test("3. Cam kết tuyển nhân sự tuần trước chưa thực hiện → cam kết tồn đọng, lặp lại", () => {
  const ev = M.mweEvaluate(baseInput());
  const c = shopOf(ev, "SHOP0072");
  const cm = c.commitments.find(x => /Tuyển/.test(x.noiDung));
  assert.equal(cm.status.bucket, "notDone");
  assert.equal(cm.recurringWeeks, 2);
  assert.ok(ev.part3.notDone.includes(cm));
  assert.ok(ev.part3.recurring.includes(cm));
  assert.ok(ev.part3.notCarried.includes(cm), "kế hoạch tuần tới của NT72 không có việc tuyển dụng → phải bị đánh dấu chưa chuyển tiếp");
  const act = ev.actions.find(x => x.key === "commit:nhanSu:tuyenDung:rec");
  assert.ok(act && act.priority === "P1" && act.shops[0].owner === "Minh");
});

test("4. Kế hoạch 'tăng doanh thu, chăm sóc khách hàng tốt hơn' → chưa đủ cụ thể", () => {
  const ev = M.mweEvaluate(baseInput());
  const d = shopOf(ev, "SHOP0074");
  assert.ok(d.plan.score < 40, "điểm phải dưới 40, thực tế " + d.plan.score);
  assert.equal(d.plan.grade, "Chưa đạt yêu cầu");
  d.plan.rows.forEach(r => {
    assert.ok(r.vague, `"${r.noiDung}" phải bị nhận là chung chung`);
    ["Thiếu chỉ tiêu định lượng", "Thiếu người phụ trách", "Thiếu thời hạn"].forEach(m => assert.ok(r.missing.some(x => x.startsWith(m)), `"${r.noiDung}" thiếu: ${m}`));
  });
  assert.equal(d.plan.breakdown.quant.score, 0);
  assert.equal(d.plan.breakdown.ownerDeadline.score, 0);
  assert.ok(ev.actions.find(a => a.key === "planQuality").shops.some(s => s.shop === "SHOP0074"));
});

test("5. Báo cáo thiếu dữ liệu → chưa đủ cơ sở, không bịa số, không kết luận đạt", () => {
  const ev = M.mweEvaluate(baseInput());
  const e = shopOf(ev, "SHOP0089");
  assert.equal(e.reported, false);
  assert.equal(e.kpis.revenue.actual, null);
  assert.equal(e.kpis.revenue.pct, null);
  assert.equal(e.kpis.revenue.status.code, "nodata");
  assert.equal(e.kpis.revenue.status.tone, "grey");
  assert.equal(e.plan.grade, "Chưa gửi báo cáo");
  assert.equal(e.commitments[0].status.bucket, "noEvidence");
  assert.ok(ev.dataGaps.some(g => /NT89/.test(g.what)));
  assert.ok(!ev.part1.positives.some(p => /NT89/.test(p)));
  // Chỉ tiêu bằng 0 / số lỗi không gây chia cho 0
  const k0 = M.mweEvalKpi({ key:"x", label:"x", unit:"vnd", target:0, actual:5, th:M.MWE_DEFAULT_CONFIG.kpi.revenue });
  assert.equal(k0.status.code, "na"); assert.equal(k0.pct, null);
  const kErr = M.mweEvalKpi({ key:"x", label:"x", unit:"vnd", target:"abc", actual:5, th:M.MWE_DEFAULT_CONFIG.kpi.revenue });
  assert.equal(kErr.status.code, "error");
  const kNeg = M.mweEvalKpi({ key:"x", label:"x", unit:"vnd", target:100, actual:-3, th:M.MWE_DEFAULT_CONFIG.kpi.revenue });
  assert.equal(kNeg.status.code, "error");
  // Ghi chú chung chung không được coi là hoàn thành
  ["Đã làm", "ok", "Đạt tiến độ", "ổn"].forEach(t => assert.notEqual(M.mweClassifyResult({ ketQua:t, target:"" }).bucket, "done", t));
  // Hoạt động ≠ kết quả
  const fl = M.mweClassifyResult({ ketQua:"Đã phát 500 tờ rơi quanh khu dân cư", target:"Doanh thu tăng 10%" });
  assert.equal(fl.code, "activity");
});

test("6. Vấn đề xuất hiện ở nhiều nhà thuốc → phát hiện xu hướng chung, giữ hành động riêng từng nhà thuốc", () => {
  const ev = M.mweEvaluate(baseInput());
  const ci = ev.commonIssues.find(x => x.topic === "hetHang");
  assert.ok(ci, "phải có vấn đề chung 'hết hàng'");
  assert.deepEqual(Array.from(ci.shops.map(s => s.shop)).sort(), ["SHOP0095", "SHOP0121"]);
  const g = ev.actions.filter(a => a.key.startsWith("commit:hangHoa:hetHang"));
  const shopsInGroups = Array.from(g.flatMap(a => a.shops.map(s => s.shop))).sort();
  assert.deepEqual(shopsInGroups, ["SHOP0095", "SHOP0121"]);
  const f = g.flatMap(a => a.shops).find(s => s.shop === "SHOP0095");
  const gg = g.flatMap(a => a.shops).find(s => s.shop === "SHOP0121");
  assert.equal(f.target, "20 mã"); assert.equal(gg.target, "15 mã");
  assert.equal(shopOf(ev, "SHOP0095").commitments[0].status.bucket, "partial");
});

test("7. Vấn đề tuần này chưa có trong kế hoạch tuần tới → đề xuất bổ sung", () => {
  const ev = M.mweEvaluate(baseInput());
  const b = shopOf(ev, "SHOP0059");
  assert.ok(b.plan.uncovered.some(u => u.id === "kpi:revenue"));
  const a = ev.actions.find(x => x.key === "uncovered:doanhThu:kpi");
  assert.ok(a && a.priority === "P1" && a.shops.some(s => s.shop === "SHOP0059"));
  // NT95 đã đưa việc hết hàng vào kế hoạch → không bị đề xuất bổ sung
  assert.equal(shopOf(ev, "SHOP0095").plan.uncovered.length, 0);
});

test("8. Báo cáo sửa sau khi AI phân tích → nhận xét AI bị đánh dấu cũ; bộ đánh giá tính lại theo dữ liệu mới", () => {
  const I = baseInput();
  const ai = { aiStatus:"ok", aiUpdatedAtTs:{ seconds:1760000000, nanoseconds:0 }, shopsMissing:["SHOP0089"] };
  const reps = Object.values(I.reports).map(r => ({ ...r, updatedAtTs:{ seconds:1759990000 } }));
  assert.equal(M.mweAiStaleness(ai, reps).stale, false);
  reps[2] = { ...reps[2], updatedAtTs:{ seconds:1760000500 } };
  const st = M.mweAiStaleness(ai, reps);
  assert.equal(st.stale, true); assert.match(st.reasons[0], /NT72/);
  const st2 = M.mweAiStaleness(ai, reps.concat([{ shop:"SHOP0089", updatedAtTs:{ seconds:1759000000 } }]));
  assert.ok(st2.reasons.some(r => /NT89 lúc phân tích chưa có báo cáo/.test(r)));
  // Bộ đánh giá không có bộ nhớ đệm: sửa báo cáo → kết quả đổi ngay
  I.reports.SHOP0072.ketQua.nhanSu[0].ketQua = "Đã tuyển được 1 người, đi làm từ thứ Hai";
  const ev = M.mweEvaluate(I);
  assert.equal(shopOf(ev, "SHOP0072").commitments[0].status.bucket, "done");
});

test("9. Quyền: chỉ quản lý được gọi phân tích cấp quản lý", () => {
  // Giao diện: tab "Báo cáo quản lý" chỉ hiện với quản lý, và runMgrAi tự chặn nếu không phải quản lý.
  assert.match(HTML, /activeSub==="quanly" && isAdmin && React\.createElement\(WeeklyPlanManagerView, \{ key:"v", isAdmin \}\)/);
  assert.match(HTML, /async function runMgrAi\(force\)\{\s*if\(!isAdmin\)/);
  assert.match(HTML, /\{ id:"quanly", label:"Báo cáo quản lý", adminOnly:true \}/);
});

test("10. Báo cáo cuối cùng khớp dữ liệu nguồn (số liệu, tên nhà thuốc, kỳ, KPI, cam kết, hành động)", () => {
  const I = baseInput();
  const ev = M.mweEvaluate(I);
  assert.equal(ev.meta.weekStart, W); assert.equal(ev.meta.weekEnd, "2026-10-11"); assert.equal(ev.meta.nextWeekStart, "2026-10-12");
  assert.deepEqual(Array.from(ev.shops.map(e => e.shop)), I.shops);
  assert.equal(ev.meta.reportsCount, Object.keys(I.reports).length);
  // doanh thu từng nhà thuốc = nguồn (số chốt nếu có, không thì tổng POS 7 ngày)
  ev.shops.forEach(e => {
    const src = I.weekReview[e.shop] ? I.weekReview[e.shop].rev : (I.pos[e.shop] ? days(W, 7).reduce((a, d) => a + I.pos[e.shop].revenueByDay[d], 0) : null);
    if(src == null) assert.equal(e.kpis.revenue.actual, null);
    else assert.ok(Math.abs(e.kpis.revenue.actual - src) < 1, e.shop);
    if(I.weekTargets[e.shop]) assert.equal(e.kpis.revenue.target, I.weekTargets[e.shop].rev);
  });
  // tổng khu vực = tổng các nhà thuốc có đủ số liệu
  const counted = ev.shops.filter(e => e.kpis.revenue.actual != null && e.kpis.revenue.target > 0);
  assert.equal(Math.round(ev.region.revenue.actual), Math.round(counted.reduce((a, e) => a + e.kpis.revenue.actual, 0)));
  // số cam kết = số dòng kế hoạch tuần trước (hoặc dòng kết quả fromPlan khi không có báo cáo tuần trước)
  const expected = I.shops.reduce((a, s) => {
    const p = I.prevReports[s];
    if(p) return a + Object.values(p.keHoach).reduce((x, rows) => x + rows.length, 0);
    const r = I.reports[s];
    return a + (r ? Object.values(r.ketQua).reduce((x, rows) => x + rows.filter(y => y.fromPlan).length, 0) : 0);
  }, 0);
  assert.equal(ev.region.commitments.total, expected);
  // mọi hành động chỉ nhắc tới nhà thuốc có trong dữ liệu; mọi hành động đều ở trạng thái đề xuất
  ev.actions.forEach(a => {
    a.shops.forEach(s => assert.ok(I.shops.includes(s.shop)));
    assert.equal(a.status, "proposed");
    assert.ok(["P0", "P1", "P2", "P3"].includes(a.priority));
  });
  // hạn do bộ đánh giá đề xuất được đánh dấu là đề xuất (không lẫn với dữ liệu)
  ev.actions.flatMap(a => a.shops).filter(s => !s.fromData).forEach(s => assert.ok(s.deadlineProposed || s.deadline));
  // cam kết quản lý đã xác nhận → đề xuất tương ứng đổi trạng thái
  const ev2 = M.mweEvaluate({ ...I, mgrCommitments:[{ sourceKey:"kpi:revenue:P0" }] });
  assert.equal(ev2.actions.find(a => a.key === "kpi:revenue:P0").status, "confirmed");
});

test("Cấu hình: ngưỡng quản lý chỉnh được, giữ thứ tự hợp lệ", () => {
  const c = M.mweMergeConfig({ kpi:{ revenue:{ exceed:110, meet:95, risk:80, severe:90 } }, planWeights:{ risk:0 } });
  assert.equal(c.custom, true);
  assert.equal(c.kpi.revenue.severe, 80); // severe không được lớn hơn risk
  assert.equal(c.planWeights.risk, 0);
  assert.equal(M.mweMergeConfig(null).custom, false);
  const I = baseInput(); I.config = { kpi:{ revenue:{ meet:60, risk:50, severe:40, exceed:130 } } };
  assert.equal(shopOf(M.mweEvaluate(I), "SHOP0059").kpis.revenue.status.code, "meet");
});

test("Tuần đang diễn ra: so theo tiến độ, tính doanh thu cần mỗi ngày", () => {
  const I = baseInput(); I.today = "2026-10-08"; // thứ Năm → 3 ngày bán trọn vẹn
  delete I.weekReview;
  const ev = M.mweEvaluate(I);
  const b = shopOf(ev, "SHOP0059");
  assert.equal(ev.meta.elapsed, 3);
  assert.ok(Math.abs(b.kpis.revenue.paceTarget - 100e6 * 3 / 7) < 1);
  assert.equal(b.kpis.revenue.remainingDays, 4);
  assert.ok(Math.abs(b.kpis.revenue.needPerDay - (100e6 - 65e6 * 3 / 7) / 4) < 1);
  assert.match(b.kpis.revenue.status.basis, /3\/7/);
});
