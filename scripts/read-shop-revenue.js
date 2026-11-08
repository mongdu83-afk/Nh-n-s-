// Chỉ đọc: doanh thu thực hiện theo shop từng tháng (opsConfig/revenueAnalyticsMonths) để chia khoán sản lượng.
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
(async () => {
  const out = {};
  for (const m of ["2026-07","2026-08","2026-09","2026-10","2026-11"]) {
    const d = await db.collection("opsConfig").doc("revenueAnalyticsMonths").collection("months").doc(m).get();
    if (!d.exists) { out[m] = null; continue; }
    const by = d.data().byShop || {}; const r = {};
    for (const [s, b] of Object.entries(by)) r[s] = { actual: b && b.revenue ? b.revenue.actual : null, days: b && b.revenueByDay ? Object.keys(b.revenueByDay).length : null };
    out[m] = r;
  }
  console.log("@@JSON@@" + JSON.stringify(out));
})().catch(e => { console.error(e); process.exit(1); });
