// KIỂM TRA BẢN PHÁT HÀNH — chạy mỗi khi main thay đổi (.github/workflows/release-check.yml).
// 17/10/2026 (rà soát P0): bản index.html CŨ trên máy từng được tải lên đè mất tính năng đã gộp, và làm hỏng lịch AI tự giao việc.
// Phát hiện: (1) thiếu khối *-ENGINE mà máy chủ cần, (2) lỗi cú pháp, (3) số build lùi lại, (4) mất chức năng so với bản trước.
// Dùng: node scripts/check-release.js [đường dẫn index.html bản trước]
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const cur = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const prevPath = process.argv[2];
const prev = prevPath && fs.existsSync(prevPath) ? fs.readFileSync(prevPath, "utf8") : null;
const errors = [], notes = [];

for(const n of ["RVD","KBP","PMD","CLQ","NS","IP","AM","AA","TOP5","AIEXEC","ISSUEHUB"]){
  const a = cur.indexOf(`\n// ${n}-ENGINE-BEGIN\n`), b = cur.indexOf(`\n// ${n}-ENGINE-END`);
  if(prev && prev.includes(`// ${n}-ENGINE-BEGIN`) && !(a > 0 && b > a)) errors.push(`Thiếu khối ${n}-ENGINE (máy chủ AI tự giao việc cần khối này)`);
}

// cú pháp khối script chính (khối <script> dài nhất)
const scripts = [...cur.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((x, y) => y.length - x.length);
try{ new vm.Script(scripts[0] || "", { filename:"index.html#main" }); }catch(e){ errors.push("Lỗi cú pháp trong app: " + e.message); }

const build = (t) => { const m = /window\.__APP_BUILD = "([^"]+)"/.exec(t || ""); return m ? m[1] : null; };
const funcs = (t) => new Set([...t.matchAll(/\nfunction ([A-Za-z0-9_$]+)\s*\(/g)].map(m => m[1]));
if(prev){
  const bc = build(cur), bp = build(prev);
  if(bc && bp && bc < bp) errors.push(`Số build LÙI từ ${bp} về ${bc} — có thể vừa tải lên bản index.html cũ`);
  if(bc && bp && bc === bp && cur !== prev) notes.push(`index.html thay đổi nhưng số build vẫn ${bc} — máy nhân viên có thể không tự cập nhật`);
  const fp = funcs(prev), fc = funcs(cur), lost = [...fp].filter(f => !fc.has(f));
  if(lost.length >= 3) errors.push(`Mất ${lost.length} chức năng so với bản trước (VD: ${lost.slice(0, 8).join(", ")}) — nhiều khả năng tải lên bản cũ. Nếu cố ý xoá thì bỏ qua cảnh báo này.`);
  else if(lost.length) notes.push(`Bỏ ${lost.length} hàm so với bản trước: ${lost.join(", ")}`);
}

notes.forEach(n => console.log("Lưu ý: " + n));
if(errors.length){ errors.forEach(e => console.error("LỖI: " + e)); fs.writeFileSync(path.join(__dirname, "..", ".release-check-errors.txt"), errors.join("\n")); process.exit(1); }
console.log("Bản phát hành OK" + (build(cur) ? " (build " + build(cur) + ")" : ""));
