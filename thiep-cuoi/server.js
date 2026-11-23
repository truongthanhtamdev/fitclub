// Server thiệp cưới Tùng & Lan: phục vụ thiệp, nhận xác nhận tham dự, trang quản trị.
// Không cần cài thư viện, chỉ cần Node.js 18 trở lên.
//
//   ADMIN_PASSWORD=matkhau node server.js
//
// Biến môi trường:
//   ADMIN_PASSWORD  (bắt buộc) mật khẩu trang quản trị
//   ADMIN_USER      tên đăng nhập quản trị, mặc định "admin"
//   PORT            cổng, mặc định 3000
//   HOST            địa chỉ lắng nghe, mặc định 127.0.0.1 (đặt sau nginx)
//   DATA_DIR        thư mục lưu dữ liệu, mặc định ./data
//   TRUST_PROXY     đặt 1 khi chạy sau nginx để lấy đúng IP khách

"use strict";
const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, "data"));
const DATA_FILE = path.join(DATA_DIR, "rsvps.json");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";

if (ADMIN_PASSWORD.length < 8) {
  console.error("Cần đặt ADMIN_PASSWORD (ít nhất 8 ký tự). Ví dụ: ADMIN_PASSWORD=matkhau-cua-ban node server.js");
  process.exit(1);
}

// ---------- Lưu trữ: một file JSON, ghi an toàn (file tạm rồi đổi tên) ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
let rsvps = [];
try { rsvps = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch (e) { if (e.code !== "ENOENT") throw e; }
let writing = Promise.resolve();
function save() {
  writing = writing.then(async () => {
    const tmp = DATA_FILE + ".tmp";
    await fsp.writeFile(tmp, JSON.stringify(rsvps, null, 2));
    await fsp.rename(tmp, DATA_FILE);
  }).catch(err => console.error("Lỗi ghi dữ liệu:", err));
  return writing;
}

// ---------- Tiện ích ----------
const STATIC = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/couple.webp": ["couple.webp", "image/webp"],
  "/floral.webp": ["floral.webp", "image/webp"],
  "/preview.jpg": ["preview.jpg", "image/jpeg"],
};
for (let i = 1; i <= 12; i++) STATIC[`/anh-${i}.jpg`] = [`anh-${i}.jpg`, "image/jpeg"];

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
};

