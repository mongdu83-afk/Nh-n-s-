// Tạm thời: đọc số liệu báo cáo tuần 09–15/11/2026 (CHỈ ĐỌC). Kết quả mã hoá (repo công khai). Xoá sau khi dùng.
const admin = require("firebase-admin"); const crypto = require("crypto"); const zlib = require("zlib");
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();
const PUB = "-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAuqXOhTuIPW9qkgd4LfdO\nTj0/O6GolwOLiKJxOBXvpNJeMY8DsMFZr5zdiPFp8+oIKLtuKg1Hl3t8Ut2DrcNQ\nbwRCpgjZtqSrxum+2cvfkhGdrnqLsva5Vlek7aM5vYa5LpLOOrs1m2Iuu/m5eWeq\nSrHfbTaQuFbwnrqWvNo40Jgge+Yqw4XDoew7VHCcA3XQWhWW64/OB/5VqjxKFYcj\njZpQrYRC77U5/3fyc/+uo2aIj2agd68Nqfq6H35DTHm2a4RxQeNPmPRxnDJlB4Zn\niZMO3IrSoblscm7xDFD7uXRum/E4xIUB1AuEfcQNK8FMw/nNWTCagnY8Ibbnjtp6\nTCYpiz6jm1OA7CGF/y2NCm3IEqUqWN4hgyobgRAeGGg4NiyU7PFzklGeu6DvfiVh\n8K94i4KK8qzrH5Aj31zG56whk/t7GdZAFRCOl3vZpoZc5dN9q2BMzgCrsfl6USB6\ny5nbgir08QVkXJjlYUgszCcAl/kIEmH52QI24UjqzK8nAgMBAAE=\n-----END PUBLIC KEY-----";
const SHOPS = ["SHOP0058","SHOP0059","SHOP0072","SHOP0074","SHOP0089","SHOP0095","SHOP0121","SHOP0122","SHOP0163"];
const CODES = ["TP08743","TH00915","TH09365","TB03839","TB06351","TB10247","TP05812","TC11365","TH11593","TH07797","TP11842","TP11841","TH11587","TC11922","TP11745","TB07337","TB10971","TH04028","TH11591","TP11845"];
const CUT = "2026-11-15";
const days = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(String(a).slice(0,10) + "T00:00:00Z")) / 86400000);
let reads = 0;
const get = async (ref) => { const d = await ref.get(); reads++; return d.exists ? d.data() : null; };
const q = async (query) => { const s = await query.get(); reads += Math.max(1, s.size); return s.docs.map(d => ({ id:d.id, ...d.data() })); };
const scal = (o) => { const r = {}; for (const [k, v] of Object.entries(o || {})) if (v == null || typeof v !== "object") r[k] = v; return r; };
(async () => {
  const out = {};
  const ra = await get(db.collection("opsConfig").doc("revenueAnalytics"));
  out.ra = {}; out.raMeta = scal(ra);
  for (const s of SHOPS) { const b = (ra && ra.byShop || {})[s]; if (!b) continue; const pick = (m) => { const r = {}; for (const [d, v] of Object.entries(m || {})) if (d >= "2026-09-01") r[d] = v; return r; };
    out.ra[s] = { rev: pick(b.revenueByDay), hhs: pick(b.hhsRevenueByDay), keys: Object.keys(b) }; }
  out.wt = {}; for (const w of ["2026-11-02","2026-11-09","2026-11-16"]) out.wt[w] = await get(db.collection("weeklyTargets").doc(w));
  out.months = {};
  for (const m of ["2026-09","2026-10","2026-11"]) { const md = await get(db.collection("opsConfig").doc("revenueAnalyticsMonths").collection("months").doc(m));
    if (!md) continue; const bs = {}; for (const s of SHOPS) { const r = (md.byShop || {})[s]; if (!r) continue; const x = {}; for (const [k, v] of Object.entries(r)) { if (v && typeof v === "object" && !Array.isArray(v)) x[k] = scal(v); else if (!Array.isArray(v)) x[k] = v; } bs[s] = x; }
    out.months[m] = { meta: scal(md), byShop: bs }; }
  out.plans = [];
  for (const m of ["2026-09","2026-10","2026-11"]) { const rows = await q(db.collection("externalEmployeePlan").where("planMonth", "==", m)); rows.forEach(r => out.plans.push(scal(r))); }
  const hist = await q(db.collection("employeePlanHistory").where("thang", "==", "2026-10")); out.hist10 = hist.map(scal);
  const staff = await q(db.collection("staff")); out.staff = staff.map(x => ({ id:x.id, name:x.name, shop:x.shop, role:x.role, khuVuc:x.khuVuc, ngayNghiViec:x.ngayNghiViec || null, ngayVaoLam: x.ngayVaoLam || x.startDate || null }));
  const ex = await q(db.collection("externalInventoryExpiry")); out.expiry = {};
  ex.forEach(x => { const sc = x.shopCode || x.id; const list = Array.isArray(x.expiryDetailAll) ? x.expiryDetailAll : [];
    const bucket = (mx) => list.reduce((a, it) => { const d = it.expirationDate ? days(CUT, String(it.expirationDate).slice(0,10)) : null; return a + (d != null && d < mx ? (Number(it.value)||0) : 0); }, 0);
    out.expiry[sc] = { tong: Number(x.totalValue)||0, hethan: bucket(0), d3: bucket(91), d6: bucket(183), d12: bucket(366), full: Array.isArray(x.expiryDetailAll), meta: scal(x) }; });
  const inv = await get(db.collection("opsConfig").doc("inventoryConsumptionSummary")); out.sku = {};
  Object.entries((inv && inv.byShop) || {}).forEach(([k, v]) => { if (v && (v.skuInStock != null || v.totalSKU != null)) out.sku[k] = v.skuInStock != null ? v.skuInStock : v.totalSKU; });
  out.invMeta = scal(inv);
  const urg = await q(db.collection("inventoryMetrics").where("stockStatus", "==", "URGENT_REPLENISH").limit(500));
  out.urgent = urg.map(u => ({ shopCode:u.shopCode, productName:u.productName, productId:u.productId || u.productID, stockQty:u.stockQty, ads30:u.ads30, doi:u.doi, updatedAt:u.updatedAt || u.computedAt || null }));
  // khoán: dòng bán theo mã
  const kl = await q(db.collection("externalSalesLines").where("productID", "in", CODES)); const K = {};
  kl.forEach(l => { if (!l.syncDate || l.syncDate < "2026-10-01") return; const k = [l.shopCode, l.productID, l.unitOfMeasure, l.syncDate].join("|"); K[k] = (K[k]||0) + (Number(l.quantity)||0); });
  out.khoanLines = K; out.khoanNames = {}; kl.forEach(l => { out.khoanNames[l.productID] = l.productName; });
  // dòng bán từ 16/11 theo nhân viên (để trừ khỏi lũy kế nếu số chỉ tiêu đã đồng bộ sau 15/11)
  const late = await q(db.collection("externalSalesLines").where("syncDate", ">=", "2026-11-16")); const L = {};
  late.forEach(l => { const hr = String(l.orderDate || "").slice(0,13); const k = [l.shopCode, l.salesName, l.syncDate, hr].join("|"); const o = L[k] = L[k] || { a:0, v:0, n:0 }; o.a += Number(l.amount)||0; o.v += Number(l.amountIncludingVAT)||0; o.n++; });
  out.late = L;
  // đơn hàng 16/11+ (tổng theo shop/nhân viên)
  const lo = await q(db.collection("externalSalesOrders").where("syncDate", ">=", "2026-11-16")); const O = {};
  lo.forEach(o => { const hr = String(o.OrderDate || "").slice(0,13); const k = [o.shopCode, o.SalesName, o.syncDate, hr].join("|"); const x = O[k] = O[k] || { n:0, t:{} }; x.n++; for (const f of ["TotalAmount","Amount","AmountIncludingVAT","TotalPayment","GrandTotal"]) if (o[f] != null) x.t[f] = (x.t[f]||0) + (Number(o[f])||0); });
  out.lateOrders = O; out.orderKeys = lo[0] ? Object.keys(lo[0]) : [];
  const buf = zlib.gzipSync(Buffer.from(JSON.stringify(out)));
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12); const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(buf), c.final()]), tag = c.getAuthTag();
  const ek = crypto.publicEncrypt({ key: PUB, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key);
  const blob = Buffer.concat([Buffer.from([ek.length >> 8, ek.length & 255]), ek, iv, tag, enc]).toString("base64");
  console.log("READS", reads, "BYTES", blob.length);
  for (let i = 0; i < blob.length; i += 4000) console.log("B64:" + blob.slice(i, i + 4000));
  console.log("END");
})().catch(e => { console.error("ERR", e && e.message); process.exit(1); });
