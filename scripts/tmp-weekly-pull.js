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
  const rows = await q(db.collection("weeklyReports").where("tuanNgay", ">=", "2026-11-02"));
  out.wr = rows.map(r => { const x = {}; for (const [k, v] of Object.entries(r)) { if (v && typeof v === "object" && v.toMillis) x[k] = new Date(v.toMillis()).toISOString(); else x[k] = v; } return x; });
  const buf = zlib.gzipSync(Buffer.from(JSON.stringify(out)));
  const key = crypto.randomBytes(32), iv = crypto.randomBytes(12); const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(buf), c.final()]), tag = c.getAuthTag();
  const ek = crypto.publicEncrypt({ key: PUB, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, key);
  const blob = Buffer.concat([Buffer.from([ek.length >> 8, ek.length & 255]), ek, iv, tag, enc]).toString("base64");
  console.log("READS", reads, "BYTES", blob.length);
  for (let i = 0; i < blob.length; i += 4000) console.log("B64:" + blob.slice(i, i + 4000));
  console.log("END");
})().catch(e => { console.error("ERR", e && e.message); process.exit(1); });
