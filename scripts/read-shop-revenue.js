// Chỉ đọc: số bán theo shop × mã (inventoryMetrics) để chia khoán sản lượng.
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const SHOPS = ["SHOP0058","SHOP0059","SHOP0072","SHOP0074","SHOP0089","SHOP0095","SHOP0121","SHOP0122","SHOP0163"];
const CODES = new Set(["TB06917", "TB09856", "TB10247", "TB10482", "TB10971", "TB12189", "TB12288", "TC02472", "TC02473", "TC05677", "TC05678", "TC05841", "TC11203", "TC11204", "TC11365", "TC11875", "TC11922", "TH00893", "TH01014", "TH01017", "TH01019", "TH01041", "TH01151", "TH01527", "TH01573", "TH01681", "TH01717", "TH01719", "TH01733", "TH01734", "TH01773", "TH01777", "TH01794", "TH02043", "TH02071", "TH02225", "TH02257", "TH03544", "TH04916", "TH05566", "TH06069", "TH06783", "TH07318", "TH07797", "TH08199", "TH08280", "TH08413", "TH08511", "TH08526", "TH08648", "TH08652", "TH08760", "TH08772", "TH08960", "TH08982", "TH09065", "TH09163", "TH09365", "TH09437", "TH09479", "TH09513", "TH09584", "TH09612", "TH09932", "TH09991", "TH10031", "TH10095", "TH10110", "TH10212", "TH11162", "TH11587", "TH11591", "TH11593", "TP00296", "TP01293", "TP01595", "TP02089", "TP02141", "TP02740", "TP02793", "TP03093", "TP03239", "TP03397", "TP03811", "TP04023", "TP04744", "TP04856", "TP04965", "TP05375", "TP05812", "TP07276", "TP08743", "TP09750", "TP09791", "TP11074", "TP11548", "TP11549", "TP11745", "TP11841", "TP11842", "TP11845"]);
(async () => {
  const out = { keys:null, rows:[] };
  for (const s of SHOPS) {
    const snap = await db.collection("inventoryMetrics").where("shopCode","==",s).get();
    snap.forEach(d => {
      const x = d.data(); if (!out.keys) out.keys = Object.keys(x);
      const code = Object.values(x).find(v => typeof v === "string" && CODES.has(v)) || (CODES.has(d.id.split("_").pop()) ? d.id.split("_").pop() : null);
      if (!code) return;
      const r = { id:d.id, code };
      for (const [k,v] of Object.entries(x)) if (typeof v === "number" || (typeof v === "string" && v.length < 40)) r[k] = v;
      out.rows.push(r);
    });
  }
  console.log("@@JSON@@" + JSON.stringify(out));
})().catch(e => { console.error(e); process.exit(1); });
