const fs = require("fs");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");
let pass = 0, fail = 0;
async function t(n, p) { try { await p; pass++; console.log("  ok  ", n); } catch (e) { fail++; console.log("  FAIL", n, (e.message||"").slice(0,120)); } }
(async () => {
  const env = await initializeTestEnvironment({ projectId: "upharma-test", storage: { rules: fs.readFileSync(process.env.RULES || "storage.rules", "utf8"), host: "127.0.0.1", port: 9199 } });
  await env.withSecurityRulesDisabled(async (c) => { const s = c.storage();
    await s.ref("dailyChecklist/SHOPB/nvB/x.jpg").putString("a"); await s.ref("prescriptionImages/SHOPB/p.jpg").putString("a"); await s.ref("prescriptionImages/SHOPA/p.jpg").putString("a"); await s.ref("other/doc.pdf").putString("a"); });
  const nv = env.authenticatedContext("u", { staffId: "nvA", shop: "SHOPA" }).storage();
  const ad = env.authenticatedContext("a", { admin: true }).storage();
  await t("NV tải ảnh checklist mới", assertSucceeds(nv.ref("dailyChecklist/SHOPA/nvA/2026/1_a.jpg").putString("x")));
  await t("NV tải tệp việc", assertSucceeds(nv.ref("tasks/t1/1_a.pdf").putString("x")));
  await t("NV xem ảnh checklist", assertSucceeds(nv.ref("dailyChecklist/SHOPB/nvB/x.jpg").getMetadata()));
  await t("NV KHÔNG ghi đè ảnh có sẵn", assertFails(nv.ref("dailyChecklist/SHOPB/nvB/x.jpg").putString("y")));
  await t("NV KHÔNG xoá ảnh", assertFails(nv.ref("dailyChecklist/SHOPB/nvB/x.jpg").delete()));
  await t("NV KHÔNG xem ảnh đơn thuốc shop khác", assertFails(nv.ref("prescriptionImages/SHOPB/p.jpg").getMetadata()));
  await t("NV xem ảnh đơn thuốc shop mình", assertSucceeds(nv.ref("prescriptionImages/SHOPA/p.jpg").getMetadata()));
  await t("NV KHÔNG tải vào ảnh đơn thuốc", assertFails(nv.ref("prescriptionImages/SHOPA/n.jpg").putString("x")));
  await t("NV xem tài liệu khác", assertSucceeds(nv.ref("other/doc.pdf").getMetadata()));
  await t("Admin tải ảnh kiểm tra NT", assertSucceeds(ad.ref("storeVisits/SHOPA/d/1/1_a.jpg").putString("x")));
  await t("Admin xoá ảnh", assertSucceeds(ad.ref("dailyChecklist/SHOPB/nvB/x.jpg").delete()));
  await env.cleanup(); console.log(`Kết quả: ${pass} đạt, ${fail} lỗi`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
