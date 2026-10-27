# edge-core-services

Dịch vụ kết xuất hình ảnh và chụp ảnh website chất lượng cao sử dụng Express.js và Puppeteer Cluster.

## Tính năng

- **Chụp ảnh website từ URL (`/api/screenshot`)**: Hỗ trợ SPA, giả lập User-Agent, thiết lập kích thước màn hình và thời gian chờ tải dữ liệu.
- **Render mã nguồn HTML Base64 thành ảnh (`/api/convert`)**: Nhận chuỗi HTML đã mã hóa base64 và chụp thành ảnh JPEG chất lượng cao.
- **Puppeteer Cluster Queue**: Quản lý hàng đợi tác vụ với `CONCURRENCY_CONTEXT` giúp tối ưu RAM, chống rò rỉ bộ nhớ giữa các tác vụ.
- **Tối ưu hóa Docker**: Tận dụng Google Chrome có sẵn trên base image, ngăn tải trùng lặp Chromium và cấu hình ưu tiên IPv4 chống lỗi `ERR_CONNECTION_REFUSED` khi kết nối qua Cloudflare.

## Chạy với Docker

### Build Image
```bash
docker build -t edge-core-services .
```

### Run Container
```bash
docker run -d --name edge-core-services -p 3000:3000 edge-core-services
```

*Lưu ý:* Nếu dịch vụ chạy trên cùng một máy chủ với website cần chụp ảnh (không có Hairpin NAT), hãy thêm flag `--add-host`:
```bash
docker run -d --name edge-core-services -p 3000:3000 --add-host=hub.thanhnguyen.group:host-gateway edge-core-services
```

## API Endpoints

### 1. Healthcheck
- **GET** `/`
- Trả về trạng thái cluster và thời gian hoạt động (uptime).

### 2. Chụp ảnh từ URL
- **POST** `/api/screenshot`
- **Body JSON**:
  ```json
  {
    "url": "https://hub.thanhnguyen.group/#render-report/179",
    "width": 1240,
    "height": 1754,
    "wait_seconds": 4
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "image_base64": "<base64_string>"
  }
  ```

### 3. Render HTML Base64 sang Ảnh
- **POST** `/api/convert`
- **Body JSON**:
  ```json
  {
    "html_base64": "<base64_html_content>",
    "width": 1080,
    "height": 1920
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "image_base64": "<base64_string>"
  }
  ```
