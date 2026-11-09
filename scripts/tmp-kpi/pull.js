// TẠM THỜI (9/11/2026): CHỈ ĐỌC — số bán quý 4 (từ 1/10) của 15 mã hàng khoán theo nhà thuốc + tồn kho hiện tại.
// Kết quả MÃ HOÁ trước khi in ra log (repo công khai).
const admin = require("firebase-admin");
const fs = require("fs");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const IDS = new Set(["TP08743","TP10762","TH00915","TH09365","TB03839","TB06351","TP05812","TC11365","TH11593","TH07797","TP11842","TP11841","TH11587","TC11922","TP11745","TB07337","TB10971","TH04028","TH11591","TP11845","TP12482"]);
(async () => {
  const agg = {}; let n = 0, m = 0;
  const stream = db.collection("externalSalesLines").where("syncDate", ">=", "2026-10-01")
    .select("shopCode", "productID", "quantity", "unitOfMeasure", "amountIncludingVAT", "syncDate", "headerID").stream();
  for await (const d of stream) {
    n++; const x = d.data(); if (!IDS.has(x.productID)) continue; m++;
    const k = `${x.shopCode}|${x.productID}|${(x.syncDate || "").slice(0, 7)}|${x.unitOfMeasure || ""}`;
    const a = agg[k] || (agg[k] = [0, 0, 0]); a[0] += +x.quantity || 0; a[1] += +x.amountIncludingVAT || 0; a[2]++;
  }
  const inv = {}; let maxDate = "";
  const snap = await db.collection("externalInventory").where("ProductID", "in", [...IDS].slice(0, 30)).get();
  snap.forEach((d) => { const x = d.data(); if (x.syncDate > maxDate) maxDate = x.syncDate; });
  snap.forEach((d) => { const x = d.data(); if (x.syncDate !== maxDate) return; const k = `${x.shopCode}|${x.ProductID}|${x.UnitOfMeasure || ""}`; inv[k] = (inv[k] || 0) + (+x.Quantity || 0); });
  fs.writeFileSync("/tmp/out.json", JSON.stringify({ agg, inv, invDate: maxDate, n, m }));
  console.log("done", n, m, Object.keys(agg).length, maxDate);
  process.exit(0);
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
