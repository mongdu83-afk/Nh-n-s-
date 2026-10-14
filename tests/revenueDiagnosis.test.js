// Kiểm thử nghiệp vụ "Chẩn đoán doanh thu nhà thuốc" (P0 Doanh thu & KPI — đề xuất cải tiến vận hành 14/10/2026).
// Chạy: node --test tests/revenueDiagnosis.test.js   (Node ≥ 18)
// Mã được cắt nguyên văn từ index.html (giữa RVD-ENGINE-BEGIN / RVD-ENGINE-END) nên luôn kiểm đúng mã đang chạy.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// RVD-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// RVD-ENGINE-END");
assert.ok(b > 0 && e > b, "Không tìm thấy khối RVD-ENGINE trong index.html");
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__r = { rvdDiagnose, rvdRank, rvdMeasureAfter };", ctx);
const { rvdDiagnose, rvdRank, rvdMeasureAfter } = ctx.__r;

// Dữ liệu ngày: fn(dateISO, index) → { rev, bills, lines, hhs }
function daily(from, n, fn){
  const D = { revenueByDay:{}, orderCountByDay:{}, lineCountByDay:{}, hhsRevenueByDay:{} };
  for(let i = 0; i < n; i++){
    const d = new Date(from + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10), x = fn(iso, i);
    D.revenueByDay[iso] = x.rev; D.orderCountByDay[iso] = x.bills; D.lineCountByDay[iso] = x.lines; D.hhsRevenueByDay[iso] = x.hhs;
  }
  return D;
}
const TODAY = "2026-10-15"; // đã qua 14 ngày trọn vẹn của tháng 10 (31 ngày)
const META = { daysElapsed:14, daysInMonth:31, isCurrentMonth:true };
const flat = (rev, bills, lines, hhs) => () => ({ rev, bills, lines, hhs });

test("Nghiệm thu P0: chọn nhà thuốc + kỳ → mục tiêu, thực tế, chênh lệch, tốc độ cần đạt, bằng chứng, bước tiếp theo", () => {
  // 30 ngày (16/9–15/10): 14 ngày trước ổn định, 7 ngày gần nhất số bill giảm mạnh
  const D = daily("2026-09-15", 30, (iso, i) => i < 23 ? { rev:10e6, bills:50, lines:150, hhs:3e6 } : { rev:7e6, bills:35, lines:105, hhs:2.1e6 });
  const r = rvdDiagnose({ shop:"SHOP0059", month:"2026-10", today:TODAY, daily:D, monthMeta:META, computedAt:"2026-10-15T06:00:00",
    monthRow:{ revenue:{ target:400e6, actual:119e6 } } });
  assert.equal(r.target.target, 400e6); assert.equal(r.target.actual, 119e6);
  assert.equal(Math.round(r.target.gap), 281e6);
  assert.equal(r.period.remaining, 17);
  assert.equal(Math.round(r.target.needPerDay), Math.round(281e6 / 17));
  assert.ok(r.target.upliftPct > 90, "phải nêu mức tăng cần thiết so với tốc độ hiện tại");
  assert.match(r.target.assumption, /giả định giữ nguyên tốc độ/);
  assert.equal(r.status.code, "high");
  assert.ok(r.facts.some(f => /số bill -30%/.test(f)), "phải có dữ kiện số bill giảm 30% so với kỳ đối chứng");
  const h = r.hypotheses.find(x => x.key === "bills");
  assert.ok(h && h.confidence && h.evidence, "giả thuyết phải có bằng chứng và mức chắc chắn");
  assert.ok(r.actions.some(a => a.key === "bills"), "đề xuất phải gắn với tín hiệu số bill");
  assert.ok(r.plan && /≥ 16,5 tr\/ngày/.test(r.plan.commitment), "phải có kế hoạch bù với chỉ số cam kết");
  assert.ok(r.plan.checkpoint, "kế hoạch bù phải có mốc kiểm tra lại");
});

