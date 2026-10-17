// Gửi 1 thông báo về điện thoại quản lý (fcmTokens/admin). Dùng khi kiểm tra bản phát hành thất bại.
// Cần FIREBASE_SERVICE_ACCOUNT. Dùng: node scripts/notify-admin.js "tiêu đề" "nội dung"
const admin = require("firebase-admin");
const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
if(!sa){ console.log("Không có FIREBASE_SERVICE_ACCOUNT — bỏ qua gửi thông báo."); process.exit(0); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
(async () => {
  const d = await admin.firestore().collection("fcmTokens").doc("admin").get();
  const tokens = (d.exists && d.data().tokens || []).filter(Boolean);
  if(!tokens.length){ console.log("Chưa có thiết bị quản lý nào nhận thông báo."); return; }
  const r = await admin.messaging().sendEachForMulticast({ tokens, data:{ title:process.argv[2] || "Upharma Ops", body:(process.argv[3] || "").slice(0, 300), link:"/", tag:"release-check" } });
  console.log(`Đã gửi ${r.successCount}/${tokens.length} thiết bị.`);
})().then(() => process.exit(0)).catch(e => { console.error("Lỗi gửi thông báo:", e && e.message ? e.message : e); process.exit(0); });
