const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentUpdated, onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const crypto = require("crypto");

initializeApp();
const db = getFirestore();

// Khoá API Anthropic (Claude) — KHÔNG ghi thẳng key vào code. Thiết lập 1 lần bằng lệnh:
//   firebase functions:secrets:set ANTHROPIC_API_KEY
// (dán API key lấy từ console.anthropic.com khi được hỏi). Sau đó deploy lại như bình thường,
// Cloud Functions sẽ tự lấy giá trị này qua ANTHROPIC_API_KEY.value() — không cần đổi gì thêm.
const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

// ================= ĐỒNG BỘ ĐƠN HÀNG BÁN TỪ HỆ THỐNG upharma.com.vn =================
const EXTERNAL_API_BASE = "https://icpc1hn.work/NHATHUOC";
const DEFAULT_SYNC_SHOPS = ["SHOP0058","SHOP0059","SHOP0072","SHOP0074","SHOP0089","SHOP0095","SHOP0121","SHOP0122","SHOP0163"];

// Đăng nhập bằng tài khoản lưu trong opsConfig/externalSystemCreds để lấy Token mới —
// tự làm lại mỗi lần cần, không dùng token cũ có thể đã hết hạn.
// Gọi API kèm TỰ THỬ LẠI khi gặp lỗi (đặc biệt khi server trả về trang lỗi HTML thay vì JSON —
// dấu hiệu kinh điển của bị giới hạn tốc độ/rate limit do gọi quá dồn dập). Chờ tăng dần giữa
// các lần thử (800ms, 1600ms, 2400ms...) để server có thời gian "hạ nhiệt".
async function fetchJsonWithRetry(url, body, retries = 5, baseDelayMs = 1000) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await resp.text();
      try {
        return JSON.parse(text);
      } catch (parseErr) {
        throw new Error(`Phản hồi không phải JSON (có thể bị chặn do gọi quá nhanh): ${text.slice(0, 100)}`);
      }
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, baseDelayMs * attempt));
      }
    }
  }
  throw lastErr;
}

async function loginExternalSystem() {
  const credDoc = await db.collection("opsConfig").doc("externalSystemCreds").get();
  if (!credDoc.exists) {
    throw new Error("Chưa cấu hình tài khoản đăng nhập hệ thống ngoài — cần tạo document opsConfig/externalSystemCreds với username/password.");
  }
  const { username, password } = credDoc.data();
  if (!username || !password) {
    throw new Error("Document opsConfig/externalSystemCreds thiếu username hoặc password.");
  }
  const data = await fetchJsonWithRetry(`${EXTERNAL_API_BASE}/User/UserLogin`, { UserName: username, Password: password });
  if (data.RespCode !== 0) {
    throw new Error("Đăng nhập hệ thống ngoài thất bại: " + (data.RespText || "không rõ lý do"));
  }
  return { token: data.Token, uPharmaID: data.UserInfo && data.UserInfo.uPharmaID };
}

// Dùng GetSalesHeaderByShop (không phải GetOrderHeaderByShop) — vì API tra chi tiết đơn
// (GetSalesHeaderByID) cần đúng mã "HeaderID" dạng DXB..., mà chỉ endpoint này mới trả về đúng
// mã đó dưới tên "HeaderID" (GetOrderHeaderByShop trả về mã DHD... dưới cùng tên field, khiến
// tra chi tiết luôn thất bại — đây chính là nguyên nhân "totalLines" luôn bằng 0 trước đây).
// Gọi lấy đơn hàng theo trang — KHÔNG tin tưởng "NumberRow: 0 = lấy hết", mà chủ động gọi
// nhiều trang liên tiếp cho tới khi trang trả về HOÀN TOÀN TRỐNG (không so với số mình tự yêu
// cầu, vì server có thể tự giới hạn 1 lượng nhỏ cố định mỗi trang bất kể mình xin bao nhiêu —
// nếu so với số tự yêu cầu sẽ dừng quá sớm, bỏ sót các trang sau).
// Có thêm chốt an toàn: nếu 2 trang liên tiếp trả về giống hệt nhau (server không thực sự phân
// trang, luôn trả lại đúng 1 batch bất kể PageNumber), dừng ngay để tránh lặp vô ích.
async function fetchShopOrders(token, uPharmaID, shopCode, timeStart, timeEnd) {
  const MAX_PAGES = 100; // chặn an toàn, tránh vòng lặp vô hạn nếu API trả về sai định dạng
  let all = [];
  let lastFirstId = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await fetchJsonWithRetry(`${EXTERNAL_API_BASE}/SalesInvoice/GetSalesHeaderByShop`, {
      TimeStart: timeStart, TimeEnd: timeEnd, ShopCode: shopCode,
      PageNumber: page, NumberRow: 0, Token: token, uPharmaID: String(uPharmaID),
    });
    const batch = (data && data.SalesHeaderLst) || [];
    if (batch.length === 0) break; // hết dữ liệu thật sự
    const firstId = batch[0] && (batch[0].HeaderID || batch[0].RowID);
    if (firstId != null && firstId === lastFirstId) break; // server trả lặp lại y hệt — dừng
    lastFirstId = firstId;
    all = all.concat(batch);
  }
  return all;
}

// Ghi theo lô — Firestore giới hạn 500 thao tác/batch, nên gộp nhiều batch nếu đơn hàng nhiều.
async function commitInBatches(docs) {
  const BATCH_SIZE = 400;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    docs.slice(i, i + BATCH_SIZE).forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }
}

// Lấy chi tiết từng sản phẩm bên trong 1 đơn hàng cụ thể.
async function fetchOrderDetail(token, uPharmaID, shopCode, headerID) {
  const data = await fetchJsonWithRetry(`${EXTERNAL_API_BASE}/SalesInvoice/GetSalesHeaderByID`, {
    HeaderID: headerID, Token: token, uPharmaID: String(uPharmaID), ShopCode: shopCode,
  });
  return data || {};
}

// Chạy nhiều lời gọi API song song nhưng giới hạn số lượng cùng lúc (tránh làm quá tải server ngoài).
async function mapWithConcurrency(items, limit, worker) {
  const results = [];
  let i = 0;
  async function runOne() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne));
  return results;
}

