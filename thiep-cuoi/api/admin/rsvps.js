// GET /api/admin/rsvps — danh sách khách (cần đăng nhập)
"use strict";
const L = require("../_lib");

module.exports = async (req, res) => {
  if (L.requireAdmin(req, res)) return;
  if (req.method !== "GET") return L.send(res, 405, { error: "Chỉ nhận GET." });
  try { return L.send(res, 200, await L.all()); }
  catch (e) { console.error(e); return L.send(res, e.status || 500, { error: e.message }); }
};
