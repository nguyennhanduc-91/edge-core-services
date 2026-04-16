const express = require('express');
const { Cluster } = require('puppeteer-cluster');

const app = express();
// Tăng limit để nhận chuỗi base64 HTML dài
app.use(express.json({ limit: '50mb' }));

let cluster;

(async () => {
    // Khởi tạo hàng đợi Puppeteer
    cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_PAGE, // Mở tab mới, dùng chung 1 trình duyệt (Tiết kiệm RAM)
        maxConcurrency: 4, // Số tab chạy song song. (4 tab là an toàn nhất cho VPS 4GB RAM)
        puppeteerOptions: {
            headless: 'new',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage' // Chống crash RAM trên môi trường Docker
            ]
        }
    });

    // Định nghĩa công việc (Task)
    cluster.task(async ({ page, data }) => {
        const { html_base64, width, height } = data;
        const htmlContent = Buffer.from(html_base64, 'base64').toString('utf-8');
        
        // deviceScaleFactor: 2 giúp hình khối và chữ sắc nét (Retina)
        await page.setViewport({ width: width || 1080, height: height || 1920, deviceScaleFactor: 2 });
        
        // Chờ tải xong Tailwind và Font Google
        await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });
        
        // Chụp ảnh
        const imageBuffer = await page.screenshot({ type: 'jpeg', quality: 90 });
        return imageBuffer.toString('base64');
    });

    console.log('✅ Hàng đợi Puppeteer đã sẵn sàng!');
})();

// Endpoint nhận lệnh
app.post('/api/convert', async (req, res) => {
    try {
        if (!cluster) {
            return res.status(503).json({ error: 'Server đang khởi động trình duyệt...' });
        }

        const { html_base64, width, height } = req.body;
        if (!html_base64) return res.status(400).json({ error: 'Thiếu html_base64' });

        // Ném yêu cầu vào hàng đợi và chờ lấy kết quả
        const resultBase64 = await cluster.execute({ html_base64, width, height });
        
        res.status(200).json({ success: true, image_base64: resultBase64 });

    } catch (error) {
        console.error("Lỗi Render:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 API chạy tại port ${PORT}`));