async function runSyncSalesOrders(rangeOverride) {
  const { token, uPharmaID } = await loginExternalSystem();
  const today = todayISO();
  const fromDate = (rangeOverride && rangeOverride.fromDate) || today;
  const toDate = (rangeOverride && rangeOverride.toDate) || today;
  // withDetail=false: chỉ lấy tổng đơn (nhanh, 1 lần gọi/shop) — dùng khi báo cáo chỉ cần
  // tổng doanh số, không cần theo sản phẩm/ngành hàng. Mặc định true để không đổi hành vi cũ.
  const withDetail = !(rangeOverride && rangeOverride.withDetail === false);
  const timeStart = `${fromDate} 00:00:00`;
  const timeEnd = `${toDate} 23:59:59`;

  const shopListDoc = await db.collection("opsConfig").doc("shopList").get();
  const shops = (shopListDoc.exists && Array.isArray(shopListDoc.data().shops) && shopListDoc.data().shops.length)
    ? shopListDoc.data().shops
    : DEFAULT_SYNC_SHOPS;

  const headerDocs = [];
  const lineDocs = [];
  const perShop = {};
  const sampleDetailErrors = [];
  const shopErrors = {};
  for (const shopCode of shops) {
    let orders = [];
    try {
      orders = await fetchShopOrders(token, uPharmaID, shopCode, timeStart, timeEnd);
    } catch (err) {
      console.error(`Lỗi lấy đơn hàng shop ${shopCode}:`, err && err.message);
      shopErrors[shopCode] = err && err.message ? err.message : String(err);
      continue;
    }
    perShop[shopCode] = orders.length;

    // Lưu header trước (như cũ) — syncDate lấy đúng ngày CỦA ĐƠN (OrderDate), không phải ngày
    // chạy đồng bộ, để dữ liệu lịch sử nhiều ngày trước vẫn được gắn đúng ngày của nó.
    orders.forEach((o) => {
      const docId = String(o.HeaderID || o.RowID).replace(/\//g, "_");
      const orderSyncDate = (o.OrderDate || "").slice(0, 10) || today;
      headerDocs.push({
        ref: db.collection("externalSalesOrders").doc(docId),
        data: { ...o, shopCode, syncDate: orderSyncDate, syncedAtTs: new Date().toISOString() },
      });
    });

    // Lấy chi tiết sản phẩm từng đơn — chạy song song tối đa 8 request cùng lúc để không quá chậm
    // nhưng cũng không làm quá tải server hệ thống ngoài. Bỏ qua hoàn toàn nếu chỉ cần tổng.
    if (withDetail) {
      await mapWithConcurrency(orders, 3, async (o) => {
      const headerID = o.HeaderID;
      if (!headerID) return;
      try {
        const detail = await fetchOrderDetail(token, uPharmaID, shopCode, headerID);
        const info = detail.SalesHeaderInfo || {};
        const lines = info.SalesLineLst || [];
        if (lines.length === 0 && sampleDetailErrors.length < 3) {
          sampleDetailErrors.push({ headerID, shopCode, respondedKeys: Object.keys(detail || {}), infoKeys: Object.keys(info), respCode: detail && detail.RespCode, respText: detail && detail.RespText });
        }
        const safeHeaderId = String(headerID).replace(/\//g, "_");
        const orderSyncDate = (info.OrderDate || o.OrderDate || "").slice(0, 10) || today;
        lines.forEach((line, idx) => {
          const lineId = `${safeHeaderId}_${line.RowID != null && line.RowID !== 0 ? line.RowID : idx}`;
          lineDocs.push({
            ref: db.collection("externalSalesLines").doc(lineId),
            data: {
              headerID, shopCode, syncDate: orderSyncDate,
              orderDate: info.OrderDate || o.OrderDate || "",
              salesName: o.SalesName || "",
              productID: line.ProductID || "", productName: line.ProductName || "",
              unitOfMeasure: line.UnitOfMeasure || "", quantity: line.Quantity || 0,
              unitPrice: line.UnitPrice || 0, amount: line.Amount || 0,
              amountIncludingVAT: line.AmountIncludingVAT || 0, lotCode: line.LotCode || "",
              syncedAtTs: new Date().toISOString(),
            },
          });
        });
      } catch (err) {
        console.error(`Lỗi lấy chi tiết đơn ${headerID} (shop ${shopCode}):`, err && err.message);
        if (sampleDetailErrors.length < 3) {
          sampleDetailErrors.push({ headerID, shopCode, error: err && err.message ? err.message : String(err) });
        }
      }
      });
    }
    // Nghỉ 1 chút giữa các cửa hàng — tránh gọi quá dồn dập khiến server chặn (rate limit),
    // đúng nguyên nhân gây lỗi "not valid JSON" ở lần chạy trước.
    await new Promise((r) => setTimeout(r, 500));
  }

  await commitInBatches(headerDocs);
  await commitInBatches(lineDocs);
  console.log(`Đồng bộ đơn hàng bán (${fromDate} → ${toDate}): ${headerDocs.length} đơn, ${lineDocs.length} dòng sản phẩm, từ ${shops.length} cửa hàng.`, perShop);
  return { totalOrders: headerDocs.length, totalLines: lineDocs.length, shopCount: shops.length, perShop, fromDate, toDate, sampleDetailErrors, shopErrors };
}

// Ngày đầu/cuối của tháng hiện tại, đúng định dạng "YYYY-M-DD 00:00:00" (tháng không đệm số 0,
// khớp với cách hệ thống upharma.com.vn đang dùng khi tự gọi).
function currentMonthRangeForExternalApi() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12, không đệm số 0
  const lastDay = new Date(year, month, 0).getDate();
  return {
    timeStart: `${year}-${month}-01 00:00:00`,
    timeEnd: `${year}-${month}-${lastDay} 00:00:00`,
  };
}

async function fetchByTimeAndShop(path, token, uPharmaID, shopCode, timeStart, timeEnd) {
  const resp = await fetch(`${EXTERNAL_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ TimeStart: timeStart, TimeEnd: timeEnd, ShopCode: shopCode, Token: token, uPharmaID: String(uPharmaID) }),
  });
  return resp.json();
}

async function runSyncWorkRegistrations() {
  const { token, uPharmaID } = await loginExternalSystem();
  const { timeStart, timeEnd } = currentMonthRangeForExternalApi();

  const shopListDoc = await db.collection("opsConfig").doc("shopList").get();
  const shops = (shopListDoc.exists && Array.isArray(shopListDoc.data().shops) && shopListDoc.data().shops.length)
    ? shopListDoc.data().shops
    : DEFAULT_SYNC_SHOPS;

  const docs = [];
  const perShop = { shift: {}, overtime: {} };
  for (const shopCode of shops) {
    try {
      const shiftData = await fetchByTimeAndShop("/ShiftWork/GetShiftWorkByTime", token, uPharmaID, shopCode, timeStart, timeEnd);
      const shiftList = (shiftData && shiftData.ShiftWorkLst) || [];
      perShop.shift[shopCode] = shiftList.length;
      shiftList.forEach((r) => {
        docs.push({ ref: db.collection("externalShiftWork").doc(String(r.RowID).replace(/\//g, "_")), data: { ...r, syncedAtTs: new Date().toISOString() } });
      });
    } catch (err) {
      console.error(`Lỗi lấy ca làm việc shop ${shopCode}:`, err && err.message);
    }
    try {
      const otData = await fetchByTimeAndShop("/OverTime/GetOverTimeByTime", token, uPharmaID, shopCode, timeStart, timeEnd);
      const otList = (otData && (otData.OverTimeLst || otData.OverTimeList)) || [];
      perShop.overtime[shopCode] = otList.length;
      otList.forEach((r) => {
        docs.push({ ref: db.collection("externalOverTime").doc(String(r.RowID).replace(/\//g, "_")), data: { ...r, syncedAtTs: new Date().toISOString() } });
      });
    } catch (err) {
      console.error(`Lỗi lấy tăng ca shop ${shopCode}:`, err && err.message);
    }
  }
  await commitInBatches(docs);
  console.log(`Đồng bộ đăng ký làm việc: ${docs.length} bản ghi từ ${shops.length} cửa hàng.`, perShop);
  return { totalRecords: docs.length, shopCount: shops.length, perShop };
}

// Chạy tự động mỗi ngày lúc 23:45 (giờ Việt Nam) — lấy đăng ký ca/tăng ca của tháng hiện tại.
exports.syncWorkRegistrationsDaily = onSchedule(
  { schedule: "45 23 * * *", timeZone: "Asia/Ho_Chi_Minh", region: "asia-southeast1", timeoutSeconds: 300 },
  async () => {
    await runSyncWorkRegistrations();
  }
);

// Gọi tay từ nút "Lấy dữ liệu ngay" trong app, hoặc mở trực tiếp link để test.
exports.syncWorkRegistrationsNow = onRequest(
  { region: "asia-southeast1", timeoutSeconds: 300, cors: true },
  async (req, res) => {
    try {
      const result = await runSyncWorkRegistrations();
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("syncWorkRegistrationsNow lỗi:", err);
      res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  }
);

async function fetchInventoryByShop(token, uPharmaID, shopCode) {
  const resp = await fetch(`${EXTERNAL_API_BASE}/LocalStore/GetInventoryByShopID`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ProductID: "", LotCode: "", StoreType: "", Token: token, uPharmaID: String(uPharmaID), ShopCode: shopCode }),
  });
  const data = await resp.json();
  return (data && data.LocalStoreLst) || [];
}

// Tồn kho là ảnh chụp tại thời điểm gọi (không có khoảng thời gian như đơn hàng/ca làm việc) —
// đồng bộ 1 lần/ngày là đủ, ghi đè theo đúng ngày (syncDate) để không tích luỹ dữ liệu cũ.
async function runSyncInventory() {
  const { token, uPharmaID } = await loginExternalSystem();
  const today = todayISO();

  const shopListDoc = await db.collection("opsConfig").doc("shopList").get();
  const shops = (shopListDoc.exists && Array.isArray(shopListDoc.data().shops) && shopListDoc.data().shops.length)
    ? shopListDoc.data().shops
    : DEFAULT_SYNC_SHOPS;

  const docs = [];
  const perShop = {};
  for (const shopCode of shops) {
    let items = [];
    try {
      items = await fetchInventoryByShop(token, uPharmaID, shopCode);
    } catch (err) {
      console.error(`Lỗi lấy tồn kho shop ${shopCode}:`, err && err.message);
      continue;
    }
    perShop[shopCode] = items.length;
    items.forEach((it) => {
      const docId = `${shopCode}_${it.ProductID || ""}_${it.LotCode || ""}`.replace(/\//g, "_");
      docs.push({
        ref: db.collection("externalInventory").doc(docId),
        data: { ...it, shopCode, syncDate: today, syncedAtTs: new Date().toISOString() },
      });
    });
  }
  await commitInBatches(docs);
  console.log(`Đồng bộ tồn kho: ${docs.length} dòng từ ${shops.length} cửa hàng.`, perShop);
  return { totalItems: docs.length, shopCount: shops.length, perShop };
}

// Chạy tự động mỗi ngày lúc 23:50 (giờ Việt Nam) — lấy ảnh chụp tồn kho mới nhất.
exports.syncInventoryDaily = onSchedule(
  { schedule: "50 23 * * *", timeZone: "Asia/Ho_Chi_Minh", region: "asia-southeast1", timeoutSeconds: 300 },
  async () => {
    await runSyncInventory();
  }
);

// Gọi tay để test ngay, không cần chờ 23:50.
exports.syncInventoryNow = onRequest(
  { region: "asia-southeast1", timeoutSeconds: 300, cors: true },
  async (req, res) => {
    try {
      const result = await runSyncInventory();
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("syncInventoryNow lỗi:", err);
      res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  }
);

// ================= ĐỒNG BỘ TỒN KHO TỪ HỆ THỐNG upharma.com.vn =================
async function fetchShopInventory(token, uPharmaID, shopCode) {
  const resp = await fetch(`${EXTERNAL_API_BASE}/LocalStore/GetInventoryByShopID`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ProductID: "", LotCode: "", StoreType: "", Token: token, uPharmaID: String(uPharmaID), ShopCode: shopCode }),
  });
  const data = await resp.json();
  return (data && data.LocalStoreLst) || [];
}

async function runSyncInventory() {
  const { token, uPharmaID } = await loginExternalSystem();
  const today = todayISO();

  const shopListDoc = await db.collection("opsConfig").doc("shopList").get();
  const shops = (shopListDoc.exists && Array.isArray(shopListDoc.data().shops) && shopListDoc.data().shops.length)
    ? shopListDoc.data().shops
    : DEFAULT_SYNC_SHOPS;

  const docs = [];
  const perShop = {};
  for (const shopCode of shops) {
    let items = [];
    try {
      items = await fetchShopInventory(token, uPharmaID, shopCode);
    } catch (err) {
      console.error(`Lỗi lấy tồn kho shop ${shopCode}:`, err && err.message);
      continue;
    }
    perShop[shopCode] = items.length;
    items.forEach((it, idx) => {
      const docId = `${shopCode}_${String(it.ProductID || "sp").replace(/\//g, "_")}_${String(it.LotCode || idx).replace(/\//g, "_")}`;
      docs.push({
        ref: db.collection("externalInventory").doc(docId),
        data: { ...it, shopCode, syncDate: today, syncedAtTs: new Date().toISOString() },
      });
    });
  }
  await commitInBatches(docs);
  console.log(`Đồng bộ tồn kho: ${docs.length} dòng từ ${shops.length} cửa hàng.`, perShop);
  return { totalItems: docs.length, shopCount: shops.length, perShop };
}

// Chạy tự động mỗi ngày lúc 23:15 (giờ Việt Nam) — trước khi đồng bộ đơn hàng bán (23:30).
exports.syncInventoryDaily = onSchedule(
  { schedule: "15 23 * * *", timeZone: "Asia/Ho_Chi_Minh", region: "asia-southeast1", timeoutSeconds: 300 },
  async () => {
    await runSyncInventory();
  }
);

// Endpoint gọi tay để test đồng bộ tồn kho ngay lập tức.
exports.syncInventoryNow = onRequest(
  { region: "asia-southeast1", timeoutSeconds: 300, cors: true },
  async (req, res) => {
    try {
      const result = await runSyncInventory();
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("syncInventoryNow lỗi:", err);
      res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  }
);


exports.syncSalesOrdersDaily = onSchedule(
  { schedule: "30 23 * * *", timeZone: "Asia/Ho_Chi_Minh", region: "asia-southeast1", timeoutSeconds: 300 },
  async () => {
    await runSyncSalesOrders();
  }
);

// Gọi tay từ nút "Lấy dữ liệu ngay" trong app, hoặc mở trực tiếp link để test.
exports.syncSalesOrdersNow = onRequest(
  { region: "asia-southeast1", timeoutSeconds: 300, cors: true },
  async (req, res) => {
    try {
      const result = await runSyncSalesOrders();
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("syncSalesOrdersNow lỗi:", err);
      res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  }
);

// Kéo dữ liệu LỊCH SỬ theo khoảng ngày tuỳ ý — gọi bằng URL kèm ?from=YYYY-MM-DD&to=YYYY-MM-DD
// Ví dụ: .../syncSalesOrdersRange?from=2026-08-01&to=2026-08-31
// Với khoảng ngày dài (nhiều tuần/tháng, nhiều đơn hàng), có thể chạy khá lâu vì phải gọi thêm
// 1 API riêng lấy chi tiết sản phẩm cho MỖI đơn hàng — nếu bị timeout, chia nhỏ ra gọi từng
// khoảng ngắn hơn (ví dụ từng tuần một) thay vì gọi nguyên 1 tháng cùng lúc.
exports.syncSalesOrdersRange = onRequest(
  { region: "asia-southeast1", timeoutSeconds: 3600, memory: "512MiB", cors: true },
  async (req, res) => {
    const fromDate = req.query.from;
    const toDate = req.query.to;
    if (!fromDate || !toDate) {
      res.status(400).json({ ok: false, error: "Thiếu tham số — gọi dạng ?from=YYYY-MM-DD&to=YYYY-MM-DD" });
      return;
    }
    try {
      const result = await runSyncSalesOrders({ fromDate, toDate });
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("syncSalesOrdersRange lỗi:", err);
      res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  }
);

// ---- Bản NHANH — chỉ lấy tổng đơn, KHÔNG lấy chi tiết sản phẩm bên trong ----
// Dùng khi báo cáo chỉ cần số liệu tổng hợp (theo ngày/cửa hàng/nhân viên), không cần phân
// tích theo sản phẩm/ngành hàng — nhanh hơn nhiều lần vì không phải gọi thêm API cho từng đơn.
exports.syncSalesOrdersHeadersOnlyNow = onRequest(
  { region: "asia-southeast1", timeoutSeconds: 300, cors: true },
  async (req, res) => {
    try {
      const result = await runSyncSalesOrders({ withDetail: false });
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("syncSalesOrdersHeadersOnlyNow lỗi:", err);
      res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  }
);
exports.syncSalesOrdersHeadersOnlyRange = onRequest(
  { region: "asia-southeast1", timeoutSeconds: 540, memory: "512MiB", cors: true },
  async (req, res) => {
    const fromDate = req.query.from;
    const toDate = req.query.to;
    if (!fromDate || !toDate) {
      res.status(400).json({ ok: false, error: "Thiếu tham số — gọi dạng ?from=YYYY-MM-DD&to=YYYY-MM-DD" });
      return;
    }
    try {
      const result = await runSyncSalesOrders({ fromDate, toDate, withDetail: false });
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("syncSalesOrdersHeadersOnlyRange lỗi:", err);
      res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  }
);


// ===== Cùng công thức tính hạn như trong app (upharma-ops.html), nhưng luôn quy đổi
// theo giờ Việt Nam (server Cloud Functions mặc định chạy giờ UTC nên cần quy đổi rõ ràng) =====
function nowInVN() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const map = {};
  parts.forEach((p) => { map[p.type] = p.value; });
  return { date: `${map.year}-${map.month}-${map.day}`, time: `${map.hour}:${map.minute}` };
}
function todayISO() { return nowInVN().date; }
function nowHM() { return nowInVN().time; }
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function deadlineTs(t) { return `${t.deadline}T${t.hanGio || "23:59"}`; }

// Dự phòng — dùng nếu chưa từng lưu checklist tuỳ chỉnh trong opsConfig/trainingChecklist
const DEFAULT_CHECKLIST = [
  { id: "d1", offset: 0, label: "Giới thiệu quy định cửa hàng, an toàn, GPP cơ bản" },
  { id: "d2", offset: 0, label: "Giới thiệu buddy kèm cặp, tham quan cửa hàng, vị trí hàng hoá" },
  { id: "d3", offset: 3, label: "Slide giới thiệu công ty CPC1 HN, công ty Upharma, nhà thuốc Upharma và các chế độ liên quan" },
  { id: "d4", offset: 5, label: "Hướng dẫn sử dụng phần mềm bán hàng: POS, app Nhà thuốc, máy quẹt thẻ" },
  { id: "d5", offset: 5, label: "Vào POS tìm hiểu sản phẩm CPC1HN, hàng hệ số 1, hàng hệ số 0,5, các quy định & SOP" },
  { id: "d6", offset: 7, label: "Quy định nhà thuốc: giờ giấc làm việc, chấm công, vệ sinh cửa hàng, trang phục, biển tên" },
  { id: "d7", offset: 7, label: "Thái độ làm việc: cử chỉ, lời nói bán hàng; tương tác nhóm qua Skype/Zalo/Facebook" },
  { id: "d8", offset: 7, label: "Học layout: vị trí, sắp xếp nhóm thuốc tại nhà thuốc" },
  { id: "d9", offset: 15, label: "Học đào tạo cùng bộ phận đào tạo; ôn lại kiến thức đã học" },
  { id: "d10", offset: 15, label: "Thực hành cắt liều, ra đơn, thao tác trên POS" },
  { id: "d11", offset: 15, label: "Ôn lại layout, vị trí sắp xếp nhóm thuốc tại nhà thuốc" },
  { id: "d12", offset: 23, label: "KPI: chăm sóc khách mới/khách cũ, tạo nhóm CSKH, ra đơn online" },
  { id: "d13", offset: 23, label: "KPI: doanh số cá nhân, doanh số nhà thuốc" },
  { id: "d14", offset: 23, label: "KPI: hàng hệ số (hệ số 1, hệ số 0,5), hàng chậm luân chuyển, hàng cận date" },
  { id: "d15", offset: 23, label: "Bắt đầu kiểm tra định kỳ 2 bài/tuần + Zoom thứ 6 hàng tuần, roleplay & coaching hàng tháng" },
  { id: "d16", offset: 23, label: "Tham gia họp nhóm hàng tuần" },
  { id: "d17", offset: 31, label: "Thao tác POS: bán hàng/xuất bill, dự trù hàng hoá, nhập hàng hoá, tìm kiếm hàng hoá & tồn kho" },
  { id: "d18", offset: 31, label: "Thao tác POS: kiểm kê hàng hoá, báo cáo kết ca" },
  { id: "d19", offset: 31, label: "Công việc tại nhà thuốc: sắp xếp thuốc theo khu vực, lau dọn quầy kệ, vệ sinh; ghi chép sổ sách, xử lý hàng cận date khi kiểm kê" },
  { id: "d20", offset: 31, label: "Đánh giá cuối thử việc — kiểm tra kiến thức tổng hợp" },
  { id: "d21", offset: 31, label: "Phỏng vấn phản hồi 2 chiều (nhân viên mới và quản lý)" },
  { id: "d22", offset: 39, label: "Thực hành bán hàng, tư vấn khách hàng" },
  { id: "d23", offset: 39, label: "Kiểm tra thao tác POS: đăng ký lịch làm việc, xem công, đăng ký nghỉ phép/làm thêm giờ" },
  { id: "d24", offset: 39, label: "Kiểm tra thao tác POS: tạo/chỉnh sửa đơn hàng, tra cứu hàng hoá & giá, xác nhận đơn hàng/đơn đặt/đơn bán" },
  { id: "d25", offset: 39, label: "Kiểm tra thao tác POS: bán đơn khuyến mãi, xử lý đơn lỗi/mở lại đơn, nộp tiền kế toán, bàn giao ca" },
  { id: "d26", offset: 47, label: "Kiểm tra thao tác POS: tìm kiếm & cài vị trí sản phẩm; kiểm kê hàng hoá (tạo phiếu, xử lý sai lệch tồn kho)" },
  { id: "d27", offset: 47, label: "Kiểm tra thao tác POS: check tồn kho các shop/hệ thống; xử lý trả hàng của khách & trả hàng về kho tổng; xử lý hàng cận/hết date" },
  { id: "d28", offset: 54, label: "Kiểm tra thao tác POS: nhập kho; gọi hàng (phân biệt trạng thái đơn, gọi hàng tuần/gọi gấp); tra cứu tình trạng xử lý đơn hàng" },
  { id: "d29", offset: 61, label: "Kiểm tra thao tác POS: tra cứu tài liệu sản phẩm công ty/SOP/quy trình quy định; tra cứu kết quả kiểm tra" },
  { id: "d30", offset: 61, label: "Ghi chép sổ sách: lưu đơn với thuốc mua theo đơn, kháng sinh, kháng virus; theo dõi dữ liệu nhiệt kế ẩm tự ghi" },
  { id: "d31", offset: 61, label: "Tổng kết 2 tháng đào tạo buddy — đánh giá cuối cùng" },
];

// ===== Helper: gửi push cho 1 nhân viên cụ thể, hoặc cho cả shop (mọi nhân viên thuộc shop đó) =====
// Tự động dọn token hỏng/hết hạn (nguyên nhân phổ biến nhất khiến "chỉ nhận được lần đầu")
// để các lần gửi sau không bị chặn bởi token cũ không còn dùng được.
async function sendPushToStaff(staffId, title, body) {
  if (!staffId) return;
  const tokRef = db.collection("fcmTokens").doc(staffId);
  const tokDoc = await tokRef.get();
  const tokens = tokDoc.exists ? (tokDoc.data().tokens || []) : [];
  if (tokens.length === 0) {
    console.log(`Nhân viên ${staffId} chưa có token nào (chưa bật thông báo trên thiết bị nào) — bỏ qua.`);
    return;
  }
  const messages = tokens.map((token) => ({
    token,
    notification: { title, body },
    webpush: { notification: { icon: "/icon-192.png" }, fcmOptions: { link: "/" } },
  }));
  try {
    const result = await getMessaging().sendEach(messages);
    console.log(`[${staffId}] Đã gửi ${result.successCount}/${messages.length}, lỗi ${result.failureCount}.`);
    const deadTokens = [];
    result.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error && r.error.code;
        console.error(`[${staffId}] Token lỗi (${code}):`, r.error && r.error.message);
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
          deadTokens.push(messages[i].token);
        }
      }
    });
    if (deadTokens.length > 0) {
      await tokRef.set(
        { tokens: tokens.filter((t) => !deadTokens.includes(t)) },
        { merge: true }
      );
      console.log(`[${staffId}] Đã tự động xoá ${deadTokens.length} token hỏng/hết hạn.`);
    }
  } catch (err) {
    console.error("Lỗi gửi push cho nhân viên", staffId, err && err.message);
  }
}
async function sendPushToShop(shop, title, body) {
  if (!shop) return;
  const staffSnap = await db.collection("staff").where("shop", "==", shop).get();
  await Promise.all(staffSnap.docs.map((doc) => sendPushToStaff(doc.id, title, body)));
}

// ---- 1) Nhận xét của quản lý trên công việc được giao (module Giao việc) ----
exports.notifyTaskFeedback = onDocumentUpdated(
  { document: "tasks/{taskId}", region: "asia-southeast1" },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    if ((before.nhanXetQuanLy || "") === (after.nhanXetQuanLy || "") || !after.nhanXetQuanLy) return;
    if (after.assignType === "staff" && after.staffId) {
      await sendPushToStaff(
        after.staffId,
        "💬 Quản lý phản hồi việc bạn đã làm",
        `${after.title || "Công việc"}: ${after.nhanXetQuanLy}`
      );
    }
  }
);

