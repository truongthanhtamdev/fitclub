// POST /api/rsvp — khách gửi xác nhận tham dự
"use strict";
const crypto = require("node:crypto");
const L = require("./_lib");

module.exports = async (req, res) => {
  if (req.method !== "POST") return L.send(res, 405, { error: "Chỉ nhận POST." }, { Allow: "POST" });
  try {
    // Tối đa 10 lần gửi mỗi giờ cho một IP
    const rl = "tunglan:rl:" + L.clientIp(req);
    const n = await L.redis("INCR", rl);
    if (n === 1) await L.redis("EXPIRE", rl, 3600);
    if (n > 10) return L.send(res, 429, { error: "Bạn gửi hơi nhiều lần, thử lại sau ít phút nhé." });

    let body;
    try { body = await L.readJson(req); } catch (e) { return L.send(res, 400, { error: "Dữ liệu gửi lên chưa đúng." }); }
    const v = L.validate(body || {});
    if (v.error) return L.send(res, 400, { error: v.error });

    const now = new Date().toISOString();
    const phone = L.normPhone(v.value.phone);
    // Cùng số điện thoại thì cập nhật dòng cũ (khách sửa thông tin)
    const existingId = await L.redis("HGET", L.PHONE_KEY, phone);
    const existing = existingId ? await L.get(existingId) : null;
    const rec = existing
      ? { ...existing, ...v.value, updatedAt: now }
      : { id: crypto.randomUUID(), ...v.value, delivered: false, note: "", createdAt: now, updatedAt: now };
    await L.put(rec);
    if (!existing) await L.redis("HSET", L.PHONE_KEY, phone, rec.id);
    return L.send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return L.send(res, e.status || 500, { error: "Chưa lưu được, bạn thử lại sau nhé." });
  }
};
