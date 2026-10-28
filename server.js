const express = require('express');
const { Cluster } = require('puppeteer-cluster');
const puppeteer = require('puppeteer');

const app = express();
app.use(express.json({ limit: '50mb' }));

let cluster;

// Healthcheck: Luôn trả về 200 để Coolify/Docker healthcheck pass ngay khi server khởi động
app.get('/', (req, res) => {
    res.status(200).json({
        status: cluster ? 'OK' : 'STARTING',
        service: 'puppeteer-cluster-api',
        uptime: process.uptime()
    });
});

// Khởi tạo cluster
(async () => {
    try {
        cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_CONTEXT, // Mỗi task chạy trên incognito context riêng biệt
            maxConcurrency: parseInt(process.env.MAX_CONCURRENCY, 10) || 4,
            puppeteer,
            timeout: 60000, // Timeout 60s cho mỗi task
            puppeteerOptions: {
                headless: true, // Puppeteer v24+ dùng boolean true
                ...(process.env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } : {}),
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--no-zygote',
                    '--ignore-certificate-errors',
                    '--disable-features=IsolateOrigins,site-per-process'
                ]
            }
        });

        console.log('✅ Hàng đợi Puppeteer Cluster đã sẵn sàng!');
    } catch (err) {
        console.error('❌ Lỗi khởi tạo Puppeteer Cluster:', err);
    }
})();

// API: Render mã nguồn HTML Base64 thành ảnh
app.post('/api/convert', async (req, res) => {
    try {
        if (!cluster) {
            return res.status(503).json({ error: 'Server đang khởi động trình duyệt...' });
        }
        const { html_base64, width, height } = req.body;
        if (!html_base64) return res.status(400).json({ error: 'Thiếu html_base64' });

        const resultBase64 = await cluster.execute({ html_base64, width, height }, async ({ page, data }) => {
            const { html_base64, width, height } = data;
            const htmlContent = Buffer.from(html_base64, 'base64').toString('utf-8');

            await page.setViewport({
                width: parseInt(width, 10) || 1080,
                height: parseInt(height, 10) || 1920,
                deviceScaleFactor: 2
            });

            await page.setContent(htmlContent, { waitUntil: 'networkidle2', timeout: 30000 });

            const imageBuffer = await page.screenshot({ type: 'jpeg', quality: 90 });
            return imageBuffer.toString('base64');
        });

        res.status(200).json({ success: true, image_base64: resultBase64 });
    } catch (error) {
        console.error("Lỗi Render:", error);
        res.status(500).json({ error: error.message });
    }
});

// API: Chụp ảnh từ URL
app.post('/api/screenshot', async (req, res) => {
    try {
        if (!cluster) {
            return res.status(503).json({ error: 'Server đang khởi động trình duyệt...' });
        }
        const { url, width, height, wait_seconds } = req.body;
        if (!url) return res.status(400).json({ error: 'Thiếu url' });

        const resultBase64 = await cluster.execute({ url, width, height, wait_seconds }, async ({ page, data }) => {
            const { url, width, height, wait_seconds } = data;

            // Giả lập User-Agent thực tế để tránh bị Cloudflare / WAF chặn
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');

            await page.setViewport({
                width: parseInt(width, 10) || 1080,
                height: parseInt(height, 10) || 1920,
                deviceScaleFactor: 2
            });

            // networkidle2 phù hợp và ổn định cho các Single Page Application (React/Vue/Angular với hash routing #)
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            const extraWait = (parseInt(wait_seconds, 10) || 3) * 1000;
            if (extraWait > 0) {
                await new Promise(resolve => setTimeout(resolve, extraWait));
            }

            const imageBuffer = await page.screenshot({ type: 'jpeg', quality: 90 });
            return imageBuffer.toString('base64');
        });

        res.status(200).json({ success: true, image_base64: resultBase64 });
    } catch (error) {
        console.error("Lỗi Screenshot:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`🚀 API chạy tại port ${PORT}`));

// Graceful shutdown
const handleShutdown = async (signal) => {
    console.log(`\nNhận ${signal}, đang đóng kết nối an toàn...`);
    server.close(async () => {
        if (cluster) {
            try {
                await cluster.idle();
                await cluster.close();
            } catch (err) {
                console.error('Lỗi khi đóng cluster:', err);
            }
        }
        process.exit(0);
    });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
