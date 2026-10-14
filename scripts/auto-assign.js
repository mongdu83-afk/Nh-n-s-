// AI TỰ GIAO VIỆC — chạy trên máy chủ theo lịch (GitHub Actions: .github/workflows/auto-assign.yml, 9h20 & 15h20 giờ VN).
// Dùng LẠI NGUYÊN VĂN code trong index.html (các khối *-ENGINE + runAutoAssign) nên quy tắc giao việc trên máy chủ và trong app
// luôn giống nhau. Việc tạo ra nằm trong collection "tasks" như việc thường → máy chủ Firebase hiện có gửi thông báo
// "Việc được giao" về điện thoại người nhận. Nếu cần, bật AA_DIRECT_PUSH=1 để script tự gửi thông báo (dự phòng).
//
// Cần biến môi trường FIREBASE_SERVICE_ACCOUNT = nội dung file khoá tài khoản dịch vụ (JSON) của dự án upharma-176d5.
// Repo công khai → nhật ký GitHub Actions ai cũng xem được: script CHỈ in số lượng, không in tên nhân viên / nội dung việc.
//
// Chạy thử không ghi gì: DRY_RUN=1 node scripts/auto-assign.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const admin = require("firebase-admin");

const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if(!sa){ console.error("Thiếu FIREBASE_SERVICE_ACCOUNT (GitHub → Settings → Secrets and variables → Actions)."); process.exit(1); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
const fdb = admin.firestore();
const DRY = process.env.DRY_RUN === "1";

// Giờ Việt Nam (UTC+7)
const vnNow = () => new Date(Date.now() + 7*3600*1000);
const todayISO = () => vnNow().toISOString().slice(0, 10);
const slot = () => todayISO() + (vnNow().getUTCHours() < 12 ? "-AM" : "-PM");

// Khi DRY_RUN: chặn mọi thao tác ghi, chỉ đọc
function dryDb(real){
  const wrapDoc = (ref) => ({ get:() => ref.get(), set: async () => {}, collection:(c) => wrapCol(ref.collection(c)) });
  const wrapCol = (q) => ({ where:(...a) => wrapCol(q.where(...a)), orderBy:(...a) => wrapCol(q.orderBy(...a)), limit:(n) => wrapCol(q.limit(n)),
    get:() => q.get(), doc:(id) => wrapDoc(q.doc(id)), add: async () => ({ id:"dry-run" }) });
  return { collection:(c) => wrapCol(real.collection(c)), runTransaction: async (fn) => fn({ get:(r) => r.get(), set:() => {} }) };
}
const db = DRY ? dryDb(fdb) : fdb;

const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const block = (n) => { const a = HTML.indexOf(`\n// ${n}-ENGINE-BEGIN\n`), b = HTML.indexOf(`\n// ${n}-ENGINE-END`); if(a < 0 || b < a) throw new Error("Không tìm thấy khối " + n); return HTML.slice(a, b); };
const between = (a, b) => { const i = HTML.indexOf(a), j = HTML.indexOf(b, i); if(i < 0 || j < 0) throw new Error("Không tìm thấy " + a); return HTML.slice(i, j); };
const constDecl = (name) => { const i = HTML.indexOf("\nconst " + name + " "); return HTML.slice(i, HTML.indexOf("\n};", i) + 3); };
const runnerSrc = between("// AA-ENGINE-END", "function AutoAssignRunner(").replace("// AA-ENGINE-END", "");

async function main(){
  const shopListDoc = await fdb.collection("opsConfig").doc("shopList").get();
  const sl = shopListDoc.exists ? shopListDoc.data() : {};
  const test = new Set(Array.isArray(sl.testShops) ? sl.testShops : []);
  const shops = Array.isArray(sl.shops) && sl.shops.length ? sl.shops.filter(s => !test.has(s)) : ["SHOP0058","SHOP0059","SHOP0072","SHOP0074","SHOP0089","SHOP0095","SHOP0121","SHOP0122","SHOP0163"];
  const ctx = vm.createContext({
    db, console, todayISO,
    nowHM:() => vnNow().toISOString().slice(11,16),   // giờ VN để chọn người đang trong ca
    addDays:(iso, n) => { const [y,m,d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m-1, d+n)).toISOString().slice(0,10); },
    auth:{ currentUser:null },
    firebase:{ firestore:{ FieldValue: admin.firestore.FieldValue } },
    logSystemError:(src, e) => console.warn("Lỗi " + src + ": " + (e && e.message ? e.message : e)),
    isStaffResigned:(st) => !!(st && st.ngayNghiViec && st.ngayNghiViec <= todayISO()),
    DEFAULT_SHOPS: shops,
    shopLabel:(c) => { const m = /^SHOP0*(\d+)$/i.exec(String(c||"")); return m ? "NT" + m[1] : String(c||""); },
    addDoc:(name, data) => db.collection(name).add({ ...data, createdAtTs: admin.firestore.FieldValue.serverTimestamp() }),
    logIssueHistory: async ({ shop, code, action, oldStatus, newStatus, detail }) => db.collection("issueHistory").add({
      issueKey:`${shop}__${code}`, shop, code, action, oldStatus:oldStatus||null, newStatus:newStatus||null, detail:detail||"",
      performedBy:"AI tự giao (máy chủ)", performedAtTs: admin.firestore.FieldValue.serverTimestamp() }),
  });
  vm.runInContext([constDecl("DEFAULT_DAILY_CHECKLISTS"), ...["RVD","KBP","PMD","CLQ","NS","AA"].map(block), runnerSrc, ";globalThis.__run = runAutoAssign;"].join("\n"), ctx);

  const rules = await fdb.collection("opsConfig").doc("autoAssignRules").get();
  if(rules.exists && rules.data().enabled === false){ console.log("Quản lý đã tắt AI tự giao — không chạy."); return; }
  const r = await ctx.__run({ slot:slot(), source:"server", force: process.env.FORCE === "1" });
  if(r.skippedRun){ console.log(`Khung ${slot()} đã chạy rồi — bỏ qua.`); return; }
  const byRule = {}; r.created.forEach(c => { byRule[c.rule] = (byRule[c.rule]||0) + 1; });
  console.log(`${DRY ? "[CHẠY THỬ, không ghi] " : ""}Khung ${slot()}: giao ${r.created.length} việc ${JSON.stringify(byRule)}, bỏ qua ${r.skipped.length} trường hợp.`);

  // Dự phòng: tự gửi thông báo (chỉ khi bật AA_DIRECT_PUSH=1 — mặc định dựa vào thông báo "Việc được giao" sẵn có của máy chủ Firebase)
  if(!DRY && process.env.AA_DIRECT_PUSH === "1" && r.created.length){
    let sent = 0;
    for(const c of r.created){
      let docs = [];
      if(c.assignType === "staff" && c.staffId){ const d = await fdb.collection("fcmTokens").doc(c.staffId).get(); if(d.exists) docs = [d.data()]; }
      else if(c.assignType === "shop" && c.shop){ docs = (await fdb.collection("fcmTokens").where("shop", "==", c.shop).get()).docs.map(d => d.data()); }
      else if(c.assignType === "admin"){ const d = await fdb.collection("fcmTokens").doc("admin").get(); if(d.exists) docs = [d.data()]; }
      const tokens = docs.flatMap(x => x.tokens || []).filter(Boolean);
      if(!tokens.length) continue;
      const res = await admin.messaging().sendEachForMulticast({ tokens, data:{ title:"Việc mới được giao", body:c.title, link:`/?open=tasks&p=${encodeURIComponent(JSON.stringify({ taskId:c.taskId }))}`, tag:"viec-" + c.taskId } });
      sent += res.successCount;
    }
    console.log(`Đã gửi ${sent} thông báo trực tiếp.`);
  }
}
main().then(() => process.exit(0)).catch(e => { console.error("Lỗi:", e && e.message ? e.message : e); process.exit(1); });
