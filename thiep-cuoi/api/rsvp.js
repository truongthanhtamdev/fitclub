// POST /api/rsvp — khách gửi xác nhận tham dự
"use strict";
const crypto = require("node:crypto");
const L = require("./_lib");

// Giới hạn số lần gửi (trong bộ nhớ của từng máy chủ): tối đa 10 lần mỗi giờ cho một IP
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter(t => now - t < 3600_000);
  list.push(now); hits.set(ip, list);
  return list.length > 10;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return L.send(res, 405, { error: "Chỉ nhận POST." }, { Allow: "POST" });
  try {
    if (limited(L.clientIp(req))) return L.send(res, 429, { error: "Bạn gửi hơi nhiều lần, thử lại sau ít phút nhé." });
    let body;
    try { body = await L.readJson(req); } catch (e) { return L.send(res, 400, { error: "Dữ liệu gửi lên chưa đúng." }); }
    const v = L.validate(body || {});
    if (v.error) return L.send(res, 400, { error: v.error });

    const now = new Date().toISOString();
    // Cùng số điện thoại thì cập nhật dòng cũ (khách sửa thông tin)
    const phone = L.normPhone(v.value.phone);
    const existing = (await L.all()).find(r => L.normPhone(r.phone) === phone);
    const rec = existing
      ? { ...existing, ...v.value, updatedAt: now }
      : { id: crypto.randomUUID(), ...v.value, delivered: false, note: "", createdAt: now, updatedAt: now };
    await L.put(rec);
    return L.send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return L.send(res, e.status || 500, { error: "Chưa lưu được, bạn thử lại sau nhé." });
  }
};
