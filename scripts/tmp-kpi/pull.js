// TẠM THỜI (9/11/2026): đọc thống kê POS đã đồng bộ sẵn (externalEmployeePlan) để xây chỉ tiêu KPI T11.
// Chỉ ĐỌC, chỉ in số TỔNG theo nhà thuốc + tháng (không in tên nhân viên).
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
(async () => {
  const snap = await db.collection("externalEmployeePlan").where("planMonth", ">=", "2026-06").get();
  const agg = {}; const keys = new Set();
  snap.forEach((d) => {
    const r = d.data(); Object.keys(r).forEach((k) => keys.add(k));
    const shop = r.ShopCode || r.shopCode || r.Shop || "?";
    const k = `${r.planMonth}|${shop}`;
    const a = agg[k] || (agg[k] = { n: 0, AmountR: 0, InvR: 0, CusR: 0, Amount: 0, Inv: 0, Cus: 0 });
    a.n++; a.AmountR += +r.AmountR || 0; a.InvR += +r.QuantityInvoiceR || 0; a.CusR += +r.QuantityCusR || 0;
    a.Amount += +r.Amount || 0; a.Inv += +r.QuantityInvoice || 0; a.Cus += +r.QuantityCus || 0;
  });
  console.log("KEYS", [...keys].join(","));
  console.log("ROWS", snap.size);
  Object.keys(agg).sort().forEach((k) => console.log("AGG", k, JSON.stringify(agg[k])));
  process.exit(0);
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
