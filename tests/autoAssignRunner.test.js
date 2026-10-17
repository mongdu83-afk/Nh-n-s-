// Kiểm thử "AI tự giao việc" — phần chạy (runAutoAssign): khoá khung giờ, chạy lại khi lỗi, dừng khi thiếu dữ liệu (rà soát P0 17/10/2026).
// Chạy: node --test tests/autoAssignRunner.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HTML = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const block = (n) => { const a = HTML.indexOf(`\n// ${n}-ENGINE-BEGIN\n`), b = HTML.indexOf(`\n// ${n}-ENGINE-END`); assert.ok(a > 0 && b > a, n); return HTML.slice(a, b); };
const i = HTML.indexOf("// AA-ENGINE-END"), j = HTML.indexOf("function AutoAssignRunner(", i);
const runnerSrc = HTML.slice(i, j).replace("// AA-ENGINE-END", "");
const ci = HTML.indexOf("\nconst DEFAULT_DAILY_CHECKLISTS "), constSrc = HTML.slice(ci, HTML.indexOf("\n};", ci) + 3);

// Firestore giả: đủ cho các truy vấn của runAutoAssign. fail = tên collection đọc bị lỗi.
function fakeDb({ log, fail = [] }){
  const store = { opsConfig:{ autoAssignLog: log || null } }, writes = [];
  const col = (name) => {
    const q = { where:() => q, orderBy:() => q, limit:() => q,
      get: async () => { if(fail.includes(name)) throw new Error("permission-denied"); return { docs:[] }; },
      doc: (id) => ({ id,
        get: async () => { if(fail.includes(name + "/" + id)) throw new Error("x"); const v = (store[name]||{})[id]; return { exists: v != null, data: () => v }; },
        set: async (data) => { writes.push({ name, id, data }); store[name] = store[name] || {}; store[name][id] = { ...(store[name][id]||{}), ...data }; },
        collection: (c) => col(name + "/" + id + "/" + c) }) };
    return q;
  };
  const db = { collection: col, runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, data) => { r.set(data); } }) };
  return { db, store, writes };
}
function load(f){
  const ctx = vm.createContext({ db:f.db, console:{ log(){}, warn(){}, error(){} }, todayISO:() => "2026-10-17", nowHM:() => "09:20",
    addDays:(iso, n) => { const [y,m,d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m-1, d+n)).toISOString().slice(0,10); },
    auth:{ currentUser:null }, firebase:{ firestore:{ FieldValue:{ serverTimestamp:() => "ts" } } }, logSystemError(){},
    isStaffResigned:() => false, DEFAULT_SHOPS:["SHOP0059"], shopLabel:(c) => c,
    addDoc: async () => ({ id:"t1" }), logIssueHistory: async () => {} });
  vm.runInContext([constSrc, ...["RVD","KBP","PMD","CLQ","NS","AA"].map(block), runnerSrc, ";globalThis.__run = runAutoAssign;"].join("\n"), ctx);
  return ctx.__run;
}

test("Khung đã chạy XONG → không chạy lại", async () => {
  const f = fakeDb({ log:{ lastRunSlot:"2026-10-17-AM", lastStatus:"done" } });
  const r = await load(f)({ slot:"2026-10-17-AM", source:"server" });
  assert.equal(r.skippedRun, true);
});

test("Bản ghi cũ chưa có trạng thái (trước 17/10) vẫn coi là đã chạy", async () => {
  const f = fakeDb({ log:{ lastRunSlot:"2026-10-17-AM" } });
  assert.equal((await load(f)({ slot:"2026-10-17-AM", source:"server" })).skippedRun, true);
});

test("Khung trước bị LỖI → lần sau chạy lại và ghi done", async () => {
  const f = fakeDb({ log:{ lastRunSlot:"2026-10-17-AM", lastStatus:"failed" } });
  const r = await load(f)({ slot:"2026-10-17-AM", source:"server" });
  assert.notEqual(r.skippedRun, true);
  assert.equal(f.store.opsConfig.autoAssignLog.lastStatus, "done");
});

test("Đang chạy (< 15 phút) → không chạy song song; treo quá 15 phút → chạy lại", async () => {
  const now = new Date().toISOString(), old = new Date(Date.now() - 20*60*1000).toISOString();
  assert.equal((await load(fakeDb({ log:{ lastRunSlot:"2026-10-17-AM", lastStatus:"running", runningAt:now } }))({ slot:"2026-10-17-AM", source:"server" })).skippedRun, true);
  assert.notEqual((await load(fakeDb({ log:{ lastRunSlot:"2026-10-17-AM", lastStatus:"running", runningAt:old } }))({ slot:"2026-10-17-AM", source:"server" })).skippedRun, true);
});

test("Không đọc được dữ liệu bắt buộc → DỪNG, không giao việc, ghi failed", async () => {
  const f = fakeDb({ fail:["staff"] });
  await assert.rejects(load(f)({ slot:"2026-10-17-AM", source:"server" }), /dữ liệu bắt buộc: staff/);
  assert.equal(f.store.opsConfig.autoAssignLog.lastStatus, "failed");
  assert.ok(!f.writes.some(w => w.name === "tasks"));
});
