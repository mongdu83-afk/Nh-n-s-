// Chỉ đọc: dòng bán hàng POS (externalSalesLines, kéo từ API upharma.com.vn) T8-T10/2026, gộp theo shop × mã × ĐVT.
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const CODES = new Set(["TB06917", "TB09856", "TB10247", "TB10482", "TB10971", "TB12189", "TB12288", "TC02472", "TC02473", "TC05677", "TC05678", "TC05841", "TC11203", "TC11204", "TC11365", "TC11875", "TC11922", "TH00893", "TH01014", "TH01017", "TH01019", "TH01041", "TH01151", "TH01527", "TH01573", "TH01681", "TH01717", "TH01719", "TH01733", "TH01734", "TH01773", "TH01777", "TH01794", "TH02043", "TH02071", "TH02225", "TH02257", "TH03544", "TH04916", "TH05566", "TH06069", "TH06783", "TH07318", "TH07797", "TH08199", "TH08280", "TH08413", "TH08511", "TH08526", "TH08648", "TH08652", "TH08760", "TH08772", "TH08960", "TH08982", "TH09065", "TH09163", "TH09365", "TH09437", "TH09479", "TH09513", "TH09584", "TH09612", "TH09932", "TH09991", "TH10031", "TH10095", "TH10110", "TH10212", "TH11162", "TH11587", "TH11591", "TH11593", "TP00296", "TP01293", "TP01595", "TP02089", "TP02141", "TP02740", "TP02793", "TP03093", "TP03239", "TP03397", "TP03811", "TP04023", "TP04744", "TP04856", "TP04965", "TP05375", "TP05812", "TP07276", "TP08743", "TP09750", "TP09791", "TP11074", "TP11548", "TP11549", "TP11745", "TP11841", "TP11842", "TP11845"]);
(async () => {
  const agg = {}, tot = {}; let n = 0;
  await new Promise((res, rej) => {
    db.collection("externalSalesLines").where("syncDate", ">=", "2026-08-01").where("syncDate", "<=", "2026-10-31")
      .select("productID", "quantity", "unitOfMeasure", "amountIncludingVAT", "amount", "shopCode", "syncDate").stream()
      .on("data", d => { n++; const l = d.data(); const m = String(l.syncDate).slice(0,7); const amt = Number(l.amountIncludingVAT) || Number(l.amount) || 0;
        const tk = l.shopCode + "|" + m; tot[tk] = (tot[tk] || 0) + amt;
        if (!CODES.has(l.productID)) return;
        const k = [l.shopCode, m, l.productID, l.unitOfMeasure].join("|"); const a = agg[k] || (agg[k] = [0, 0]); a[0] += Number(l.quantity) || 0; a[1] += amt; })
      .on("error", rej).on("end", res);
  });
  const cat = {};
  for (const c of CODES) { const d = await db.collection("productCatalog").doc(c.replace(/\//g, "_")).get(); if (d.exists) { const x = d.data(); const r = {}; for (const [k, v] of Object.entries(x)) if (typeof v !== "object" || v === null) r[k] = typeof v === "string" ? v.slice(0, 60) : v; else r[k] = JSON.stringify(v).slice(0, 300); cat[c] = r; } }
  console.log("@@N@@" + n);
  console.log("@@TOT@@" + JSON.stringify(tot));
  console.log("@@AGG@@" + JSON.stringify(agg));
  console.log("@@CAT@@" + JSON.stringify(cat));
})().catch(e => { console.error(e); process.exit(1); });
