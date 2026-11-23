// Dùng chung cho các hàm API trên Vercel. Dữ liệu lưu ở Upstash Redis
// (Vercel > Storage > Upstash for Redis tự thêm biến môi trường KV_REST_API_URL, KV_REST_API_TOKEN).
"use strict";
const crypto = require("node:crypto");

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const KEY = "tunglan:rsvps";        // hash: id -> JSON khách
const PHONE_KEY = "tunglan:phones"; // hash: số điện thoại -> id

async function redis(...cmd) {
  if (!REDIS_URL || !REDIS_TOKEN) throw Object.assign(new Error("Chưa kết nối kho dữ liệu (Upstash Redis)."), { status: 503 });
  const res = await fetch(REDIS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error || `Redis ${res.status}`);
  return j.result;
}

async function all() {
  const flat = (await redis("HGETALL", KEY)) || [];
  const out = [];
  for (let i = 1; i < flat.length; i += 2) { try { out.push(JSON.parse(flat[i])); } catch (e) {} }
  return out;
}
const get = async id => { const v = await redis("HGET", KEY, id); return v ? JSON.parse(v) : null; };
const put = r => redis("HSET", KEY, r.id, JSON.stringify(r));

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
  if (!/^[0-9+ .()-]{8,20}$/.test(r.phone) || normPhone(r.phone).length < 8) return { error: "Số điện thoại chưa đúng, bạn kiểm tra lại giúp mình." };
  if (!r.address) return { error: "Bạn điền địa chỉ để Tùng & Lan gửi thiệp tận tay nhé." };
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

module.exports = { redis, all, get, put, send, requireAdmin, readJson, validate, normPhone, clean, csv, clientIp, KEY, PHONE_KEY };