test("Thiếu căn cứ → 'Chưa đủ dữ liệu để kết luận', không bịa số", () => {
  const r = rvdDiagnose({ shop:"SHOP0089", month:"2026-10", today:TODAY, daily:{}, monthMeta:META, monthRow:null });
  assert.equal(r.status.code, "nodata");
  assert.equal(r.target.pct, null); assert.equal(r.target.gap, null);
  assert.match(r.conclusion, /^Chưa đủ dữ liệu để kết luận/);
  assert.equal(r.plan, null);
  const z = rvdDiagnose({ shop:"X", month:"2026-10", today:TODAY, daily:{}, monthMeta:META, monthRow:{ revenue:{ target:0, actual:5e6 } } });
  assert.equal(z.target.pct, null, "chỉ tiêu = 0 không được chia");
  assert.ok(z.insufficient.some(t => /bằng 0/.test(t)));
});

test("Không mặc định quy cho nhân viên; không kết luận nguyên nhân khi không có tín hiệu", () => {
  const D = daily("2026-09-15", 30, flat(10e6, 50, 150, 3e6));
  const r = rvdDiagnose({ shop:"S", month:"2026-10", today:TODAY, daily:D, monthMeta:META, monthRow:{ revenue:{ target:400e6, actual:140e6 } } });
  assert.equal(r.status.code, "high");
  assert.equal(r.hypotheses[0].key, "none");
  assert.match(r.conclusion, /Chưa đủ dữ liệu để kết luận nguyên nhân/);
  assert.ok(r.actions.some(a => a.key === "review"), "chỉ đề xuất CHT rà soát");
  const all = JSON.stringify(r);
  assert.ok(!/nhân viên bán kém|thái độ|năng lực/.test(all));
});

test("Dữ liệu chưa xác nhận / chưa cập nhật được đánh dấu, không đưa vào kết luận 'đạt'", () => {
  const D = daily("2026-09-15", 30, flat(20e6, 80, 240, 6e6));
  const r = rvdDiagnose({ shop:"S", month:"2026-10", today:TODAY, daily:D, monthMeta:META, computedAt:"2026-10-12T06:00:00",
    monthRow:{ fromOrders:true, revenue:{ target:400e6, actual:280e6 } } });
  assert.equal(r.status.code, "onTrack");
  assert.equal(r.status.tone, "yellow", "đúng tiến độ nhưng số chưa xác nhận → vàng, cần xác minh");
  assert.ok(r.dataNotes.some(t => /chưa xác nhận/.test(t)));
  assert.ok(r.freshness.stale && r.dataNotes.some(t => /chưa cập nhật/.test(t)));
});

test("Xếp hạng theo nguy cơ không đạt, không theo doanh thu tuyệt đối", () => {
  const D = daily("2026-09-15", 30, flat(10e6, 50, 150, 3e6));
  const mk = (shop, target, actual) => rvdDiagnose({ shop, month:"2026-10", today:TODAY, daily:D, monthMeta:META, monthRow:{ revenue:{ target, actual } } });
  const big = mk("BIG", 900e6, 360e6);    // doanh thu lớn nhưng dự báo ~88%
  const small = mk("SMALL", 150e6, 70e6); // doanh thu nhỏ nhưng dự báo ~105%
  const mid = mk("MID", 400e6, 175e6);    // dự báo ~97%
  assert.deepEqual(Array.from(rvdRank([small, mid, big]).map(x => x.shop)), ["BIG", "MID", "SMALL"]);
});

test("Phân rã: TB bill, số mã/bill, hàng hệ số, ngày yếu trong tuần", () => {
  // TBB giảm, số mã/bill giảm, tỷ trọng hệ số giảm ở 7 ngày gần nhất; Chủ nhật luôn thấp
  const D = daily("2026-09-15", 30, (iso, i) => {
    const sunday = new Date(iso + "T00:00:00Z").getUTCDay() === 0;
    const base = i < 23 ? { rev:10e6, bills:50, lines:150, hhs:3e6 } : { rev:8.5e6, bills:50, lines:120, hhs:2e6 };
    return sunday ? { rev:base.rev*0.6, bills:base.bills*0.6, lines:base.lines*0.6, hhs:base.hhs*0.6 } : base;
  });
  const r = rvdDiagnose({ shop:"S", month:"2026-10", today:TODAY, daily:D, monthMeta:META, monthRow:{ revenue:{ target:400e6, actual:130e6 } } });
  const keys = Array.from(r.hypotheses.map(h => h.key));
  ["tbb", "sku", "hhs", "weekday"].forEach(k => assert.ok(keys.includes(k), "thiếu giả thuyết " + k));
  assert.ok(!keys.includes("bills"));
  assert.equal(r.weekday.weakest.label, "Chủ nhật");
  assert.ok(r.compare.tbbEffect < 0 && Math.abs(r.compare.billsEffect) < 1);
});

