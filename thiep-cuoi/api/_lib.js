// Dùng chung cho các hàm API trên Vercel. Danh sách khách lưu trong Vercel Blob
// ở chế độ riêng tư (biến BLOB_READ_WRITE_TOKEN do Vercel tự thêm khi nối kho vào project).
"use strict";
const crypto = require("node:crypto");
const blob = require("@vercel/blob");

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const PREFIX = "rsvps/";

function requireStore() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw Object.assign(new Error("Chưa kết nối kho dữ liệu."), { status: 503 });
}
async function readBlob(pathname) {
  const r = await blob.get(pathname, { access: "private", useCache: false });
  if (!r || !r.stream) return null;
  const text = await new Response(r.stream).text();
  return JSON.parse(text);
}
async function all() {
  requireStore();
  const out = []; let cursor;
  do {
    const page = await blob.list({ prefix: PREFIX, cursor, limit: 1000 });
    const rows = await Promise.all(page.blobs.map(b => readBlob(b.pathname).catch(() => null)));
    out.push(...rows.filter(Boolean));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}
async function get(id) {
  requireStore();
  try { return await readBlob(PREFIX + id + ".json"); }
  catch (e) { if (e instanceof blob.BlobNotFoundError) return null; throw e; }
}
async function put(r) {
  requireStore();
  await blob.put(PREFIX + r.id + ".json", JSON.stringify(r), {
    access: "private", addRandomSuffix: false, allowOverwrite: true,
    contentType: "application/json", cacheControlMaxAge: 60,
  });
}
async function remove(id) {
  requireStore();
  await blob.del(PREFIX + id + ".json");
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
function isAdmin(req) {
  if (ADMIN_PASSWORD.length < 8) return false;
  const h = String(req.headers.authorization || "");
  if (!h.startsWith("Basic ")) return false;
  const [user, ...rest] = Buffer.from(h.slice(6), "base64").toString("utf8").split(":");
  const okUser = safeEqual(user, ADMIN_USER), okPass = safeEqual(rest.join(":"), ADMIN_PASSWORD);
  return okUser && okPass;
}
// Trả về true nếu đã chặn (chưa đăng nhập)
function requireAdmin(req, res) {
  if (ADMIN_PASSWORD.length < 8) { send(res, 503, { error: "Chưa đặt ADMIN_PASSWORD trong Vercel." }); return true; }
  if (!isAdmin(req)) { send(res, 401, { error: "Sai tên đăng nhập hoặc mật khẩu." }); return true; }
  return false;
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 10_000) throw new Error("too large"); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const normPhone = p => String(p).replace(/[^0-9+]/g, "");

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
  return { value: r };
}

function csv(rows) {
  const esc = v => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Thời gian", "Tham dự", "Họ và tên", "Số điện thoại", "Địa chỉ nhận thiệp", "Số người", "Mời với tên", "Đã gửi thiệp", "Ghi chú"];
  const lines = rows
    .sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))
    .map(r => [
      new Date(r.updatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
      r.attend === "yes" ? "Chắc chắn đến" : "Cố gắng sắp xếp",
      r.name, r.phone, r.address, r.count, r.invitedAs, r.delivered ? "Rồi" : "Chưa", r.note,
    ].map(esc).join(","));
  return "﻿" + [head.join(","), ...lines].join("\r\n");
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
}

module.exports = { all, get, put, remove, send, requireAdmin, readJson, validate, normPhone, clean, csv, clientIp };