// ---- 2) Quản lý chấm điểm/nhận xét Checklist công việc hàng ngày ----
exports.notifyDailyReportReview = onDocumentUpdated(
  { document: "dailyReports/{reportId}", region: "asia-southeast1" },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    const changed = (before.nhanXetChu || "") !== (after.nhanXetChu || "") || before.diemChu !== after.diemChu;
    if (!changed || !after.staffId || (!after.nhanXetChu && after.diemChu == null)) return;
    const stars = after.diemChu ? "★".repeat(after.diemChu) : "";
    await sendPushToStaff(
      after.staffId,
      "✅ Quản lý đã chấm checklist ngày",
      `${after.ngay || ""}: ${stars}${after.nhanXetChu ? " — " + after.nhanXetChu : ""}`
    );
  }
);

// ---- 3) Quản lý chấm điểm/nhận xét Báo cáo tuần (theo cả shop) ----
exports.notifyWeeklyReportReview = onDocumentUpdated(
  { document: "weeklyReports/{reportId}", region: "asia-southeast1" },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    const changed = (before.nhanXetChu || "") !== (after.nhanXetChu || "") || before.diemChu !== after.diemChu;
    if (!changed || !after.shop || (!after.nhanXetChu && after.diemChu == null)) return;
    const stars = after.diemChu ? "★".repeat(after.diemChu) : "";
    await sendPushToShop(
      after.shop,
      "✅ Quản lý đã chấm báo cáo tuần",
      `Tuần ${after.tuanNgay || ""}: ${stars}${after.nhanXetChu ? " — " + after.nhanXetChu : ""}`
    );
  }
);

