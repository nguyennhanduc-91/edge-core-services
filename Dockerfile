# Dùng base image đã cài sẵn Google Chrome và đủ thư viện Linux
FROM ghcr.io/puppeteer/puppeteer:latest

USER root

# Cài đặt curl để hỗ trợ Coolify Healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Ép hệ thống ưu tiên phân giải IPv4 để tránh lỗi net::ERR_CONNECTION_REFUSED với Cloudflare / IPv6
RUN echo "precedence ::ffff:0:0/96 100" >> /etc/gai.conf

WORKDIR /usr/src/app

# Copy cấu hình package và puppeteer
COPY package*.json .puppeteerrc.cjs ./
RUN npm install --only=production
RUN npx puppeteer browsers install chrome

# Copy toàn bộ mã nguồn
COPY . .

# Chuyển quyền thư mục app (bao gồm cả .cache/puppeteer) cho pptruser
RUN chown -R pptruser:pptruser /usr/src/app
USER pptruser

EXPOSE 3000

# Lệnh khởi chạy
CMD ["npm", "start"]