test("Tháng đã qua: đánh giá theo kết quả, không có kế hoạch bù", () => {
  const D = daily("2026-09-01", 30, flat(10e6, 50, 150, 3e6));
  const r = rvdDiagnose({ shop:"S", month:"2026-09", today:TODAY, daily:D, monthMeta:{ daysElapsed:30, daysInMonth:30, isCurrentMonth:false }, monthRow:{ revenue:{ target:320e6, actual:300e6 } } });
  assert.equal(r.status.code, "missed");
  assert.equal(r.plan, null);
  assert.match(r.conclusion, /Tháng kết thúc ở 93,8%/);
});

test("Đo kết quả sau xử lý dùng các ngày SAU khi giao việc (không lặp lại ngày trước)", () => {
  const D = daily("2026-09-15", 30, (iso) => ({ rev: iso > "2026-10-10" ? 18e6 : 10e6 }));
  const m = rvdMeasureAfter(D.revenueByDay, "2026-10-10", TODAY, 10e6, 16.5e6);
  assert.equal(m.from, "2026-10-11"); assert.equal(m.to, "2026-10-14");
  assert.equal(m.avgPerDay, 18e6);
  assert.equal(m.metTarget, true); assert.equal(m.suggestedEffect, "hieu_qua");
  assert.match(m.text, /ĐẠT/);
  const none = rvdMeasureAfter(D.revenueByDay, "2026-10-14", TODAY, 10e6, 16.5e6);
  assert.equal(none.ok, false);
  const weak = rvdMeasureAfter(daily("2026-09-15", 30, () => ({ rev:9e6 })).revenueByDay, "2026-10-10", TODAY, 10e6, 16.5e6);
  assert.equal(weak.suggestedEffect, "khong_hieu_qua");
});

test("Nội dung giao việc có đủ: vấn đề, dữ kiện, giả thuyết, hành động, chỉ số cam kết, mốc kiểm tra, bằng chứng cần nộp", () => {
  const { rvdTaskText } = vm.runInContext("({ rvdTaskText })", ctx);
  const D = daily("2026-09-15", 30, (iso, i) => i < 23 ? { rev:10e6, bills:50, lines:150, hhs:3e6 } : { rev:7e6, bills:35, lines:105, hhs:2.1e6 });
  const r = rvdDiagnose({ shop:"S", month:"2026-10", today:TODAY, daily:D, monthMeta:META, monthRow:{ revenue:{ target:400e6, actual:119e6 } } });
  const t = rvdTaskText(r);
  ["VẤN ĐỀ:", "DỮ KIỆN:", "GIẢ THUYẾT CẦN XÁC MINH:", "HÀNH ĐỘNG ĐỀ XUẤT:", "CHỈ SỐ CAM KẾT:", "MỐC KIỂM TRA:", "BẰNG CHỨNG CẦN NỘP:"].forEach(k => assert.ok(t.includes(k), k));
});

test("Độ mới số liệu: quá ngưỡng → 'chưa cập nhật'; không có thời điểm → chưa đủ căn cứ", () => {
  const { dataFreshness } = vm.runInContext("({ dataFreshness })", ctx);
  const now = Date.parse("2026-10-15T12:00:00Z");
  assert.equal(dataFreshness("2026-10-15T06:00:00Z", now, 30).stale, false);
  const old = dataFreshness("2026-10-13T06:00:00Z", now, 30);
  assert.equal(old.stale, true); assert.equal(old.hours, 54); assert.match(old.text, /CHƯA CẬP NHẬT/);
  const none = dataFreshness(null, now, 30);
  assert.equal(none.known, false); assert.equal(none.stale, true);
});