// ---- 4) Quản lý duyệt ảnh checklist/CTKM (theo cả shop) ----
exports.notifyImageReportReview = onDocumentUpdated(
  { document: "imageReports/{reportId}", region: "asia-southeast1" },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    const changed = (before.nhanXetDuyet || "") !== (after.nhanXetDuyet || "") || before.trangThaiDuyet !== after.trangThaiDuyet;
    if (!changed || !after.shop || !after.trangThaiDuyet) return;
    const title = after.trangThaiDuyet === "Đạt" ? "✅ Quản lý duyệt ảnh: Đạt yêu cầu" : "⚠️ Quản lý duyệt ảnh: Chưa đạt";
    await sendPushToShop(after.shop, title, after.nhanXetDuyet || `Ảnh ngày ${after.ngay || ""}`);
  }
);

// ---- 5) Cửa hàng trưởng / Quản lý khu vực nhận xét-duyệt KPI ----
exports.notifyKpiReview = onDocumentUpdated(
  { document: "kpiAssignments/{assignId}", region: "asia-southeast1" },
  async (event) => {
    const before = event.data.before.data() || {};
    const after = event.data.after.data() || {};
    if (!after.staffId) return;
    const commentChanged = (before.nhanXetCHT || "") !== (after.nhanXetCHT || "");
    const statusChanged = before.trangThaiDuyet !== after.trangThaiDuyet;
    if (!commentChanged && !statusChanged) return;
    if (statusChanged && after.trangThaiDuyet === "QLKV đã duyệt") {
      await sendPushToStaff(after.staffId, "✅ Quản lý khu vực đã duyệt KPI", `KPI tháng ${after.thang || ""} của bạn đã được duyệt.`);
    } else if (commentChanged && after.nhanXetCHT) {
      await sendPushToStaff(after.staffId, "💬 Cửa hàng trưởng nhận xét KPI", after.nhanXetCHT);
    }
  }
);


// ---- 6) Buddy/quản lý viết nhận xét tuần đào tạo (tab Đào tạo & Buddy) ----
// Lưu ý: mỗi lần gửi báo cáo tuần là 1 document MỚI (không phải sửa document cũ),
// nên phải dùng onDocumentCreated thay vì onDocumentUpdated.
exports.notifyBuddyWeeklyReport = onDocumentCreated(
  { document: "buddyReports/{reportId}", region: "asia-southeast1" },
  async (event) => {
    const r = event.data.data() || {};
    if (!r.hireId) return;
    const hireDoc = await db.collection("newHires").doc(r.hireId).get();
    const staffId = hireDoc.exists ? hireDoc.data().staffId : null;
    if (!staffId) return; // nhân viên mới chưa liên kết tài khoản thì không gửi được
    const stars = r.danhGia ? "★".repeat(r.danhGia) : "";
    await sendPushToStaff(
      staffId,
      "📝 Nhận xét tuần đào tạo",
      `Tuần ${r.tuan || ""}: ${stars}${r.noiDung ? " — " + r.noiDung : ""}`
    );
  }
);


// ---- 7) Có người được tặng sao (module Ghi nhận & Quà) — báo cho TOÀN BỘ nhân viên + Admin ----
// Mỗi lượt tặng sao là 1 document MỚI, nên dùng onDocumentCreated.
exports.notifyKudosGiven = onDocumentCreated(
  { document: "kudos/{kudosId}", region: "asia-southeast1" },
  async (event) => {
    const k = event.data.data() || {};
    if (!k.toName) return;
    const staffSnap = await db.collection("staff").get();
    const title = "⭐ Có người vừa được tặng sao!";
    const body = `${k.fromName || "Ai đó"} tặng ${k.toName} ${k.stars || ""}★${k.message ? ": " + k.message : ""}`;
    const jobs = staffSnap.docs.map((doc) => sendPushToStaff(doc.id, title, body));
    // Tài khoản Admin không nằm trong collection "staff" (đăng nhập riêng bằng ADMIN_EMAILS),
    // nên phải gửi thêm riêng, nếu không Admin sẽ không bao giờ nhận được thông báo này.
    jobs.push(sendPushToStaff("admin", title, body));
    await Promise.all(jobs);
  }
);


// ---- 8) Bị tag "Người thực hiện" trong 1 dòng Kế hoạch tuần (module Báo cáo tuần) ----
// So sánh trước/sau theo từng dòng (khớp theo id dòng) để chỉ báo cho người MỚI được tag
// thêm vào, không báo lại cho người đã có sẵn từ trước.
function flattenWeeklyPlan(keHoach){
  const list = [];
  if (!keHoach) return list;
  Object.keys(keHoach).forEach((catKey) => {
    (keHoach[catKey] || []).forEach((r) => {
      list.push({ id: r.id, noiDung: r.noiDung, deadline: r.deadline, staffIds: r.nguoiThucHienIds || [] });
    });
  });
  return list;
}
exports.notifyWeeklyPlanTag = onDocumentWritten(
  { document: "weeklyReports/{reportId}", region: "asia-southeast1" },
  async (event) => {
    const beforeData = event.data.before.exists ? event.data.before.data() : null;
    const afterData = event.data.after.exists ? event.data.after.data() : null;
    if (!afterData) return;
    const beforeRows = flattenWeeklyPlan(beforeData && beforeData.keHoach);
    const afterRows = flattenWeeklyPlan(afterData.keHoach);
    const beforeMap = {};
    beforeRows.forEach((r) => { beforeMap[r.id] = r; });
    const jobs = [];
    afterRows.forEach((r) => {
      const prevStaffIds = (beforeMap[r.id] && beforeMap[r.id].staffIds) || [];
      const newlyTagged = r.staffIds.filter((id) => !prevStaffIds.includes(id));
      newlyTagged.forEach((staffId) => {
        jobs.push(sendPushToStaff(
          staffId,
          "📌 Bạn được giao 1 việc trong kế hoạch tuần",
          `${r.noiDung || "Việc mới"}${r.deadline ? ` — hạn ${r.deadline}` : ""}`
        ));
      });
    });
    await Promise.all(jobs);
  }
);


// ---- 9) Tick checklist đào tạo (tab Đào tạo & Buddy) — báo 2 chiều giữa nhân viên mới và buddy ----
exports.notifyTrainingProgress = onDocumentUpdated(
  { document: "trainingProgress/{hireId}", region: "asia-southeast1" },
  async (event) => {
    const hireId = event.params.hireId;
    const before = (event.data.before.data() || {}).done || {};
    const after = (event.data.after.data() || {}).done || {};
    const hireDoc = await db.collection("newHires").doc(hireId).get();
    if (!hireDoc.exists) return;
    const hire = hireDoc.data();

    const cfgSnap = await db.collection("opsConfig").doc("trainingChecklist").get();
    const checklist = cfgSnap.exists && Array.isArray(cfgSnap.data().items) && cfgSnap.data().items.length
      ? cfgSnap.data().items : [];
    const labelOf = (taskId) => { const t = checklist.find((x) => x.id === taskId); return t ? t.label : "1 mục checklist"; };

    const jobs = [];
    const taskIds = new Set([...Object.keys(before), ...Object.keys(after)]);
    taskIds.forEach((taskId) => {
      const b = before[taskId] || {};
      const a = after[taskId] || {};
      // Nhân viên mới vừa tick "đã học" (trước đó chưa có) → báo cho buddy đi kiểm tra
      if (!b.hireDate && a.hireDate && hire.buddyId) {
        jobs.push(sendPushToStaff(
          hire.buddyId,
          "👀 Cần bạn kiểm tra & xác nhận",
          `${hire.name} vừa báo đã học xong: ${labelOf(taskId)}`
        ));
      }
      // Buddy vừa xác nhận (trước đó chưa có) → báo cho nhân viên mới (nếu đã liên kết tài khoản)
      if (!b.buddyDate && a.buddyDate && hire.staffId) {
        jobs.push(sendPushToStaff(
          hire.staffId,
          "✅ Buddy đã xác nhận cho bạn",
          `${labelOf(taskId)} đã được buddy kiểm tra & xác nhận.`
        ));
      }
    });
    await Promise.all(jobs);
  }
);


// ================= AI HỖ TRỢ TÓM TẮT & PHÂN TÍCH BÁO CÁO (Claude API) =================
// Ý tưởng: quản lý vẫn xem báo cáo GỐC như cũ — AI chỉ chạy nền, ghi thêm 1 khối tóm tắt/
// nhận xét bên cạnh (field aiSummary/aiFlag), giúp quản lý nắm nhanh trước khi đọc chi tiết.
// Không đổi bất kỳ field cũ nào, không chặn luồng nộp báo cáo hiện tại nếu AI lỗi/chưa cấu hình.

const CLAUDE_MODEL = "claude-sonnet-4-5-20250929";
const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";

// Băm nội dung để biết "nội dung thật sự" có đổi không — tránh gọi lại AI khi chỉ có
// quản lý chấm điểm/nhận xét (diemChu, nhanXetChu...) thay đổi, không phải nội dung báo cáo.
function contentHash(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

// Gọi Claude API, tự thử lại vài lần nếu lỗi mạng/quá tải (giống fetchJsonWithRetry ở trên).
// Trả về text trả lời thô của Claude (chuỗi), hoặc null nếu gọi thất bại sau khi đã thử lại.
async function callClaude({ system, content, maxTokens = 700, retries = 3, model = CLAUDE_MODEL }) {
  const apiKey = ANTHROPIC_API_KEY.value();
  if (!apiKey) {
    console.error("Chưa cấu hình ANTHROPIC_API_KEY (secret) — bỏ qua bước phân tích AI.");
    return null;
  }
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(CLAUDE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content }],
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(`Claude API lỗi ${resp.status}: ${(data && data.error && data.error.message) || JSON.stringify(data)}`);
      }
      const text = (data.content || []).map((b) => b.text || "").join("\n").trim();
      return text || null;
    } catch (err) {
      lastErr = err;
      console.error(`callClaude thử lần ${attempt} thất bại:`, err.message || err);
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }
  console.error("callClaude thất bại sau khi thử lại nhiều lần:", lastErr && lastErr.message);
  return null;
}

