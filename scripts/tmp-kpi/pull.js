// TẠM THỜI (9/11/2026): CHỈ ĐỌC — phát sinh bán 3 tháng theo nhà thuốc × mã hàng, danh mục (cờ dừng), tồn kho hiện tại,
// để lập danh sách hàng thường trực KPI T11. Kết quả được MÃ HOÁ trước khi in ra log (repo công khai).
const admin = require("firebase-admin");
const fs = require("fs");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
(async () => {
  const out = { errors: [] };
  try { out.aiSettingsStop = ((await db.collection("opsConfig").doc("aiOperatorSettings").get()).data() || {}).stopFlag || null; } catch (e) { out.errors.push("ai " + e.message); }
  try { const m = (await db.collection("opsConfig").doc("productCatalogMeta").get()).data() || {}; out.catMeta = { statusKeys: m.statusKeys, sampleKeys: m.sampleKeys, count: m.count, updatedAt: m.updatedAt }; } catch (e) { out.errors.push("meta " + e.message); }
  out.cat = {};
  try {
    (await db.collection("productCatalog").select("apiFlags", "apiProductName", "apiProductType", "apiProductGroup", "apiUnit", "apiSyncedAt", "productName").get())
      .forEach((d) => { const x = d.data(); out.cat[d.id] = [x.apiProductName || x.productName || "", x.apiProductType || "", x.apiProductGroup || "", x.apiUnit || "", x.apiFlags || null, (x.apiSyncedAt || "").slice(0, 10)]; });
  } catch (e) { out.errors.push("cat " + e.message); }
  const agg = {}; let nLines = 0; const minDate = {};
  try {
    const stream = db.collection("externalSalesLines").where("syncDate", ">=", "2026-08-01")
      .select("shopCode", "productID", "productName", "quantity", "amountIncludingVAT", "amount", "headerID", "syncDate", "unitOfMeasure").stream();
    for await (const d of stream) {
      const x = d.data(); nLines++;
      const k = `${x.shopCode}|${x.productID}`;
      const a = agg[k] || (agg[k] = { q: 0, r: 0, h: new Set(), m: {}, f: x.syncDate, l: x.syncDate, n: x.productName || "", u: x.unitOfMeasure || "" });
      a.q += +x.quantity || 0; a.r += +(x.amountIncludingVAT || x.amount) || 0; a.h.add(x.headerID);
      const mo = (x.syncDate || "").slice(0, 7); a.m[mo] = (a.m[mo] || 0) + 1;
      if (x.syncDate < a.f) a.f = x.syncDate; if (x.syncDate > a.l) a.l = x.syncDate;
      if (!minDate[x.shopCode] || x.syncDate < minDate[x.shopCode]) minDate[x.shopCode] = x.syncDate;
    }
  } catch (e) { out.errors.push("sales " + e.message); }
  out.nLines = nLines; out.minDate = minDate;
  out.sales = Object.fromEntries(Object.entries(agg).map(([k, a]) => [k, [a.q, Math.round(a.r), a.h.size, a.m, a.f, a.l, a.n, a.u]]));
  out.inv = {}; out.invKeys = null; out.invDate = {};
  try {
    const snap = await db.collection("externalInventory").get();
    const latest = {};
    snap.forEach((d) => { const x = d.data(); if (!latest[x.shopCode] || x.syncDate > latest[x.shopCode]) latest[x.shopCode] = x.syncDate; });
    out.invDate = latest;
    snap.forEach((d) => {
      const x = d.data(); if (!out.invKeys) out.invKeys = Object.keys(x);
      if (x.syncDate !== latest[x.shopCode]) return;
      const qty = Number(x.Quantity ?? x.QuantityStore ?? x.Qty ?? x.QuantityInStock ?? 0) || 0;
      const k = `${x.shopCode}|${x.ProductID}`;
      out.inv[k] = (out.inv[k] || 0) + qty;
    });
  } catch (e) { out.errors.push("inv " + e.message); }
  fs.writeFileSync("/tmp/out.json", JSON.stringify(out));
  console.log("done lines", nLines, "cat", Object.keys(out.cat).length, "inv", Object.keys(out.inv).length, out.errors);
  process.exit(0);
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
