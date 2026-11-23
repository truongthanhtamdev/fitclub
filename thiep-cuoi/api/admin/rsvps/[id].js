// PATCH/DELETE /api/admin/rsvps/:id — đánh dấu đã gửi thiệp, ghi chú, xóa (cần đăng nhập)
"use strict";
const L = require("../../_lib");

module.exports = async (req, res) => {
  if (L.requireAdmin(req, res)) return;
  const id = String(req.query.id || "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return L.send(res, 400, { error: "Mã khách không đúng." });
  try {
    const r = await L.get(id);
    if (!r) return L.send(res, 404, { error: "Không tìm thấy khách này." });
    if (req.method === "DELETE") {
      await L.remove(id);
      return L.send(res, 200, { ok: true });
    }
    if (req.method === "PATCH") {
      let b; try { b = await L.readJson(req); } catch (e) { return L.send(res, 400, { error: "Dữ liệu chưa đúng." }); }
      if (typeof b.delivered === "boolean") r.delivered = b.delivered;
      if (typeof b.note === "string") r.note = L.clean(b.note, 300);
      await L.put(r);
      return L.send(res, 200, r);
    }
    return L.send(res, 405, { error: "Không hỗ trợ." });
  } catch (e) { console.error(e); return L.send(res, e.status || 500, { error: e.message }); }
};