function send(res, status, body, type = "application/json; charset=utf-8", extra = {}) {
  res.writeHead(status, { "Content-Type": type, ...SECURITY_HEADERS, ...extra });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function clientIp(req) {
  if (TRUST_PROXY) {
    const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || "";
}

function readBody(req, limit = 10_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error("too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function isAdmin(req) {
  const h = String(req.headers.authorization || "");
  if (!h.startsWith("Basic ")) return false;
  const [user, ...rest] = Buffer.from(h.slice(6), "base64").toString("utf8").split(":");
  return safeEqual(user, ADMIN_USER) & safeEqual(rest.join(":"), ADMIN_PASSWORD) ? true : false;
}

// Giới hạn số lần gửi: tối đa 10 lần mỗi giờ cho một IP.
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), windowMs = 3600_000;
  const list = (hits.get(ip) || []).filter(t => now - t < windowMs);
  list.push(now); hits.set(ip, list);
  return list.length > 10;
}
setInterval(() => { const now = Date.now(); for (const [ip, l] of hits) if (l.every(t => now - t > 3600_000)) hits.delete(ip); }, 600_000).unref();

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const normPhone = p => p.replace(/[^0-9+]/g, "");

function validate(b) {
  const r = {
    attend: b.attend === "yes" ? "yes" : "maybe",
    name: clean(b.name, 80),
    phone: clean(b.phone, 20),
    address: clean(b.address, 200),
    count: Math.min(20, Math.max(1, parseInt(b.count, 10) || 1)),
    invitedAs: clean(b.invitedAs, 60),
  };
  if (!r.name) return { error: "Bạn điền họ và tên giúp mình nhé." };
  if (!/^[0-9+ .()-]{8,20}$/.test(r.phone) || normPhone(r.phone).length < 8) return { error: "Số điện thoại chưa đúng, bạn kiểm tra lại giúp mình." };
  if (!r.address) return { error: "Bạn điền địa chỉ để Tùng & Lan gửi thiệp tận tay nhé." };
  return { value: r };
}

function csv(rows) {
  const esc = v => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s; // tránh Excel hiểu thành công thức
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Thời gian", "Tham dự", "Họ và tên", "Số điện thoại", "Địa chỉ nhận thiệp", "Số người", "Mời với tên", "Đã gửi thiệp", "Ghi chú"];
  const lines = rows.map(r => [
    new Date(r.updatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
    r.attend === "yes" ? "Chắc chắn đến" : "Cố gắng sắp xếp",
    r.name, r.phone, r.address, r.count, r.invitedAs, r.delivered ? "Rồi" : "Chưa", r.note,
  ].map(esc).join(","));
  return "﻿" + [head.join(","), ...lines].join("\r\n");
}

// ---------- Định tuyến ----------
async function handle(req, res) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname.replace(/\/+$/, "") || "/";

  // Khách gửi xác nhận
  if (p === "/api/rsvp" && req.method === "POST") {
    if (rateLimited(clientIp(req))) return send(res, 429, { error: "Bạn gửi hơi nhiều lần, thử lại sau ít phút nhé." });
    let body;
    try { body = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: "Dữ liệu gửi lên chưa đúng." }); }
    const v = validate(body || {});
    if (v.error) return send(res, 400, { error: v.error });
    const now = new Date().toISOString();
    // Cùng số điện thoại thì cập nhật dòng cũ (khách sửa thông tin), không tạo dòng mới.
    const existing = rsvps.find(r => normPhone(r.phone) === normPhone(v.value.phone));
    if (existing) Object.assign(existing, v.value, { updatedAt: now });
    else rsvps.push({ id: crypto.randomUUID(), ...v.value, delivered: false, note: "", createdAt: now, updatedAt: now });
    await save();
    return send(res, 200, { ok: true });
  }

  // Trang quản trị (tự có form đăng nhập) và API quản trị (cần đăng nhập)
  if (p === "/quan-tri" && req.method === "GET") {
    return send(res, 200, await fsp.readFile(path.join(ROOT, "admin.html")), "text/html; charset=utf-8",
      { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  }
  if (p.startsWith("/api/admin")) {
    if (!isAdmin(req)) return send(res, 401, { error: "Sai tên đăng nhập hoặc mật khẩu." });
    const noStore = { "Cache-Control": "no-store" };
    if (p === "/api/admin/rsvps" && req.method === "GET") return send(res, 200, rsvps, undefined, noStore);
    if (p === "/api/admin/export.csv" && req.method === "GET") {
      return send(res, 200, csv(rsvps), "text/csv; charset=utf-8",
        { ...noStore, "Content-Disposition": 'attachment; filename="khach-moi-tung-lan.csv"' });
    }
    const m = p.match(/^\/api\/admin\/rsvps\/([0-9a-f-]{36})$/);
    if (m) {
      const idx = rsvps.findIndex(r => r.id === m[1]);
      if (idx < 0) return send(res, 404, { error: "Không tìm thấy khách này." });
      if (req.method === "DELETE") { rsvps.splice(idx, 1); await save(); return send(res, 200, { ok: true }); }
      if (req.method === "PATCH") {
        let b; try { b = JSON.parse(await readBody(req)); } catch (e) { return send(res, 400, { error: "Dữ liệu chưa đúng." }); }
        const r = rsvps[idx];
        if (typeof b.delivered === "boolean") r.delivered = b.delivered;
        if (typeof b.note === "string") r.note = clean(b.note, 300);
        await save();
        return send(res, 200, r);
      }
    }
    return send(res, 404, { error: "Không có trang này." });
  }

  // File tĩnh của thiệp
  if (req.method === "GET" || req.method === "HEAD") {
    const f = STATIC[p];
    if (f) {
      try {
        let data = await fsp.readFile(path.join(ROOT, f[0]));
        if (f[0] === "index.html") {
          // Ảnh xem trước khi gửi link qua Zalo/Messenger lấy theo địa chỉ đang chạy
          const host = String(req.headers.host || "").replace(/[^a-zA-Z0-9.:-]/g, "");
          const proto = TRUST_PROXY && req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
          if (host) data = Buffer.from(data.toString("utf8").replace("https://damcuoitungvalan.com/preview.jpg", `${proto}://${host}/preview.jpg`));
        }
        const cache = f[0].endsWith(".html") ? "no-cache" : "public, max-age=86400";
        return send(res, 200, req.method === "HEAD" ? "" : data, f[1], { "Cache-Control": cache });
      } catch (e) { /* ảnh chưa có thì trả 404 */ }
    }
  }
  return send(res, 404, "Không tìm thấy trang", "text/plain; charset=utf-8");
}

http.createServer((req, res) => {
  handle(req, res).catch(err => {
    console.error(err);
    if (!res.headersSent) send(res, err.status || 500, { error: "Có lỗi, thử lại sau nhé." });
  });
}).listen(PORT, HOST, () => {
  console.log(`Thiệp cưới chạy tại http://${HOST}:${PORT}  ·  Quản trị: /quan-tri  ·  Dữ liệu: ${DATA_FILE}`);
});