// Tải 1 ảnh từ URL (download URL của Firebase Storage) về dạng base64 để gửi kèm cho Claude
// (Claude Vision cần ảnh dạng base64, không nhận thẳng URL công khai).
async function fetchImageAsBase64(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Không tải được ảnh (HTTP ${resp.status}): ${url}`);
  const contentType = resp.headers.get("content-type") || "image/jpeg";
  const buf = Buffer.from(await resp.arrayBuffer());
  return { mediaType: contentType.split(";")[0], base64: buf.toString("base64") };
}

// Cố gắng tách phần "Mức độ: ..." mà ta yêu cầu Claude luôn trả về ở dòng đầu, để lưu riêng
// vào field aiFlag (dùng hiển thị màu/badge), phần còn lại giữ nguyên làm aiSummary.
function splitFlagFromSummary(text) {
  if (!text) return { flag: null, summary: null };
  const m = text.match(/^\s*Mức độ:\s*(Bình thường|Cần chú ý|Khẩn cấp)\s*\n+([\s\S]*)$/i);
  if (!m) return { flag: null, summary: text.trim() };
  return { flag: m[1], summary: m[2].trim() };
}

// ---- Metadata tối thiểu để dựng lại nội dung báo cáo tuần thành đoạn văn cho AI đọc ----
// (giữ đồng bộ thủ công với WEEKLY_CATEGORIES / WEEKLY_PROGRESS_ITEMS trong index.html —
// chỉ dùng để LÀM PROMPT dễ đọc hơn, không ảnh hưởng cấu trúc dữ liệu lưu trong Firestore).
const WEEKLY_CATEGORIES_META = [
  { key: "khachHang", label: "Khách hàng" },
  { key: "hangHoa", label: "Hàng hoá" },
  { key: "nhanSu", label: "Nhân sự" },
  { key: "coSoVatChat", label: "Cơ sở vật chất" },
];
const WEEKLY_PROGRESS_META = [
  { key: "revenueProgress", label: "Doanh thu" },
  { key: "heSoProgress", label: "Hàng hệ số" },
  { key: "avgBillProgress", label: "Trung bình bill" },
];

function buildWeeklyReportText(report) {
  const lines = [];
  lines.push(`Nhà thuốc: ${report.shop || "?"} — Tuần bắt đầu ${report.tuanNgay || "?"}`);
  if (report.nguoiBaoCao) lines.push(`Người báo cáo: ${report.nguoiBaoCao}`);

  lines.push("\n== Kết quả thực hiện tuần này ==");
  WEEKLY_CATEGORIES_META.forEach((c) => {
    const rows = (report.ketQua && report.ketQua[c.key]) || [];
    const filled = rows.filter((r) => (r.noiDung || r.ketQua || "").trim());
    if (!filled.length) return;
    lines.push(`- ${c.label}:`);
    filled.forEach((r) => {
      lines.push(`  + Kế hoạch: ${r.noiDung || "—"}${r.target ? ` (target: ${r.target})` : ""} → Kết quả: ${r.ketQua || "chưa ghi kết quả"}`);
    });
  });

  lines.push("\n== Tiến độ chỉ tiêu tháng (tính đến tuần này) ==");
  WEEKLY_PROGRESS_META.forEach((it) => {
    const v = report[it.key];
    if (!v || (!v.target && !v.actualWeek)) return;
    lines.push(`- ${it.label}: thực hiện tuần ${v.actualWeek || 0}${v.target ? `, chỉ tiêu tháng ${v.target}` : ""}`);
  });

  lines.push("\n== Kế hoạch cam kết tuần tới ==");
  WEEKLY_CATEGORIES_META.forEach((c) => {
    const rows = (report.keHoach && report.keHoach[c.key]) || [];
    const filled = rows.filter((r) => (r.noiDung || "").trim());
    if (!filled.length) return;
    lines.push(`- ${c.label}:`);
    filled.forEach((r) => {
      lines.push(`  + ${r.noiDung}${r.deadline ? ` (hạn ${r.deadline})` : ""}`);
    });
  });

  if (report.ghiChu && report.ghiChu.trim()) {
    lines.push(`\n== Ghi chú thêm ==\n${report.ghiChu.trim()}`);
  }
  return lines.join("\n");
}

const WEEKLY_SUMMARY_SYSTEM_PROMPT =
  "Bạn là trợ lý đọc báo cáo tuần của các nhà thuốc trong chuỗi Upharma, hỗ trợ quản lý khu vực " +
  "nắm nhanh tình hình trước khi đọc chi tiết. Luôn trả lời bằng tiếng Việt, ngắn gọn, đúng trọng tâm. " +
  "Định dạng câu trả lời BẮT BUỘC gồm đúng 2 phần, theo thứ tự:\n" +
  "Dòng đầu tiên: \"Mức độ: X\" với X là một trong 3 giá trị chính xác: Bình thường / Cần chú ý / Khẩn cấp " +
  "(Khẩn cấp = có dấu hiệu nghiêm trọng cần quản lý xử lý ngay, vd nhân sự nghỉ đột ngột, sự cố hàng hoá lớn, " +
  "khách hàng phàn nàn nghiêm trọng; Cần chú ý = có vấn đề nhưng chưa cấp bách; Bình thường = không có gì bất thường).\n" +
  "Sau đó xuống dòng trống, viết 1 đoạn tóm tắt 3-5 câu: tình hình chung, kết quả nổi bật, vấn đề cần lưu ý " +
  "(nếu có), và có đạt tiến độ chỉ tiêu tháng hay không. Không lặp lại nguyên văn dữ liệu thô, hãy diễn giải " +
  "cô đọng như một trợ lý thực sự đang báo cáo miệng cho quản lý.";

// Trigger khi tài liệu weeklyReports/{reportId} được tạo/cập nhật. Chỉ thực sự gọi AI khi
// NỘI DUNG báo cáo (không tính điểm/nhận xét của quản lý) thay đổi so với lần AI xử lý gần nhất.
exports.summarizeWeeklyReportWithAI = onDocumentWritten(
  {
    document: "weeklyReports/{reportId}",
    region: "asia-southeast1",
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (event) => {
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!after) return; // tài liệu bị xoá — không cần xử lý

    const relevantContent = {
      ghiChu: after.ghiChu || "",
      ketQua: after.ketQua || {},
      keHoach: after.keHoach || {},
      progress: WEEKLY_PROGRESS_META.map((it) => after[it.key] || null),
    };
    const newHash = contentHash(relevantContent);
    if (after.aiContentHash === newHash) return; // nội dung không đổi (chỉ đổi điểm/nhận xét) — bỏ qua

    const reportText = buildWeeklyReportText(after);
    const raw = await callClaude({ system: WEEKLY_SUMMARY_SYSTEM_PROMPT, content: reportText, maxTokens: 500 });
    if (!raw) return; // gọi AI thất bại — để nguyên, lần ghi tiếp theo của tài liệu này sẽ tự thử lại

    const { flag, summary } = splitFlagFromSummary(raw);
    await event.data.after.ref.set(
      {
        aiSummary: summary || raw,
        aiFlag: flag || null,
        aiContentHash: newHash,
        aiUpdatedAtTs: new Date(),
      },
      { merge: true }
    );
  }
);


// ---- AI phân tích XU HƯỚNG "Khách đặt hàng" (customerOrders) ----
// Chạy THEO YÊU CẦU: quản lý chọn khoảng thời gian (từ ngày - đến ngày) trên giao diện rồi bấm
// nút "Phân tích", gộp toàn bộ đơn trong đúng khoảng đó lại rồi phân tích 1 lượt. Không còn chạy
// tự động theo lịch cố định — mỗi lần bấm nút là 1 lần phân tích mới theo đúng khoảng đã chọn.

const ORDER_TREND_BASE_PROMPT =
  `Bạn là trợ lý phân tích danh sách "khách đặt hàng/hàng thiếu" của chuỗi nhà thuốc Upharma trong khoảng thời gian ` +
  "quản lý chọn, giúp quản lý thấy xu hướng khách hay hỏi mua gì để chủ động nhập hàng. Luôn trả lời bằng tiếng " +
  "Việt. Khi liệt kê sản phẩm, hãy TỰ GỘP các tên gần giống nhau do nhân viên gõ khác nhau (khác dấu, viết " +
  "tắt, sai chính tả nhẹ) thành cùng 1 sản phẩm, không tách lẻ.\n" +
  "QUAN TRỌNG VỀ CÔNG DỤNG: một số dòng có kèm sẵn \"Công dụng:\" — đây là do CHÍNH NHÂN VIÊN ghi lại khi tạo " +
  "đơn, bạn ĐƯỢC PHÉP dùng đúng nguyên văn thông tin này khi nhắc tới sản phẩm đó. Nhưng với sản phẩm KHÔNG có " +
  "kèm \"Công dụng:\", TUYỆT ĐỐI KHÔNG được tự suy đoán hoặc bịa ra công dụng/nhóm thuốc cho sản phẩm đó — bạn " +
  "không có cơ sở dữ liệu dược phẩm đáng tin cậy để tự đoán, có thể sai và gây hiểu nhầm nguy hiểm. Với sản phẩm " +
  "không có công dụng kèm theo, chỉ nêu đúng tên, không thêm diễn giải nào.\n" +
  "Viết theo cấu trúc:\n" +
  "1) \"Top sản phẩm khách hỏi nhiều nhất\": liệt kê tối đa 8 sản phẩm, kèm số lần được hỏi (và công dụng nếu " +
  "có dữ liệu thật kèm theo).\n" +
  "2) \"Theo từng nhà thuốc\" (nếu thấy khác biệt rõ rệt giữa các shop, nêu ngắn gọn; nếu không có gì nổi bật " +
  "thì bỏ qua mục này).\n" +
  "3) \"Đề xuất hành động\": 1-3 gợi ý cụ thể, ngắn gọn (vd nên ưu tiên nhập sản phẩm nào, shop nào cần bổ " +
  "sung hàng gấp) — chỉ dựa trên SỐ LẦN ĐƯỢC HỎI và công dụng thật (nếu có), không dựa trên suy đoán.\n" +
  "Không cần phần \"Mức độ\". Toàn bộ trả lời không quá khoảng 250 từ.";

// Quản lý có thể tự thêm yêu cầu riêng (không cần deploy lại code) tại mục "Yêu cầu phân tích AI"
// trong tab Khách đặt hàng — lưu ở opsConfig/aiOrderTrendConfig, field "customInstructions".
async function getOrderTrendCustomInstructions() {
  try {
    const doc = await db.collection("opsConfig").doc("aiOrderTrendConfig").get();
    const custom = doc.exists && doc.data().customInstructions;
    return (custom && custom.trim()) || "";
  } catch (err) {
    console.error("Không đọc được yêu cầu phân tích tuỳ chỉnh:", err.message || err);
    return "";
  }
}

function buildOrderTrendSystemPrompt(customInstructions) {
  if (!customInstructions) return ORDER_TREND_BASE_PROMPT;
  return `${ORDER_TREND_BASE_PROMPT}\n\nYêu cầu thêm từ quản lý (ưu tiên áp dụng, kể cả khi khác với hướng dẫn ở trên):\n${customInstructions}`;
}

// Suy ra đúng loại đơn (giống hệt logic phía giao diện) — tương thích ngược với dữ liệu cũ
// (trước khi có loại "henLay" riêng, đơn hẹn ngày cụ thể vẫn lưu loaiDon="hangThieu" kèm ngayHen).
function orderKindLabel(o) {
  if (o.loaiDon === "shipHang") return "khách đặt ship hàng";
  if (o.loaiDon === "henLay" || o.coHenNgay || o.ngayHen) return "khách hẹn ngày đến lấy";
  return "hàng thiếu tại quầy (chưa hẹn ngày)";
}

function buildOrderTrendPromptText(orders, fromDate, toDate) {
  const lines = orders.map((o) => {
    const parts = [`Shop ${o.shop || "?"}`, `Sản phẩm: ${o.productName || "?"}`];
    if (o.congDung && o.congDung.trim()) parts.push(`Công dụng: ${o.congDung.trim()}`);
    if (o.soLuong) parts.push(`SL: ${o.soLuong}`);
    parts.push(`Loại: ${orderKindLabel(o)}`);
    if (o.hangHetTon) parts.push("hàng hết tồn");
    if (o.hangKhongCoHeThong) parts.push("hệ thống không có mã hàng này");
    return "- " + parts.join(" | ");
  });
  return `Danh sách ${orders.length} lượt khách đặt hàng/hỏi hàng thiếu từ ${fromDate} đến ${toDate}:\n\n${lines.join("\n")}`;
}

// Phân tích theo ĐÚNG khoảng ngày (fromDate/toDate, định dạng YYYY-MM-DD) do quản lý chọn trên
// giao diện — không còn tự suy ra khoảng ngày cố định.
async function runCustomerOrderTrendAnalysis(fromDate, toDate) {
  const snap = await db.collection("customerOrders")
    .where("ngayTao", ">=", fromDate)
    .where("ngayTao", "<=", toDate)
    .get();
  const orders = snap.docs.map((d) => d.data()).filter((o) => o.productName);
  if (orders.length === 0) {
    console.log(`analyzeCustomerOrderTrendsNow: không có đơn nào từ ${fromDate} đến ${toDate} — bỏ qua.`);
    return { ok: false, reason: "Không có đơn nào trong khoảng thời gian đã chọn." };
  }

  const promptText = buildOrderTrendPromptText(orders, fromDate, toDate);
  const customInstructions = await getOrderTrendCustomInstructions();
  const raw = await callClaude({ system: buildOrderTrendSystemPrompt(customInstructions), content: promptText, maxTokens: 1500 });
  if (!raw) return { ok: false, reason: "Không gọi được AI (thiếu cấu hình hoặc lỗi API)." };

  await db.collection("opsConfig").doc("aiOrderTrends").set(
    {
      summary: raw.trim(),
      orderCount: orders.length,
      periodFrom: fromDate,
      periodTo: toDate,
      generatedAtTs: new Date(),
    },
    { merge: true }
  );
  return { ok: true, orderCount: orders.length };
}

// Gọi tay từ nút "Phân tích" trong tab Khách đặt hàng — quản lý chọn khoảng thời gian trên giao
// diện rồi bấm nút, gửi kèm ?from=YYYY-MM-DD&to=YYYY-MM-DD. Không còn chạy tự động theo lịch.
exports.analyzeCustomerOrderTrendsNow = onRequest(
  { region: "asia-southeast1", secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, cors: true },
  async (req, res) => {
    const fromDate = req.query.from;
    const toDate = req.query.to;
    if (!fromDate || !toDate) {
      res.status(400).json({ ok: false, error: "Thiếu tham số from/to (định dạng YYYY-MM-DD)." });
      return;
    }
    try {
      const result = await runCustomerOrderTrendAnalysis(fromDate, toDate);
      res.json(result);
    } catch (err) {
      console.error("analyzeCustomerOrderTrendsNow lỗi:", err);
      res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  }
);


// ---- AI phân tích chi tiết việc hoàn thành KPI (chạy mỗi thứ Hai hàng tuần) ----
// Đây là bản sao TỐI THIỂU của bộ máy tính điểm KPI trong index.html (DEFAULT_KPI_TEMPLATES,
// kpiCalcItemScore, kpiTotalPlan/Actual, kpiCtahCalc) — cố tình giữ giống hệt logic gốc để kết
// quả AI khớp đúng với những gì quản lý thấy trên giao diện. Nếu sau này sửa công thức tính điểm
// KPI trong index.html, PHẢI sửa lại y hệt ở đây.
const DEFAULT_KPI_TEMPLATES = {
  "NVBH": [
    { key:"khachhang", label:"Khách hàng", items:[
      { id:"kh_tongkh", label:"Tổng số khách hàng phục vụ trong tháng", tyTrong:0.3, diem:300, cachCham:"nguong60", donVi:"khách" },
    ]},
    { key:"donhang", label:"Đơn hàng bán", items:[
      { id:"dh_sodon", label:"Số đơn bán/tháng", tyTrong:0.2, diem:200, cachCham:"nguong60", donVi:"đơn" },
      { id:"dh_tbbill", label:"Giá trị trung bình bill", tyTrong:0.1, diem:100, cachCham:"nguong60", donVi:"đ" },
    ]},
    { key:"cskh", label:"Chăm sóc khách hàng", items:[
      { id:"cs_nangHang", label:"Tổng số khách hàng được nâng hạng trong tháng", tyTrong:0.2, diem:200, cachCham:"nguong60_max120", donVi:"khách" },
    ]},
    { key:"hanghoa", label:"Hàng hóa", items:[
      { id:"hh_thuongtruc", label:"Hàng thường trực (đăng ký tối thiểu 20% số mã có tại NT)", tyTrong:0.1, diem:100, cachCham:"ty_le_khong_nguong", donVi:"mã" },
      { id:"hh_candate", label:"Hàng cận date (≤6th ≤1,2% · ≤12th ≤8%)", tyTrong:0.1, diem:100, cachCham:"nhi_phan_kep",
        subKeys:["6th","12th"], subLabels:["Cận date ≤ 6 tháng (mục tiêu ≤ 1,2%)","Cận date ≤ 12 tháng (mục tiêu ≤ 8%)"], subThresholds:[1.2,8], donVi:"" },
    ]},
  ],
  "CHT": [
    { key:"nhansu", label:"Nhân sự", items:[
      { id:"ns_soluong", label:"Tổng số lượng nhân sự nhà thuốc phụ trách", tyTrong:0.15, diem:150, cachCham:"nhi_phan", donVi:"" },
      { id:"ns_level", label:"Level nhân sự", tyTrong:0.15, diem:150, cachCham:"nguong60", donVi:"" },
    ]},
    { key:"doanhso", label:"Doanh số", items:[
      { id:"ds_tong", label:"Doanh số tổng", tyTrong:0.15, diem:150, cachCham:"nguong60", donVi:"đ" },
      { id:"ds_hhs", label:"Doanh số hàng hệ số", tyTrong:0.15, diem:150, cachCham:"nguong60", donVi:"đ" },
      { id:"ds_tbbill", label:"Giá trị trung bình bill", tyTrong:0.1, diem:100, cachCham:"nguong60", donVi:"đ" },
      { id:"ds_cskh", label:"Chăm sóc khách hàng (nâng hạng)", tyTrong:0.1, diem:100, cachCham:"nguong60_max120", donVi:"khách" },
    ]},
    { key:"hanghoa", label:"Hàng hóa", items:[
      { id:"hh_thuongtruc", label:"Hàng thường trực (đăng ký tối thiểu 20% số mã có tại NT)", tyTrong:0.1, diem:100, cachCham:"ty_le_khong_nguong", donVi:"mã" },
      { id:"hh_candate", label:"Hàng cận date (≤6th ≤1,2% · ≤12th ≤8%)", tyTrong:0.1, diem:100, cachCham:"nhi_phan_kep",
        subKeys:["6th","12th"], subLabels:["Cận date ≤ 6 tháng (mục tiêu ≤ 1,2%)","Cận date ≤ 12 tháng (mục tiêu ≤ 8%)"], subThresholds:[1.2,8], donVi:"" },
    ]},
  ],
};

function kpiRoleKey(staffRole) { return staffRole === "Cửa hàng trưởng" ? "CHT" : "NVBH"; }

function kpiCalcItemScore(item, target, actual) {
  const diem = item.diem;
  if (item.cachCham === "nhi_phan") {
    return actual === "Đạt" ? diem : 0;
  }
  if (item.cachCham === "nhi_phan_kep") {
    const vals = Array.isArray(actual) ? actual : [];
    const thresholds = item.subThresholds || [];
    const allAnswered = vals.length > 0 && vals.length === thresholds.length && vals.every((v) => v != null && v !== "" && !isNaN(Number(v)));
    if (!allAnswered) return null;
    const allPass = vals.every((v, i) => Number(v) <= thresholds[i]);
    return allPass ? diem : 0;
  }
  if (item.cachCham === "ty_le_truc_tiep") {
    const pct = Number(actual) || 0;
    return Math.max(0, Math.min(1, pct / 100)) * diem;
  }
  if (item.cachCham === "ty_le_khong_nguong") {
    const t = Number(target) || 0, a = Number(actual);
    if (!t || actual === "" || actual == null || isNaN(a)) return null;
    return (a / t) * diem;
  }
  const t = Number(target) || 0, a = Number(actual);
  if (!t || actual === "" || actual == null || isNaN(a)) return null;
  let pct = a / t;
  if (pct < 0.6) return 0;
  if (item.cachCham === "nguong60_max120") pct = Math.min(pct, 1.2);
  return pct * diem;
}
function kpiTotalPlan(groups) { return groups.reduce((s, g) => s + g.items.reduce((s2, it) => s2 + it.diem, 0), 0); }
function kpiTotalActual(groups, targets, actuals) {
  let sum = 0, hasAny = false;
  groups.forEach((g) => g.items.forEach((it) => {
    const actualForCalc = it.cachCham === "nhi_phan_kep" ? it.subKeys.map((k) => actuals[it.id + "__" + k]) : actuals[it.id];
    const sc = kpiCalcItemScore(it, targets[it.id], actualForCalc);
    if (sc != null) { sum += sc; hasAny = true; }
  }));
  return hasAny ? sum : null;
}
function kpiCtahCalc(doc) {
  if (!doc) return { adj: 0, khongXet: false };
  let adj = 0, khongXet = false;
  if (doc.baiKiemTra != null && doc.baiKiemTra !== "") {
    const d = Number(doc.baiKiemTra);
    if (d < 60) adj -= 50; else if (d >= 99) adj += 50;
  }
  adj -= 20 * (Number(doc.hopNhomThieu) || 0);
  if (doc.rolePlay === "Không đạt") adj -= 50;
  if (doc.tuHocLoTrinh === "Không đạt") adj -= 50;
  adj -= 20 * (Number(doc.coachingThieu) || 0);
  ["dongPhucLan", "thaiDoLan", "bangGiaoCaLan", "veSinhLan", "kiemKeLan", "congViecKhacLan"].forEach((f) => {
    const n = Number(doc[f]) || 0;
    if (n === 1) adj -= 5; else if (n === 2) adj -= 10; else if (n >= 3) khongXet = true;
  });
  const cc = Number(doc.chuyenCanLan) || 0;
  if (cc === 2) adj -= 5; else if (cc === 3) adj -= 10; else if (cc >= 4) khongXet = true;
  if (doc.kiemKeGianLan) khongXet = true;
  return { adj, khongXet };
}
function kpiXepLoai(pct) { if (pct == null) return "—"; return pct >= 0.85 ? "Đạt thưởng" : "Chưa đạt"; }

async function getKpiTemplates() {
  try {
    const doc = await db.collection("opsConfig").doc("kpiTemplates").get();
    const loaded = doc.exists && doc.data().NVBH ? doc.data() : DEFAULT_KPI_TEMPLATES;
    return loaded;
  } catch (err) {
    console.error("Không đọc được kpiTemplates tuỳ chỉnh, dùng mặc định:", err.message || err);
    return DEFAULT_KPI_TEMPLATES;
  }
}

function currentMonthStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }

// Số ngày thực tế của một tháng "YYYY-MM" (vd tháng 2 là 28 hoặc 29 tuỳ năm).
function daysInMonthOf(thang) {
  const [y, m] = thang.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

// Với 1 nhân viên, liệt kê các chỉ tiêu CHƯA ĐẠT (điểm < tối đa) kèm mục tiêu/thực tế, để AI
// biết chính xác đang vướng ở đâu — không gửi toàn bộ chỉ tiêu đã đạt (không cần thiết, tốn prompt).
function buildStaffGapLines(groups, targets, actuals) {
  const lines = [];
  groups.forEach((g) => g.items.forEach((it) => {
    const actualForCalc = it.cachCham === "nhi_phan_kep" ? it.subKeys.map((k) => actuals[it.id + "__" + k]) : actuals[it.id];
    const sc = kpiCalcItemScore(it, targets[it.id], actualForCalc);
    if (sc == null) return; // chưa nhập dữ liệu — bỏ qua, không tính là "chưa đạt"
    if (sc >= it.diem) return; // đã đạt tối đa — không cần liệt kê
    const targetVal = targets[it.id];
    const actualVal = it.cachCham === "nhi_phan_kep" ? actualForCalc.join("/") : actualForCalc;
    lines.push(`${it.label} (mục tiêu ${targetVal != null ? targetVal : "?"}${it.donVi ? " " + it.donVi : ""}, thực tế ${actualVal != null && actualVal !== "" ? actualVal : "?"}, đạt ${Math.round((sc / it.diem) * 100)}%)`);
  }));
  return lines;
}

async function buildKpiAnalysisPromptText() {
  const thang = currentMonthStr();
  const today = new Date();
  const dayOfMonth = today.getDate();
  const totalDaysInMonth = daysInMonthOf(thang);
  const elapsedPct = Math.round((dayOfMonth / totalDaysInMonth) * 100);
  const [staffSnap, templates] = await Promise.all([
    db.collection("staff").where("role", "in", ["Nhân viên bán hàng", "Cửa hàng trưởng"]).get(),
    getKpiTemplates(),
  ]);
  const staffList = staffSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (staffList.length === 0) return null;

  const [assignSnap, ctahSnap] = await Promise.all([
    db.collection("kpiAssignments").get(),
    db.collection("kpiCTAH").get(),
  ]);
  const assignMap = {}; assignSnap.docs.forEach((d) => { if (d.id.endsWith("_" + thang)) assignMap[d.id] = d.data(); });
  const ctahMap = {}; ctahSnap.docs.forEach((d) => { if (d.id.endsWith("_" + thang)) ctahMap[d.id] = d.data(); });

  const lines = [];
  staffList.forEach((s) => {
    const roleKey = kpiRoleKey(s.role);
    const groups = templates[roleKey] || DEFAULT_KPI_TEMPLATES[roleKey];
    const a = assignMap[s.id + "_" + thang];
    const targets = (a && a.targets) || {};
    const actuals = (a && a.actuals) || {};
    if (Object.keys(targets).length === 0) return; // chưa giao KPI tháng này — bỏ qua

    const ctah = kpiCtahCalc(ctahMap[s.id + "_" + thang]);
    if (ctah.khongXet) {
      lines.push(`- ${s.name} (${s.shop}, ${s.role}): KHÔNG xét KPI tháng này (vi phạm tác phong/chuyên cần nhiều lần).`);
      return;
    }
    const totalPlan = kpiTotalPlan(groups);
    const totalActualBase = kpiTotalActual(groups, targets, actuals);
    if (totalActualBase == null) return; // chưa nhập kết quả nào — bỏ qua
    const totalActual = Math.max(0, totalActualBase + ctah.adj);
    const pct = totalActual / totalPlan;
    const gaps = buildStaffGapLines(groups, targets, actuals);
    let line = `- ${s.name} (${s.shop}, ${s.role}): đạt ${Math.round(pct * 100)}% (${kpiXepLoai(pct)})`;
    line += gaps.length ? ` — Chưa đạt: ${gaps.join("; ")}` : " — đã đạt hết các chỉ tiêu có dữ liệu.";
    lines.push(line);
  });

  if (lines.length === 0) return null;
  const header =
    `Hôm nay là ngày ${dayOfMonth}/${totalDaysInMonth} của tháng ${thang} (đã trôi qua khoảng ${elapsedPct}% thời gian của tháng). ` +
    `Số liệu dưới đây là kết quả LUỸ KẾ tính đến hôm nay, CHƯA PHẢI kết quả cuối tháng — khi đánh giá "chưa đạt", hãy so % đạt với ` +
    `${elapsedPct}% thời gian đã qua để nhận định đúng tiến độ (vd: đạt ${elapsedPct}% chỉ tiêu khi mới qua ${elapsedPct}% thời gian ` +
    `tháng là ĐANG ĐÚNG TIẾN ĐỘ, không phải đáng lo; chỉ thực sự đáng chú ý khi % đạt thấp hơn rõ rệt so với % thời gian đã qua).\n\n` +
    `Kết quả KPI tháng ${thang} của từng nhân viên (tính đến ngày ${dayOfMonth}/${totalDaysInMonth}):`;
  return { thang, dayOfMonth, totalDaysInMonth, elapsedPct, text: `${header}\n\n${lines.join("\n")}` };
}

const KPI_ANALYSIS_SYSTEM_PROMPT =
  "Bạn là trợ lý phân tích kết quả KPI hàng tháng của nhân viên/cửa hàng trưởng chuỗi nhà thuốc Upharma, " +
  "giúp quản lý khu vực nắm nhanh tình hình toàn khu vực thay vì đọc từng người. Luôn trả lời bằng tiếng Việt. " +
  "Không đưa ra bất kỳ thông tin nào ngoài dữ liệu được cung cấp — không suy đoán nguyên nhân cá nhân không có " +
  "trong dữ liệu.\n" +
  "QUAN TRỌNG VỀ THỜI ĐIỂM: dữ liệu là luỹ kế tính đến ngày hiện tại trong tháng, không phải kết quả cuối tháng. " +
  "Đề bài đã cho biết đã trôi qua bao nhiêu % thời gian của tháng — LUÔN đối chiếu % đạt của từng người/cả khu vực " +
  "với % thời gian đã qua đó để đánh giá đúng tiến độ, thay vì so trực tiếp với mốc 100% hay 85% (mốc 85% chỉ có " +
  "ý nghĩa vào cuối tháng). Người đạt % xấp xỉ hoặc cao hơn % thời gian đã qua là đang đúng tiến độ, không nêu là " +
  "đáng lo; chỉ nêu là cần chú ý khi % đạt thấp hơn rõ rệt so với % thời gian đã qua.\n" +
  "Viết theo cấu trúc:\n" +
  "1) \"Tổng quan\": nêu rõ mốc thời gian hiện tại (ngày bao nhiêu/tổng số ngày, đã qua bao nhiêu % tháng), rồi " +
  "nhận định chung xem toàn khu vực đang đúng tiến độ hay chậm so với mốc thời gian đó.\n" +
  "2) \"Chỉ tiêu hay bị hụt nhất\": các đầu mục KPI mà NHIỀU người cùng chưa đạt so với tiến độ thời gian (nêu tên " +
  "chỉ tiêu và số người), giúp thấy vấn đề chung của cả khu vực chứ không chỉ của riêng 1 người.\n" +
  "3) \"Cần chú ý\": liệt kê tối đa 5 người có kết quả thấp hơn rõ rệt so với tiến độ thời gian, hoặc không được " +
  "xét KPI, kèm lý do ngắn gọn.\n" +
  "4) \"Đề xuất\": 1-3 gợi ý hành động cụ thể cho quản lý khu vực.\n" +
  "Toàn bộ trả lời không quá khoảng 300 từ.";

async function runKpiAnalysis() {
  const built = await buildKpiAnalysisPromptText();
  if (!built) {
    console.log("analyzeKpiNow: chưa có dữ liệu KPI tháng này — bỏ qua.");
    return null;
  }
  const raw = await callClaude({ system: KPI_ANALYSIS_SYSTEM_PROMPT, content: built.text, maxTokens: 1200 });
  if (!raw) return null;
  await db.collection("opsConfig").doc("aiKpiAnalysis").set(
    {
      summary: raw.trim(),
      thang: built.thang,
      dayOfMonth: built.dayOfMonth,
      totalDaysInMonth: built.totalDaysInMonth,
      elapsedPct: built.elapsedPct,
      generatedAtTs: new Date(),
    },
    { merge: true }
  );
  return built;
}

// Gọi tay từ nút "Phân tích" trong tab KPI — không còn chạy tự động theo lịch cố định, quản lý
// bấm nút khi nào cần xem phân tích KPI tháng hiện tại.
exports.analyzeKpiNow = onRequest(
  { region: "asia-southeast1", secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, cors: true },
  async (req, res) => {
    try {
      const built = await runKpiAnalysis();
      if (!built) {
        res.json({ ok: false, reason: "Chưa có dữ liệu KPI tháng này." });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("analyzeKpiNow lỗi:", err);
      res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  }
);


/**
 * Quét TẤT CẢ đầu việc tới hạn:
 *  1) Checklist đào tạo của từng nhân viên mới (newHires + trainingProgress)
 *  2) Công việc chung được giao (collection "tasks" — giao riêng cho 1 nhân viên,
 *     hoặc giao chung cho cả shop)
 * rồi gộp theo từng người cần nhận, gửi 1 push notification tổng hợp qua FCM.
 */
async function runOverdueCheck() {
  const today = todayISO();
  const nowTs = `${today}T${nowHM()}`;

  const [cfgSnap, hiresSnap, progressSnap, tokensSnap, tasksSnap, staffSnap, ordersSnap] = await Promise.all([
    db.collection("opsConfig").doc("trainingChecklist").get(),
    db.collection("newHires").get(),
    db.collection("trainingProgress").get(),
    db.collection("fcmTokens").get(),
    db.collection("tasks").get(),
    db.collection("staff").get(),
    db.collection("customerOrders").get(),
  ]);

  const checklist =
    cfgSnap.exists && Array.isArray(cfgSnap.data().items) && cfgSnap.data().items.length
      ? cfgSnap.data().items
      : DEFAULT_CHECKLIST;

  const progressByHire = {};
  progressSnap.forEach((doc) => { progressByHire[doc.id] = (doc.data() || {}).done || {}; });

  const tokensByStaff = {};
  tokensSnap.forEach((doc) => { tokensByStaff[doc.id] = (doc.data() || {}).tokens || []; });

  const staffByShop = {}; // shop -> [staffId,...]
  staffSnap.forEach((doc) => {
    const s = doc.data();
    if (!s.shop) return;
    if (!staffByShop[s.shop]) staffByShop[s.shop] = [];
    staffByShop[s.shop].push(doc.id);
  });

  // staffId -> [{ label, kind: "training" | "task" }]
  const overdueByStaff = {};
  function pushOverdue(staffId, label) {
    if (!overdueByStaff[staffId]) overdueByStaff[staffId] = [];
    overdueByStaff[staffId].push(label);
  }

  // ---- 1) Checklist đào tạo ----
  hiresSnap.forEach((doc) => {
    const hire = doc.data();
    if (!hire.joinDate) return;
    const done = progressByHire[doc.id] || {};
    const overdueItems = checklist.filter(
      (t) => !(done[t.id] && done[t.id].hireDate) && addDays(hire.joinDate, t.offset) < today
    );
    if (overdueItems.length === 0) return;

    const recipients = new Set();
    if (hire.buddyId) recipients.add(hire.buddyId);
    if (hire.staffId) recipients.add(hire.staffId);
    recipients.forEach((staffId) =>
      pushOverdue(staffId, `[Đào tạo] ${hire.name || "Nhân viên mới"}: ${overdueItems.length} việc`)
    );
  });

  // ---- 2) Công việc chung (tasks) ----
  tasksSnap.forEach((doc) => {
    const t = doc.data();
    if (t.trangThai !== "Đang giao") return; // đã hoàn thành thì bỏ qua
    if (!t.deadline) return;
    if (deadlineTs(t) >= nowTs) return; // chưa quá hạn

    if (t.assignType === "staff" && t.staffId) {
      pushOverdue(t.staffId, `[Công việc] ${t.title || "Việc được giao"}`);
    } else if (t.assignType === "shop" && t.shop) {
      const staffIds = staffByShop[t.shop] || [];
      staffIds.forEach((staffId) =>
        pushOverdue(staffId, `[Công việc - ${t.shop}] ${t.title || "Việc được giao"}`)
      );
    } else if (t.assignType === "admin") {
      // Đề xuất nhân viên/CHT gửi lên Quản lý khu vực — Admin không nằm trong collection "staff"
      // nên phải gọi riêng bằng key cố định "admin".
      pushOverdue("admin", `[Đề xuất từ ${t.shop || "?"}] ${t.title || "Việc được giao"}`);
    }
  });

  // ---- 3) Khách hàng đặt hàng chờ (customerOrders) đã tới/quá ngày hẹn giao ----
  ordersSnap.forEach((doc) => {
    const o = doc.data();
    if (o.trangThai !== "Đang chờ") return; // đã báo khách hoặc khách không lấy nữa thì bỏ qua
    if (!o.ngayHen) return; // không hẹn ngày cụ thể (chỉ "báo khi có hàng") thì không tính quá hạn theo ngày
    if (o.ngayHen > today) return; // chưa tới hạn
    if (!o.shop) return;

    const staffIds = staffByShop[o.shop] || [];
    const label = `[Khách đặt hàng - ${o.shop}] ${o.customerName || "Khách"}: ${o.productName || "sản phẩm"}`;
    staffIds.forEach((staffId) => pushOverdue(staffId, label));
  });

  const messages = [];
  Object.keys(overdueByStaff).forEach((staffId) => {
    const tokens = tokensByStaff[staffId];
    if (!tokens || tokens.length === 0) return;

    const labels = overdueByStaff[staffId];
    const body = labels.slice(0, 5).join(" · ") + (labels.length > 5 ? ` · +${labels.length - 5} việc khác` : "");

    tokens.forEach((token) => {
      messages.push({
        token,
        notification: {
          title: `🔔 ${labels.length} đầu việc quá hạn`,
          body,
        },
        webpush: {
          notification: { icon: "/icon-192.png" },
          fcmOptions: { link: "/" },
        },
      });
    });
  });

  if (messages.length === 0) {
    console.log("Không có đầu việc nào quá hạn hôm nay — không gửi thông báo.");
    return { sent: 0, failed: 0 };
  }

  const result = await getMessaging().sendEach(messages);
  console.log(`Đã gửi ${result.successCount}/${messages.length} thông báo, lỗi ${result.failureCount}.`);
  result.responses.forEach((r, i) => {
    if (!r.success) console.error("Gửi lỗi cho token:", messages[i].token, r.error && r.error.message);
  });
  return { sent: result.successCount, failed: result.failureCount };
}

// Bỏ dấu tiếng Việt + viết thường + gọn khoảng trắng — dùng để khớp tên nhân viên giữa app
// và hệ thống upharma.com.vn (hiện chưa có mã liên kết trực tiếp giữa 2 hệ thống).
function normalizeName(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nhắc nhở "Checklist công việc hàng ngày" — CHỈ nhắc đúng nhân sự có đăng ký ca làm việc
 * hôm nay (lấy từ collection externalShiftWork, đã đồng bộ sẵn hàng ngày):
 *  - period="morning": nhắc nhân sự có ca kết thúc vào buổi sáng/đầu giờ chiều (trước 15h) — chạy lúc 14h30.
 *  - period="evening": nhắc nhân sự có ca kết thúc muộn hơn (từ 15h trở đi) — chạy lúc 21h30.
 * Người KHÔNG đăng ký ca hôm nay thì bỏ qua hoàn toàn — không nhắc, vì hôm đó không cần làm checklist.
 * Người đã nộp báo cáo rồi cũng bỏ qua, không nhắc lại.
 */
async function runDailyChecklistReminder(period) {
  const today = todayISO();

  const [staffSnap, reportsSnap, tokensSnap, shiftSnap] = await Promise.all([
    db.collection("staff").get(),
    db.collection("dailyReports").where("ngay", "==", today).get(),
    db.collection("fcmTokens").get(),
    db.collection("externalShiftWork").get(),
  ]);

  const submittedStaffIds = new Set();
  reportsSnap.forEach((doc) => {
    const r = doc.data();
    if (r.trangThai === "Đã nộp" && r.staffId) submittedStaffIds.add(r.staffId);
  });

  const tokensByStaff = {};
  tokensSnap.forEach((doc) => { tokensByStaff[doc.id] = (doc.data() || {}).tokens || []; });

  // Gom danh sách ca làm việc HÔM NAY theo tên đã chuẩn hoá — 1 người có thể có nhiều ca trong ngày.
  const todayShiftsByName = {};
  shiftSnap.forEach((doc) => {
    const r = doc.data();
    const workDate = (r.WorkDate || "").slice(0, 10);
    if (workDate !== today) return;
    const key = normalizeName(r.EmployeeName);
    if (!key) return;
    if (!todayShiftsByName[key]) todayShiftsByName[key] = [];
    todayShiftsByName[key].push(r);
  });

  function shiftPeriodOf(shift) {
    const endHour = Number((shift.TimeEnd || "").slice(11, 13));
    if (Number.isNaN(endHour)) return null;
    return endHour < 15 ? "morning" : "evening";
  }

  const messages = [];
  staffSnap.forEach((doc) => {
    const staffId = doc.id;
    if (submittedStaffIds.has(staffId)) return; // đã nộp rồi — bỏ qua

    const s = doc.data();
    const shifts = todayShiftsByName[normalizeName(s.name)] || [];
    if (shifts.length === 0) return; // không đăng ký ca hôm nay — không cần làm checklist, bỏ qua

    const matchesPeriod = shifts.some((sh) => shiftPeriodOf(sh) === period);
    if (!matchesPeriod) return; // có ca nhưng không thuộc khung giờ nhắc lần này

    const tokens = tokensByStaff[staffId];
    if (!tokens || tokens.length === 0) return; // chưa bật thông báo — không gửi được

    tokens.forEach((token) => {
      messages.push({
        token,
        notification: {
          title: "⏰ Nhắc nhở checklist công việc hôm nay",
          body: `${s.name || "Bạn"} ơi, bạn chưa nộp checklist công việc hàng ngày — nộp trước khi kết ca nhé!`,
        },
        webpush: {
          notification: { icon: "/icon-192.png" },
          fcmOptions: { link: "/" },
        },
      });
    });
  });

  if (messages.length === 0) {
    console.log(`Nhắc checklist (${period}): không có ai cần nhắc (chưa đăng ký ca đúng khung giờ, đã nộp rồi, hoặc chưa bật thông báo).`);
    return { sent: 0, failed: 0 };
  }

  const result = await getMessaging().sendEach(messages);
  console.log(`Nhắc checklist (${period}): đã gửi ${result.successCount}/${messages.length}, lỗi ${result.failureCount}.`);
  result.responses.forEach((r, i) => {
    if (!r.success) console.error("Gửi lỗi cho token:", messages[i].token, r.error && r.error.message);
  });
  return { sent: result.successCount, failed: result.failureCount };
}

// Chạy tự động mỗi ngày lúc 8:00 sáng (giờ Việt Nam)
exports.notifyOverdueTasks = onSchedule(
  { schedule: "0 8 * * *", timeZone: "Asia/Ho_Chi_Minh", region: "asia-southeast1" },
  async () => {
    await runOverdueCheck();
  }
);

// Endpoint gọi tay để test ngay lập tức, không cần chờ tới 8h sáng hôm sau.
// Sau khi deploy, mở URL này trên trình duyệt (đã đăng nhập app & bật thông báo trước đó) để thử.
exports.notifyOverdueTasksNow = onRequest(
  { region: "asia-southeast1" },
  async (req, res) => {
    const result = await runOverdueCheck();
    res.json(result);
  }
);

// Nhắc nộp checklist công việc hàng ngày — CHỈ nhắc đúng người có đăng ký ca hôm nay:
// 14h00 cho ca sáng (kết thúc trước 15h), 21h30 cho ca tối (kết thúc từ 15h trở đi).
exports.remindDailyChecklist2PM = onSchedule(
  { schedule: "0 14 * * *", timeZone: "Asia/Ho_Chi_Minh", region: "asia-southeast1" },
  async () => {
    await runDailyChecklistReminder("morning");
  }
);
exports.remindDailyChecklist930PM = onSchedule(
  { schedule: "30 21 * * *", timeZone: "Asia/Ho_Chi_Minh", region: "asia-southeast1" },
  async () => {
    await runDailyChecklistReminder("evening");
  }
);

// Endpoint gọi tay để test nhắc nhở checklist ngay lập tức, không cần chờ đúng 14h/21h30.
// Thêm ?period=morning hoặc ?period=evening vào URL để chọn nhóm cần test (mặc định morning).
exports.remindDailyChecklistNow = onRequest(
  { region: "asia-southeast1" },
  async (req, res) => {
    const period = req.query.period === "evening" ? "evening" : "morning";
    const result = await runDailyChecklistReminder(period);
    res.json({ period, ...result });
  }
);
