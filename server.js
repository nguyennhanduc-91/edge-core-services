const express = require('express');
const { Cluster } = require('puppeteer-cluster');
const puppeteer = require('puppeteer-core'); // TỐI ƯU 1: Dùng core để không tải lại Chrome

const app = express();
app.use(express.json({ limit: '50mb' })); // Giữ nguyên limit cho base64[cite: 2]

app.get('/', (req, res) => {
    res.status(200).send('OK'); // Giữ nguyên Healthcheck[cite: 2]
});

let cluster;

(async () => {
    cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_PAGE, // Tiết kiệm RAM[cite: 2]
        maxConcurrency: 4, // 4 tab an toàn cho VPS[cite: 2]
        puppeteer,         // Gắn Puppeteer Core
        puppeteerOptions: {
            executablePath: '/usr/bin/google-chrome-stable', // TỐI ƯU 2: Trỏ thẳng vào Chrome của base image
            headless: 'new', // Khuyên dùng cho bản mới[cite: 2]
            args: [
                '--no-sandbox',[cite: 2]
                '--disable-setuid-sandbox',[cite: 2]
                '--disable-dev-shm-usage', // Chống crash RAM[cite: 2]
                '--disable-gpu',           // TỐI ƯU 3: Giảm tải vì VPS không có card đồ họa
                '--no-zygote',             // TỐI ƯU 4: Chặn các process con không cần thiết rò rỉ RAM
                '--single-process'         // TỐI ƯU 5: Chạy nhẹ nhàng trong 1 process trên Docker
            ]
        }
    });

    cluster.task(async ({ page, data }) => {
        const { html_base64, width, height } = data;[cite: 2]
        const htmlContent = Buffer.from(html_base64, 'base64').toString('utf-8');[cite: 2]
        
        await page.setViewport({ width: width || 1080, height: height || 1920, deviceScaleFactor: 2 });[cite: 2]
        await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });[cite: 2]
        
        const imageBuffer = await page.screenshot({ type: 'jpeg', quality: 90 });[cite: 2]
        return imageBuffer.toString('base64');[cite: 2]
    });

    console.log('✅ Hàng đợi Puppeteer đã sẵn sàng!');[cite: 2]
})();

app.post('/api/convert', async (req, res) => {
    try {
        if (!cluster) {
            return res.status(503).json({ error: 'Server đang khởi động trình duyệt...' });[cite: 2]
        }
        const { html_base64, width, height } = req.body;[cite: 2]
        if (!html_base64) return res.status(400).json({ error: 'Thiếu html_base64' });[cite: 2]

        const resultBase64 = await cluster.execute({ html_base64, width, height });[cite: 2]
        res.status(200).json({ success: true, image_base64: resultBase64 });[cite: 2]
    } catch (error) {
        console.error("Lỗi Render:", error);[cite: 2]
        res.status(500).json({ error: error.message });[cite: 2]
    }
});

app.post('/api/screenshot', async (req, res) => {
    try {
        if (!cluster) {
            return res.status(503).json({ error: 'Server đang khởi động trình duyệt...' });[cite: 2]
        }
        const { url, width, height, wait_seconds } = req.body;[cite: 2]
        if (!url) return res.status(400).json({ error: 'Thiếu url' });[cite: 2]

        const resultBase64 = await cluster.execute({ url, width, height, wait_seconds }, async ({ page, data }) => {
            const { url, width, height, wait_seconds } = data;[cite: 2]

            await page.setViewport({ width: width || 1080, height: height || 1920, deviceScaleFactor: 2 });[cite: 2]
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });[cite: 2]

            const extraWait = (wait_seconds || 3) * 1000;[cite: 2]
            await new Promise(resolve => setTimeout(resolve, extraWait));[cite: 2]

            const imageBuffer = await page.screenshot({ type: 'jpeg', quality: 90 });[cite: 2]
            return imageBuffer.toString('base64');[cite: 2]
        });

        res.status(200).json({ success: true, image_base64: resultBase64 });[cite: 2]
    } catch (error) {
        console.error("Lỗi Screenshot:", error);[cite: 2]
        res.status(500).json({ error: error.message });[cite: 2]
    }
});

const PORT = 3000;[cite: 2]
app.listen(PORT, () => console.log(`🚀 API chạy tại port ${PORT}`));[cite: 2]
