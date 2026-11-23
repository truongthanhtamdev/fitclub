#!/usr/bin/env bash
# Cài (hoặc cập nhật) thiệp cưới Tùng & Lan trên VPS Ubuntu/Debian.
# Chạy với quyền root:
#   curl -fsSL https://raw.githubusercontent.com/truongthanhtamdev/fitclub/claude/relaxed-ramanujan-pieevt/thiep-cuoi/install.sh | sudo bash
# Chạy lại lệnh này bất cứ lúc nào để cập nhật thiệp; danh sách khách và mật khẩu được giữ nguyên.
set -euo pipefail

REPO="https://github.com/truongthanhtamdev/fitclub.git"
BRANCH="claude/relaxed-ramanujan-pieevt"
APP=/opt/thiep-cuoi
DOMAIN="${DOMAIN:-damcuoitungvalan.com}"
PORT="${PORT:-3000}"

say() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Cần chạy với quyền root (thêm sudo)."; exit 1; }
command -v apt-get >/dev/null || { echo "Script này dành cho Ubuntu/Debian."; exit 1; }

say "Cài Node.js, nginx, certbot"
export DEBIAN_FRONTEND=noninteractive
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y nginx certbot python3-certbot-nginx git

say "Tải thiệp mới nhất"
TMP=$(mktemp -d)
git clone -q --depth 1 -b "$BRANCH" "$REPO" "$TMP/src"
mkdir -p "$APP/data"
# Chép mã và ảnh của thiệp; giữ nguyên data/, .env và ảnh cưới bạn đã chép lên VPS
cp -r "$TMP/src/thiep-cuoi/." "$APP/"
rm -rf "$TMP"
chown -R www-data:www-data "$APP/data"

if [ ! -s "$APP/.env" ]; then
  say "Đặt mật khẩu trang quản trị (ít nhất 8 ký tự, gõ không hiện chữ)"
  while true; do
    read -rsp "Mật khẩu: " P1 </dev/tty; echo
    read -rsp "Nhập lại: " P2 </dev/tty; echo
    if [ "${#P1}" -ge 8 ] && [ "$P1" = "$P2" ]; then break; fi
    echo "Mật khẩu ngắn hơn 8 ký tự hoặc hai lần nhập không khớp, nhập lại nhé."
  done
  umask 077
  printf 'ADMIN_PASSWORD=%s\n' "$P1" > "$APP/.env"
  unset P1 P2
fi

say "Chạy thiệp như một dịch vụ"
sed -i "s/^Environment=PORT=.*/Environment=PORT=$PORT/" "$APP/thiep-cuoi.service"
cp "$APP/thiep-cuoi.service" /etc/systemd/system/thiep-cuoi.service
systemctl daemon-reload
systemctl enable thiep-cuoi >/dev/null
systemctl restart thiep-cuoi
sleep 1
systemctl is-active --quiet thiep-cuoi || { journalctl -u thiep-cuoi -n 30 --no-pager; echo "Dịch vụ chưa chạy được, xem lỗi ở trên."; exit 1; }

say "Gắn tên miền $DOMAIN vào nginx"
CONF=/etc/nginx/sites-available/thiep-cuoi
if [ ! -f "$CONF" ]; then
  sed -e "s/damcuoitungvalan.com/$DOMAIN/g" -e "s/127.0.0.1:3000/127.0.0.1:$PORT/" "$APP/nginx-damcuoitungvalan.conf" > "$CONF"
  ln -sf "$CONF" /etc/nginx/sites-enabled/thiep-cuoi
fi
nginx -t && systemctl reload nginx

say "Bật HTTPS"
if certbot certificates 2>/dev/null | grep -q "Domains: .*$DOMAIN"; then
  echo "HTTPS đã có sẵn."
elif certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect -d "$DOMAIN" -d "www.$DOMAIN"; then
  echo "Đã bật HTTPS."
else
  echo "Chưa bật được HTTPS: có thể tên miền chưa trỏ về IP VPS này."
  echo "Trỏ xong (bản ghi A cho @ và www), chạy lại lệnh cài là được."
fi

IP=$(curl -fsS -4 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
say "Xong!"
echo "Thiệp:        https://$DOMAIN/"
echo "Quản trị:     https://$DOMAIN/quan-tri   (tên đăng nhập: admin)"
echo "IP VPS:       $IP   (tên miền cần trỏ về IP này)"
echo "Ảnh cưới:     chép vào $APP/ với tên anh-1.jpg ... anh-4.jpg"
echo "Danh sách:    $APP/data/rsvps.json"
