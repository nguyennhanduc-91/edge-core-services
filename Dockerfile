# Dùng base image đã cài sẵn Google Chrome và đủ thư viện Linux
FROM ghcr.io/puppeteer/puppeteer:latest

# Chuyển sang quyền root để cài đặt
USER root

WORKDIR /usr/src/app

# Copy file cấu hình và cài đặt
COPY package*.json ./
RUN npm install

# Copy toàn bộ code
COPY . .

EXPOSE 3000

# Lệnh khởi chạy
CMD ["npm", "start"]
