// Kiểm thử báo cáo tuần / tháng xuất HTML (RPT-ENGINE, 02/11/2026).
// Chạy: node --test tests/areaReport.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const b = HTML.indexOf("\n// RPT-ENGINE-BEGIN\n"), e = HTML.indexOf("\n// RPT-ENGINE-END");
assert.ok(b > 0 && e > b);
const ctx = vm.createContext({});
vm.runInContext(HTML.slice(b, e) + "\n;globalThis.__r = { rptBuild, rptHtml };", ctx);
const { rptBuild, rptHtml } = ctx.__r;

const I = () => ({ kind:"month", label:"tháng 10/2026", prevLabel:"tháng 9/2026", nextLabel:"tháng 11/2026", cutoff:"2026-10-31", from:"2026-10-01",
  shops:["SHOP0061", "SHOP0160", "SHOP0999"], regionOf:{ SHOP0061:"Hưng Yên", SHOP0160:"Ninh Bình" },
  cur:{ SHOP0061:{ ds:550e6, tds:550e6, hhs:276e6, ths:209e6 }, SHOP0160:{ ds:46e6, tds:110e6, hhs:15.8e6, ths:38.5e6 } },
  prev:{ SHOP0061:{ ds:521e6, hhs:268e6 }, SHOP0160:{ ds:52e6, hhs:17e6 } }, next:{ SHOP0061:{ tds:550e6, ths:209e6 } },
  plans:[ { EmployeeName:"Phạm Thị Ánh", ShopCode:"SHOP0061", Amount:184e6, AmountR:184.2e6, PointRatio:69.7e6, PointRatioR:86.9e6 },
          { EmployeeName:"Vũ Ngọc Diệu", ShopCode:"SHOP0160", Amount:30e6, AmountR:14.5e6, PointRatio:12e6, PointRatioR:5.5e6 },
          { EmployeeName:"Vu Ngoc Dieu", ShopCode:"SHOP0061", Amount:0, AmountR:1e6, PointRatio:0, PointRatioR:0 } ],
  staff:[ { name:"Phạm Thị Ánh", shop:"SHOP0061", role:"Nhân viên bán hàng" }, { name:"CHT", shop:"SHOP0061", role:"Cửa hàng trưởng" },
          { name:"Nghỉ T9", shop:"SHOP0061", role:"Nhân viên bán hàng", ngayNghiViec:"2026-09-15" }, { name:"Nghỉ giữa T10", shop:"SHOP0160", role:"Nhân viên bán hàng", ngayNghiViec:"2026-10-20" } ],
  expiry:{ SHOP0061:{ totalValue:570e6, expiryDetailAll:[ { value:1e6, expirationDate:"2026-10-01" }, { value:2e6, expirationDate:"2026-12-15" }, { value:3e6, expirationDate:"2027-03-01" }, { value:4e6, expirationDate:"2027-09-01" }, { value:9e6, expirationDate:"2028-01-01" } ] } },
  urgent:[ { shopCode:"SHOP0160", productName:"Tamiflu", doi:2 } ], notes:"Đã họp CHT ngày 01/11", actions:"Tuyển thêm 1 NV cho NT160" });

test("Tính đúng % kế hoạch, tỷ trọng HHS; bỏ nhà thuốc không có số liệu", () => {
  const D = rptBuild(I());
  assert.equal(D.shops.length, 2);
  const s61 = D.shops.find(s => s.ma === "SHOP0061"), s160 = D.shops.find(s => s.ma === "SHOP0160");
  assert.equal(s61.cur.pct, 100); assert.equal(s61.cur.ph, 132); assert.equal(s61.cur.ty, 50.2);
  assert.equal(s160.cur.pct, 42);
  assert.equal(D.region.ds, 596e6); assert.equal(D.region.nextTds, 550e6);
  assert.equal(s61.cur.nv[0].name, "Phạm Thị Ánh"); assert.equal(s61.cur.nv[0].pct, 100);
});

test("Tồn kho theo hạn dùng lồng nhau: hết hạn ⊂ <3 tháng ⊂ <6 tháng ⊂ <12 tháng", () => {
  const inv = rptBuild(I()).shops.find(s => s.ma === "SHOP0061").inv;
  assert.equal(inv.hethan, 1e6); assert.equal(inv.d3, 3e6); assert.equal(inv.d6, 6e6); assert.equal(inv.d12, 10e6); assert.equal(inv.tong, 570e6);
});

test("Định biên: người nghỉ trước kỳ không tính, nghỉ trong kỳ vẫn tính và được ghi; người bán 2 nhà thuốc", () => {
  const D = rptBuild(I());
  const d61 = D.shops.find(s => s.ma === "SHOP0061").dinhbien, d160 = D.shops.find(s => s.ma === "SHOP0160").dinhbien;
  assert.equal(d61.tong, 2); assert.equal(d61.cht, 1);
  assert.equal(d160.tong, 1); assert.deepEqual(Array.from(d160.nghi), ["Nghỉ giữa T10"]);
  assert.equal(D.multi.length, 1); assert.equal(D.multi[0].main, "SHOP0160");
});

test("File HTML có đủ 7 phần, ghi chú quản lý, việc tự lọc theo quy tắc; tên được thoát ký tự", () => {
  const x = I(); x.notes = "<script>alert(1)</script>";
  const html = rptHtml(rptBuild(x), "");
  ["Tổng quan tháng 10/2026", "theo nhà thuốc và nhân viên", "Hàng hệ số", "Tồn kho", "Nhân sự", "So sánh với tháng 9/2026", "Kế hoạch tháng 11/2026"].forEach(t => assert.ok(html.includes(t), t));
  assert.ok(html.includes("Tuyển thêm 1 NV cho NT160"));
  assert.ok(/NT160 \(42%\)<\/b> — dưới 90% kế hoạch/.test(html));
  assert.ok(!html.includes("<script>alert(1)"), "phải thoát ký tự");
  assert.ok(html.startsWith("<!doctype html>") && html.trim().endsWith("</html>"));
});
