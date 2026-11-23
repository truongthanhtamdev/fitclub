# Đưa thiệp cưới Tùng & Lan lên VPS

Thiệp chạy bằng Node.js, không cần cài thêm thư viện. Danh sách khách lưu trong file `data/rsvps.json` trên VPS.

- Thiệp: `https://damcuoitungvalan.com/` (chưa có tên miền thì dùng địa chỉ miễn phí `IP.sslip.io` mà lệnh cài in ra)
- Trang quản trị: `https://damcuoitungvalan.com/quan-tri` (đăng nhập tên `admin` và mật khẩu bạn đặt)

Các lệnh dưới đây dành cho VPS Ubuntu, chạy với quyền root.

## 1. Trỏ tên miền về VPS

Trong trang quản lý tên miền, tạo 2 bản ghi **A**: `@` và `www`, cùng trỏ tới IP của VPS.

## 2. Cài Node.js và nginx

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs nginx certbot python3-certbot-nginx git
```

## 3. Tải thiệp về VPS

```bash
git clone -b claude/relaxed-ramanujan-pieevt https://github.com/truongthanhtamdev/fitclub.git /tmp/fitclub
mkdir -p /opt/thiep-cuoi && cp -r /tmp/fitclub/thiep-cuoi/. /opt/thiep-cuoi/
mkdir -p /opt/thiep-cuoi/data && chown -R www-data:www-data /opt/thiep-cuoi/data
```

## 4. Đặt mật khẩu quản trị

Thay `MAT-KHAU-CUA-BAN` bằng mật khẩu của bạn, ít nhất 8 ký tự:

```bash
echo 'ADMIN_PASSWORD=MAT-KHAU-CUA-BAN' > /opt/thiep-cuoi/.env && chmod 600 /opt/thiep-cuoi/.env
```

## 5. Chạy thiệp như một dịch vụ (tự khởi động lại khi VPS khởi động)

```bash
cp /opt/thiep-cuoi/thiep-cuoi.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now thiep-cuoi
```

## 6. Gắn tên miền và bật HTTPS

```bash
cp /opt/thiep-cuoi/nginx-damcuoitungvalan.conf /etc/nginx/sites-available/damcuoitungvalan
ln -sf /etc/nginx/sites-available/damcuoitungvalan /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

```bash
certbot --nginx -d damcuoitungvalan.com -d www.damcuoitungvalan.com
```

## Ảnh cưới

Chép ảnh vào `/opt/thiep-cuoi/` với tên `anh-1.jpg`, `anh-2.jpg`, `anh-3.jpg`, `anh-4.jpg`. Ảnh hiện trong mục "Khoảnh Khắc" ngay, không cần khởi động lại.

## Sao lưu danh sách khách

Danh sách nằm ở `/opt/thiep-cuoi/data/rsvps.json`. Bạn cũng tải được bản Excel (CSV) bằng nút "Tải file Excel" trong trang quản trị.

## Khi có lỗi

```bash
journalctl -u thiep-cuoi -n 50
```
