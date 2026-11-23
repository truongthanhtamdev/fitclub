/**
 * Lưu xác nhận tham dự từ thiệp cưới vào Google Sheet.
 *
 * Cách cài (khoảng 5 phút):
 * 1. Tạo một Google Sheet mới, đặt tên "Khách mời đám cưới Tùng & Lan".
 * 2. Trong Sheet: Tiện ích mở rộng (Extensions) > Apps Script.
 * 3. Xóa hết nội dung có sẵn, dán toàn bộ file này vào, bấm Lưu.
 * 4. Bấm Triển khai (Deploy) > Tùy chọn triển khai mới (New deployment)
 *    > chọn loại "Ứng dụng web" (Web app):
 *      - Thực thi với tư cách (Execute as): Tôi (Me)
 *      - Người có quyền truy cập (Who has access): Bất kỳ ai (Anyone)
 *    > Triển khai > cấp quyền cho tài khoản Google của bạn.
 * 5. Sao chép "URL ứng dụng web" (dạng https://script.google.com/macros/s/.../exec)
 *    và dán vào SHEET_URL trong thiep-cuoi/index.html.
 */
const SHEET_NAME = 'Khách mời';
const HEADERS = ['Thời gian', 'Tham dự', 'Họ và tên', 'Số điện thoại', 'Địa chỉ nhận thiệp', 'Số người', 'Link khách'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    const p = (e && e.parameter) || {};
    const attend = p.attend === 'yes';
    sheet.appendRow([
      new Date(),
      attend ? 'Chắc chắn đến' : 'Cố gắng sắp xếp',
      clean(p.name, 80),
      "'" + clean(p.phone, 20), // giữ số 0 ở đầu
      clean(p.address, 200),
      Math.min(20, Math.max(1, Number(p.count) || 1)),
      clean(p.link, 60),
    ]);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// Mở link Web App trên trình duyệt sẽ thấy dòng này, nghĩa là đã cài đúng.
function doGet() {
  return ContentService.createTextOutput('Đã kết nối thiệp cưới Tùng & Lan.');
}

// Cắt độ dài và chặn nội dung bị Sheet hiểu thành công thức.
function clean(v, max) {
  let s = String(v || '').trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
