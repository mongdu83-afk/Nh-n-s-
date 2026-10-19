// Kiểm thử luật đọc dữ liệu khách hàng (CRM mục 8, 19/10/2026). Chạy: npx firebase emulators:exec --only firestore "node crm.test.js"
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log("  ok  ", name); } catch (e) { fail++; console.log("  FAIL", name, "-", (e && e.message || "").slice(0, 160)); } }
(async () => {
  const env = await initializeTestEnvironment({ projectId: "upharma-test", firestore: { rules: fs.readFileSync(process.env.RULES || "firestore.rules", "utf8"), host: "127.0.0.1", port: 8085 } });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("crmCustomers/0901").set({ shop: "SHOPA", phone: "0901" });
    await db.doc("crmCustomers/0902").set({ shop: "SHOPB", phone: "0902", assignedStaffId: "nvB" });
    await db.doc("crmCustomers/0905").set({ shop: "SHOPB", phone: "0905", assignedStaffId: "nvA" }); // khách chuyển sang NT B, nvA vẫn phụ trách
    await db.doc("crmInteractions/i1").set({ phone: "0901", shop: "SHOPA", staffId: "nvA2", note: "x", createdAtTs: "2026-10-19T01:00:00Z", nextFollowUpDate: "2026-10-19" });
    await db.doc("crmInteractions/i2").set({ phone: "0902", shop: "SHOPB", staffId: "nvB", note: "y", createdAtTs: "2026-10-19T01:00:00Z" });
    await db.doc("crmInteractions/i5").set({ phone: "0905", shop: "SHOPA", staffId: "nvZ", note: "z", createdAtTs: "2026-10-01T01:00:00Z" });
    await db.doc("customerEvents/e1").set({ customerId: "0901", type: "purchase", timestamp: "2026-10-01", shopId: "SHOPA" });
    await db.doc("customerEvents/e2").set({ customerId: "0902", type: "purchase", timestamp: "2026-10-01", shopId: "SHOPB" });
    await db.doc("customerEvents/e3").set({ customerId: "0999", type: "purchase", timestamp: "2026-10-01" }); // không có hồ sơ khách
    await db.doc("customerSegmentHistory/h1").set({ customerId: "0901" });
    await db.doc("customerSegmentHistory/h2").set({ customerId: "0902" });
    await db.doc("replenishDue/0901").set({ phone: "0901", shop: "SHOPA" });
    await db.doc("replenishDue/0902").set({ phone: "0902", shop: "SHOPB" });
    await db.doc("replenishContacts/c1").set({ phone: "0902", shop: "SHOPB" });
    await db.doc("careDaily/2026-10-19_SHOPA").set({ date: "2026-10-19", shop: "SHOPA", items: [] });
    await db.doc("careDaily/2026-10-19_SHOPB").set({ date: "2026-10-19", shop: "SHOPB", items: [] });
  });
  const nv = env.authenticatedContext("uNV", { staffId: "nvA", shop: "SHOPA", role: "Nhân viên bán hàng", admin: false }).firestore();
  const cht = env.authenticatedContext("uCHT", { staffId: "chtA", shop: "SHOPA", role: "Cửa hàng trưởng", admin: false }).firestore();
  const ad = env.authenticatedContext("uAD", { admin: true }).firestore();
  const stranger = env.authenticatedContext("uX", {}).firestore();

  console.log("Lịch sử chăm sóc (crmInteractions)");
  await t("NV đọc lịch sử khách shop mình (theo SĐT)", assertSucceeds(nv.collection("crmInteractions").where("phone", "==", "0901").get()));
  await t("NV KHÔNG đọc lịch sử khách shop khác (theo SĐT)", assertFails(nv.collection("crmInteractions").where("phone", "==", "0902").get()));
  await t("NV đọc lịch sử khách mình phụ trách dù khách đã chuyển nhà thuốc", assertSucceeds(nv.collection("crmInteractions").where("phone", "==", "0905").get()));
  await t("NV đọc 1 dòng lịch sử shop mình", assertSucceeds(nv.doc("crmInteractions/i1").get()));
  await t("NV KHÔNG đọc 1 dòng lịch sử shop khác", assertFails(nv.doc("crmInteractions/i2").get()));
  await t("NV KHÔNG truy vấn toàn chuỗi theo ngày", assertFails(nv.collection("crmInteractions").where("createdAtTs", ">=", "2026-10-19").get()));
  await t("NV truy vấn theo shop mình", assertSucceeds(nv.collection("crmInteractions").where("shop", "==", "SHOPA").get()));
  await t("NV lịch hẹn shop mình (shop + ngày hẹn in)", assertSucceeds(nv.collection("crmInteractions").where("shop", "==", "SHOPA").where("nextFollowUpDate", "in", ["2026-10-19", "2026-10-18"]).get()));
  await t("NV KHÔNG lịch hẹn shop khác", assertFails(nv.collection("crmInteractions").where("shop", "==", "SHOPB").where("nextFollowUpDate", "in", ["2026-10-19"]).get()));
  await t("NV đọc danh sách gọi hôm nay của shop mình (1 tài liệu)", assertSucceeds(nv.doc("careDaily/2026-10-19_SHOPA").get()));
  await t("NV truy vấn lịch hẹn theo shop", assertSucceeds(nv.collection("crmInteractions").where("shop", "==", "SHOPA").where("nextFollowUpDate", "in", ["2026-10-18", "2026-10-19"]).get()));
  await t("NV truy vấn SĐT danh sách gọi (in) — khách shop mình", assertSucceeds(nv.collection("crmInteractions").where("phone", "in", ["0901"]).get()));
  await t("Admin truy vấn toàn chuỗi theo ngày", assertSucceeds(ad.collection("crmInteractions").where("createdAtTs", ">=", "2026-10-19").get()));
  await t("Tài khoản lạ KHÔNG đọc", assertFails(stranger.collection("crmInteractions").where("phone", "==", "0901").get()));
  await t("NV vẫn ghi kết quả chăm sóc của mình", assertSucceeds(nv.collection("crmInteractions").add({ phone: "0901", shop: "SHOPA", staffId: "nvA", note: "x" })));

  console.log("Lịch sử mua (customerEvents) và đổi phân khúc");
  await t("NV đọc đơn mua khách shop mình", assertSucceeds(nv.collection("customerEvents").where("customerId", "==", "0901").where("type", "==", "purchase").get()));
  await t("NV đọc đơn theo khoảng ngày (tra cứu giá trị mua)", assertSucceeds(nv.collection("customerEvents").where("customerId", "==", "0901").where("type", "==", "purchase").where("timestamp", ">=", "2026-09-01").where("timestamp", "<=", "2026-10-19").get()));
  await t("NV KHÔNG đọc đơn mua khách shop khác", assertFails(nv.collection("customerEvents").where("customerId", "==", "0902").get()));
  await t("NV KHÔNG đọc đơn của SĐT không có hồ sơ", assertFails(nv.collection("customerEvents").where("customerId", "==", "0999").get()));
  await t("NV KHÔNG quét toàn bộ đơn mua", assertFails(nv.collection("customerEvents").where("type", "==", "purchase").get()));
  await t("CHT đọc đơn mua khách shop mình", assertSucceeds(cht.collection("customerEvents").where("customerId", "==", "0901").get()));
  await t("Admin đọc đơn mua bất kỳ", assertSucceeds(ad.collection("customerEvents").where("customerId", "==", "0902").get()));
  await t("NV đọc lịch sử phân khúc khách shop mình", assertSucceeds(nv.collection("customerSegmentHistory").where("customerId", "==", "0901").get()));
  await t("NV KHÔNG đọc lịch sử phân khúc khách shop khác", assertFails(nv.collection("customerSegmentHistory").where("customerId", "==", "0902").get()));

  console.log("Nhắc tái mua, danh sách gọi hôm nay");
  await t("NV đọc danh sách tái mua shop mình", assertSucceeds(nv.collection("replenishDue").where("shop", "==", "SHOPA").get()));
  await t("NV KHÔNG đọc danh sách tái mua shop khác", assertFails(nv.collection("replenishDue").where("shop", "==", "SHOPB").get()));
  await t("NV KHÔNG quét toàn bộ tái mua", assertFails(nv.collection("replenishDue").get()));
  await t("NV KHÔNG đọc kết quả nhắc tái mua shop khác", assertFails(nv.doc("replenishContacts/c1").get()));
  await t("NV đọc DS gọi hôm nay của shop mình", assertSucceeds(nv.doc("careDaily/2026-10-19_SHOPA").get()));
  await t("NV đọc DS gọi theo ngày + shop", assertSucceeds(nv.collection("careDaily").where("date", "==", "2026-10-19").where("shop", "==", "SHOPA").get()));
  await t("NV KHÔNG đọc DS gọi shop khác", assertFails(nv.doc("careDaily/2026-10-19_SHOPB").get()));
  await t("NV KHÔNG đọc DS gọi toàn chuỗi", assertFails(nv.collection("careDaily").where("date", "==", "2026-10-19").get()));
  await t("Admin đọc DS gọi toàn chuỗi", assertSucceeds(ad.collection("careDaily").where("date", "==", "2026-10-19").get()));
  await t("NV KHÔNG ghi DS gọi", assertFails(nv.doc("careDaily/2026-10-19_SHOPA").set({ shop: "SHOPA" })));
  console.log(`Kết quả: ${pass} đạt, ${fail} lỗi`);
  await env.cleanup();
  process.exit(fail ? 1 : 0);
})();
