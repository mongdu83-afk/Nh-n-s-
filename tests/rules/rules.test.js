// Kiểm thử luật Firestore theo vai trò (audit G1). Chạy: npx firebase emulators:exec --only firestore "node rules.test.js"
const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
const RULES = process.env.RULES || "firestore.rules";
let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log("  ok  ", name); } catch (e) { fail++; console.log("  FAIL", name, "-", (e && e.message || "").slice(0, 160)); } }
(async () => {
  const env = await initializeTestEnvironment({ projectId: "upharma-test", firestore: { rules: fs.readFileSync(RULES, "utf8"), host: "127.0.0.1", port: 8085 } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("tasks/tA").set({ shop: "SHOPA", staffId: "nvA", trangThai: "Đang giao", assignType: "staff", sourceRiskId: "r1", sourceScreen: "checklistQuality", ngayHoanThanh: "2026-10-10" });
    await db.doc("tasks/tB").set({ shop: "SHOPB", staffId: "nvB", trangThai: "Đang giao", assignType: "staff", sourceRiskId: "r2" });
    await db.doc("tasks/tX").set({ shop: "SHOPB", staffId: "nvA", trangThai: "Đang giao", assignType: "staff" });
    await db.doc("crmCustomers/0901").set({ shop: "SHOPA", assignedStaffId: null, phone: "0901", segments: ["Có nguy cơ rời bỏ"] });
    await db.doc("crmCustomers/0902").set({ shop: "SHOPB", assignedStaffId: "nvB", phone: "0902" });
    await db.doc("crmCustomers/0903").set({ shop: "SHOPA", assignedStaffId: "nvA2", phone: "0903" });
    await db.doc("externalSalesOrders/o1").set({ shopCode: "SHOPA" });
    await db.doc("externalSalesOrders/o2").set({ shopCode: "SHOPB" });
    await db.doc("risks/r1").set({ shop: "SHOPA", isOpen: true });
    await db.doc("risks/r2").set({ shop: "SHOPB", isOpen: true });
    await db.doc("prescriptionImages/p1").set({ shopCode: "SHOPA", createdAtTs: "x" });
    await db.doc("prescriptionImages/p2").set({ shopCode: "SHOPB", createdAtTs: "x" });
    await db.doc("kpiAssignments/nvA_2026-10").set({ staffId: "nvA", shop: "SHOPA", thang: "2026-10", actuals: {}, trangThaiDuyet: "" });
    await db.doc("kpiAssignments/chtA_2026-10").set({ staffId: "chtA", shop: "SHOPA", thang: "2026-10", actuals: {}, trangThaiDuyet: "" });
    await db.doc("dailyReports/nvA_2026-10-16").set({ staffId: "nvA", shop: "SHOPA", ngay: "2026-10-16" });
    await db.doc("staff/nvA").set({ shop: "SHOPA" });
    await db.doc("opsProposals/pA").set({ shop: "SHOPA", status: "pending" });
    await db.doc("opsProposals/pB").set({ shop: "SHOPB", status: "pending" });
    await db.doc("opsProposals/pC").set({ status: "pending" });
  });
  const nv = env.authenticatedContext("uNV", { staffId: "nvA", shop: "SHOPA", role: "Nhân viên bán hàng", admin: false, email: "nva@x.vn" }).firestore();
  const cht = env.authenticatedContext("uCHT", { staffId: "chtA", shop: "SHOPA", role: "Cửa hàng trưởng", admin: false }).firestore();
  const ad = env.authenticatedContext("uAD", { admin: true, role: "admin" }).firestore();
  const stranger = env.authenticatedContext("uX", {}).firestore();

  console.log("Việc (tasks)");
  await t("NV đọc việc shop mình", assertSucceeds(nv.doc("tasks/tA").get()));
  await t("NV KHÔNG đọc việc shop khác", assertFails(nv.doc("tasks/tB").get()));
  await t("NV đọc việc giao cho mình ở shop khác", assertSucceeds(nv.doc("tasks/tX").get()));
  await t("NV truy vấn theo shop mình", assertSucceeds(nv.collection("tasks").where("shop", "==", "SHOPA").where("trangThai", "==", "Đang giao").get()));
  await t("NV truy vấn theo staffId mình", assertSucceeds(nv.collection("tasks").where("staffId", "==", "nvA").get()));
  await t("NV KHÔNG truy vấn toàn chuỗi", assertFails(nv.collection("tasks").where("trangThai", "==", "Đang giao").get()));
  await t("CHT việc theo rủi ro + shop (màn chi tiết rủi ro)", assertSucceeds(cht.collection("tasks").where("sourceRiskId", "==", "r1").where("shop", "==", "SHOPA").get()));
  await t("CHT chất lượng checklist + shop", assertSucceeds(cht.collection("tasks").where("sourceScreen", "==", "checklistQuality").where("shop", "==", "SHOPA").get()));
  await t("Admin truy vấn toàn chuỗi", assertSucceeds(ad.collection("tasks").where("trangThai", "==", "Đang giao").get()));
  await t("NV tạo việc shop mình", assertSucceeds(nv.collection("tasks").add({ shop: "SHOPA", staffId: "nvA", title: "x" })));
  await t("NV KHÔNG tạo việc shop khác", assertFails(nv.collection("tasks").add({ shop: "SHOPB", staffId: "nvB", title: "x" })));
  await t("NV nộp kết quả việc mình", assertSucceeds(nv.doc("tasks/tA").update({ subTrangThai: "Chờ kiểm tra", ketQua: "Đã gọi 6/8 khách" })));
  await t("NV KHÔNG đổi người làm", assertFails(nv.doc("tasks/tA").update({ staffId: "nvZ" })));
  await t("NV KHÔNG đổi shop của việc", assertFails(nv.doc("tasks/tA").update({ shop: "SHOPB" })));
  await t("CHT đổi người làm trong shop", assertSucceeds(cht.doc("tasks/tA").update({ staffId: "nvA3", staffName: "C" })));
  await t("NV KHÔNG sửa việc shop khác", assertFails(nv.doc("tasks/tB").update({ ketQua: "x" })));

  console.log("Khách hàng (crmCustomers)");
  await t("NV đọc khách shop mình", assertSucceeds(nv.doc("crmCustomers/0901").get()));
  await t("NV KHÔNG đọc khách shop khác", assertFails(nv.doc("crmCustomers/0902").get()));
  await t("NV truy vấn khách theo shop", assertSucceeds(nv.collection("crmCustomers").where("shop", "==", "SHOPA").get()));
  await t("NV truy vấn phân khúc + shop", assertSucceeds(nv.collection("crmCustomers").where("segments", "array-contains", "Có nguy cơ rời bỏ").where("shop", "==", "SHOPA").get()));
  await t("NV KHÔNG truy vấn toàn chuỗi", assertFails(nv.collection("crmCustomers").get()));
  await t("NV nhận chăm sóc khách chưa ai nhận", assertSucceeds(nv.doc("crmCustomers/0901").set({ assignedStaffId: "nvA", assignedStaffName: "A", lastInteractionTs: "t" }, { merge: true })));
  await t("NV trả khách mình đang nhận", assertSucceeds(nv.doc("crmCustomers/0901").set({ assignedStaffId: null, assignedStaffName: null }, { merge: true })));
  await t("NV KHÔNG giành khách người khác", assertFails(nv.doc("crmCustomers/0903").set({ assignedStaffId: "nvA" }, { merge: true })));
  await t("NV ghi lần liên hệ cuối", assertSucceeds(nv.doc("crmCustomers/0903").set({ lastInteractionTs: "t2" }, { merge: true })));
  await t("NV KHÔNG đổi shop của khách", assertFails(nv.doc("crmCustomers/0901").set({ shop: "SHOPB" }, { merge: true })));
  await t("NV KHÔNG sửa khách shop khác", assertFails(nv.doc("crmCustomers/0902").set({ lastInteractionTs: "t" }, { merge: true })));
  await t("CHT phân công khách trong shop", assertSucceeds(cht.doc("crmCustomers/0903").set({ assignedStaffId: "nvA" }, { merge: true })));
  await t("NV tạo khách shop mình", assertSucceeds(nv.doc("crmCustomers/0909").set({ shop: "SHOPA", phone: "0909" })));
  await t("NV KHÔNG tạo khách shop khác", assertFails(nv.doc("crmCustomers/0908").set({ shop: "SHOPB", phone: "0908" })));
  await t("Admin đọc toàn chuỗi", assertSucceeds(ad.collection("crmCustomers").get()));

  console.log("Đơn bán / rủi ro / ảnh đơn thuốc");
  await t("NV KHÔNG đọc đơn bán shop khác", assertFails(nv.doc("externalSalesOrders/o2").get()));
  await t("NV đọc đơn bán shop mình", assertSucceeds(nv.doc("externalSalesOrders/o1").get()));
  await t("CHT rủi ro theo shop", assertSucceeds(cht.collection("risks").where("shop", "==", "SHOPA").get()));
  await t("CHT KHÔNG đọc rủi ro shop khác", assertFails(cht.doc("risks/r2").get()));
  await t("NV KHÔNG đọc ảnh đơn thuốc shop khác", assertFails(nv.doc("prescriptionImages/p2").get()));
  await t("NV đọc ảnh đơn thuốc shop mình", assertSucceeds(nv.doc("prescriptionImages/p1").get()));
  await t("Admin danh sách ảnh đơn thuốc", assertSucceeds(ad.collection("prescriptionImages").orderBy("createdAtTs", "desc").limit(5).get()));

  console.log("KPI / checklist (tự duyệt)");
  await t("NV nhập kết quả KPI của mình", assertSucceeds(nv.doc("kpiAssignments/nvA_2026-10").update({ "actuals.ds": 5, trangThaiDuyet: "" })));
  await t("NV KHÔNG tự ghi 'QLKV đã duyệt'", assertFails(nv.doc("kpiAssignments/nvA_2026-10").update({ trangThaiDuyet: "QLKV đã duyệt" })));
  await t("CHT duyệt KPI nhân viên shop mình", assertSucceeds(cht.doc("kpiAssignments/nvA_2026-10").update({ trangThaiDuyet: "CHT đã duyệt", nhanXetCHT: "ok" })));
  await t("CHT KHÔNG tự duyệt KPI của mình", assertFails(cht.doc("kpiAssignments/chtA_2026-10").update({ trangThaiDuyet: "CHT đã duyệt" })));
  await t("CHT KHÔNG ghi 'QLKV đã duyệt'", assertFails(cht.doc("kpiAssignments/nvA_2026-10").update({ trangThaiDuyet: "QLKV đã duyệt" })));
  await t("CHT tạo KPI + duyệt cho NV khác", assertSucceeds(cht.doc("kpiAssignments/nvA4_2026-10").set({ staffId: "nvA4", shop: "SHOPA", thang: "2026-10", trangThaiDuyet: "CHT đã duyệt" })));
  await t("Admin ghi 'QLKV đã duyệt'", assertSucceeds(ad.doc("kpiAssignments/nvA_2026-10").update({ trangThaiDuyet: "QLKV đã duyệt" })));
  await t("NV tick checklist của mình", assertSucceeds(nv.doc("dailyReports/nvA_2026-10-16").set({ staffId: "nvA", doneIds: { a: true } }, { merge: true })));
  await t("NV KHÔNG tự chấm điểm checklist", assertFails(nv.doc("dailyReports/nvA_2026-10-16").set({ staffId: "nvA", diemChu: 5 }, { merge: true })));
  await t("CHT chấm điểm checklist NV", assertSucceeds(cht.doc("dailyReports/nvA_2026-10-16").set({ diemChu: 4, nhanXetChu: "tốt" }, { merge: true })));

  console.log("Không đổi (các màn khác vẫn chạy)");
  await t("NV đọc danh sách nhân viên", assertSucceeds(nv.collection("staff").get()));
  await t("NV đọc KPI theo tháng (chưa siết, đợt sau)", assertSucceeds(nv.collection("kpiAssignments").where("thang", "==", "2026-10").get()));
  await t("Tài khoản lạ KHÔNG đọc được gì", assertFails(stranger.collection("staff").get()));

  console.log("Đề xuất AI / góp ý AI");
  await t("NV đọc đề xuất AI shop mình", assertSucceeds(nv.doc("opsProposals/pA").get()));
  await t("NV KHÔNG đọc đề xuất AI shop khác", assertFails(nv.doc("opsProposals/pB").get()));
  await t("NV KHÔNG đọc đề xuất AI toàn chuỗi", assertFails(nv.doc("opsProposals/pC").get()));
  await t("NV KHÔNG truy vấn đề xuất toàn chuỗi", assertFails(nv.collection("opsProposals").where("status", "==", "pending").get()));
  await t("Admin truy vấn đề xuất toàn chuỗi", assertSucceeds(ad.collection("opsProposals").where("status", "==", "pending").get()));
  await t("NV góp ý AI đúng email mình", assertSucceeds(nv.collection("aiFeedback").add({ feature: "x", correctedBy: "nva@x.vn" })));
  await t("NV KHÔNG giả email quản lý", assertFails(nv.collection("aiFeedback").add({ feature: "x", correctedBy: "boss@x.vn" })));
  await t("Admin góp ý AI", assertSucceeds(ad.collection("aiFeedback").add({ feature: "x", correctedBy: "" })));

  await env.cleanup();
  console.log(`\nKết quả: ${pass} đạt, ${fail} lỗi`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
