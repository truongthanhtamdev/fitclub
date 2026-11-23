// GET /api/admin/export.csv — tải danh sách dạng Excel (CSV) (cần đăng nhập)
"use strict";
const L = require("../_lib");

module.exports = async (req, res) => {
  if (L.requireAdmin(req, res)) return;
  try {
    const body = L.csv(await L.all());
    return L.send(res, 200, body, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="khach-moi-tung-lan.csv"',
    });
  } catch (e) { console.error(e); return L.send(res, e.status || 500, { error: e.message }); }
};
