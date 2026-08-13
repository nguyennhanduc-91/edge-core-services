const express = require('express');
const { Cluster } = require('puppeteer-cluster');
const puppeteer = require('puppeteer-core');

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
    res.status(200).send('OK');
});

let cluster;

(async () => {
    cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_PAGE,
        maxConcurrency: 4,
        puppeteer,
        puppeteerOptions: {
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-zygote',
                '--single-process'
            ]
        }
    });

    cluster.task(async ({ page, data }) => {
        const { html_base64, width, height } = data;
        const htmlContent = Buffer.from(html_base64, 'base64').toString('utf-8');
        
        await page.setViewport({ width: width || 1080, height: height || 1920, deviceScaleFactor: 2 });
        await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });
        
        const imageBuffer = await page.screenshot({ type: 'jpeg', quality: 90 });
        return imageBuffer.toString('base64');
    });

    console.log('✅ Hàng đợi Puppeteer đã sẵn sàng!');
})();

app.post('/api/convert', async (req, res) => {
    try {
        if (!cluster) {
            return res.status(503).json({ error: 'Server đang khởi động trình duyệt...' });
        }
        const { html_base64, width, height } = req.body;
        if (!html_base64) return res.status(400).json({ error: 'Thiếu html_base64' });

        const resultBase64 = await cluster.execute({ html_base64, width, height });
        res.status(200).json({ success: true, image_base64: resultBase64 });
    } catch (error) {
        console.error("Lỗi Render:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/screenshot', async (req, res) => {
    try {
        if (!cluster) {
            return res.status(503).json({ error: 'Server đang khởi động trình duyệt...' });
        }
        const { url, width, height, wait_seconds } = req.body;
        if (!url) return res.status(400).json({ error: 'Thiếu url' });

        const resultBase64 = await cluster.execute({ url, width, height, wait_seconds }, async ({ page, data }) => {
            const { url, width, height, wait_seconds } = data;

            await page.setViewport({ width: width || 1080, height: height || 1920, deviceScaleFactor: 2 });
            await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

            const extraWait = (wait_seconds || 3) * 1000;
            await new Promise(resolve => setTimeout(resolve, extraWait));

            const imageBuffer = await page.screenshot({ type: 'jpeg', quality: 90 });
            return imageBuffer.toString('base64');
        });

        res.status(200).json({ success: true, image_base64: resultBase64 });
    } catch (error) {
        console.error("Lỗi Screenshot:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 API chạy tại port ${PORT}`));
