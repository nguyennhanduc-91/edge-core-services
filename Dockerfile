# Dùng base image đã cài sẵn Google Chrome và đủ thư viện Linux
FROM ghcr.io/puppeteer/puppeteer:latest

USER root

# Ép hệ thống ưu tiên phân giải IPv4 để tránh lỗi net::ERR_CONNECTION_REFUSED với Cloudflare / IPv6
RUN echo "precedence ::ffff:0:0/96 100" >> /etc/gai.conf

WORKDIR /usr/src/app

# Không tải lại Chromium khi npm install vì image đã có sẵn Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Copy file cấu hình và cài đặt dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy toàn bộ mã nguồn
COPY . .

# Chuyển quyền cho pptruser để bảo mật
RUN chown -R pptruser:pptruser /usr/src/app
USER pptruser

EXPOSE 3000

# Lệnh khởi chạy
CMD ["npm", "start"]
