const express = require('express');
const { Cluster } = require('puppeteer-cluster');
const puppeteer = require('puppeteer');
const fs = require('fs');
const dns = require('dns');

// Polyfill tương thích ngược cho puppeteer-cluster trên Puppeteer v22+
if (puppeteer.Browser && !puppeteer.Browser.prototype.createIncognitoBrowserContext) {
    puppeteer.Browser.prototype.createIncognitoBrowserContext = function() {
        return this.createBrowserContext();
    };
}

const app = express();
app.use(express.json({ limit: '50mb' }));

let cluster;

// Bắt lỗi không mong muốn để không làm crash Node.js process (tránh lỗi 502 Bad Gateway)
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

// Chẩn đoán mạng lúc khởi động
(async () => {
    console.log('--- 🩺 BẮT ĐẦU CHẨN ĐOÁN MÔI TRƯỜNG MẠNG ---');
    try {
        if (fs.existsSync('/etc/hosts')) {
            console.log('📄 [File /etc/hosts]:\n' + fs.readFileSync('/etc/hosts', 'utf8').trim());
        }
        if (fs.existsSync('/etc/resolv.conf')) {
            console.log('📄 [File /etc/resolv.conf]:\n' + fs.readFileSync('/etc/resolv.conf', 'utf8').trim());
        }
    } catch (e) {
        console.error('Lỗi đọc file cấu hình mạng:', e.message);
    }

    // Kiểm tra DNS của hub.thanhnguyen.group
    dns.lookup('hub.thanhnguyen.group', { all: true }, (err, addresses) => {
        if (err) console.error('❌ DNS lookup hub.thanhnguyen.group lỗi:', err.message);
        else console.log('🔍 DNS lookup hub.thanhnguyen.group:', JSON.stringify(addresses));
    });

    // Kiểm tra kết nối ra Internet công cộng
    try {
        const testGoogle = await fetch('https://www.google.com', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        console.log('🌐 Kết nối Internet ngoài (Google): OK (HTTP ' + testGoogle.status + ')');
    } catch (e) {
        console.error('❌ Không thể kết nối ra Internet ngoài (Google):', e.message);
    }

    // Kiểm tra kết nối trực tiếp tới hub.thanhnguyen.group từ Node.js
    try {
        const testHub = await fetch('https://hub.thanhnguyen.group', { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        console.log('🌐 Kết nối tới hub.thanhnguyen.group từ Node.js: OK (HTTP ' + testHub.status + ')');
    } catch (e) {
        console.error('❌ Kết nối tới hub.thanhnguyen.group từ Node.js bị từ chối/lỗi:', e.message);
    }
    console.log('--- 🩺 KẾT THÚC CHẨN ĐOÁN MÔI TRƯỜNG MẠNG ---');
})();

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
        const chromeArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--ignore-certificate-errors',
            '--disable-features=IsolateOrigins,site-per-process,AsyncDns'
        ];

        // Nếu có cấu hình mapping host tùy chọn
        if (process.env.HOST_RESOLVER_RULES) {
            chromeArgs.push(`--host-resolver-rules=${process.env.HOST_RESOLVER_RULES}`);
            console.log(`⚙️ Sử dụng HOST_RESOLVER_RULES: ${process.env.HOST_RESOLVER_RULES}`);
        }

        cluster = await Cluster.launch({
            concurrency: Cluster.CONCURRENCY_PAGE,
            maxConcurrency: parseInt(process.env.MAX_CONCURRENCY, 10) || 4,
            puppeteer,
            timeout: 60000,
            puppeteerOptions: {
                headless: true,
                args: chromeArgs
            }
        });

        console.log('✅ Hàng đợi Puppeteer Cluster đã sẵn sàng!');
    } catch (err) {
        console.error('❌ Lỗi khởi tạo Puppeteer Cluster:', err);
    }
})();

// Hướng dẫn nếu người dùng gọi GET vào endpoint screenshot
app.get('/api/screenshot', (req, res) => {
    res.status(405).json({
        error: 'Method Not Allowed',
        message: 'Endpoint này chỉ hỗ trợ method POST. Vui lòng gửi POST request với JSON body: { "url": "https://...", "width": 1080, "height": 1920, "wait_seconds": 3 }'
    });
});

// Hướng dẫn nếu người dùng gọi GET vào endpoint convert
app.get('/api/convert', (req, res) => {
    res.status(405).json({
        error: 'Method Not Allowed',
        message: 'Endpoint này chỉ hỗ trợ method POST. Vui lòng gửi POST request với JSON body: { "html_base64": "...", "width": 1080, "height": 1920 }'
    });
});

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

        console.log(`📸 [Screenshot Request] Nhận yêu cầu chụp URL: ${url}`);

        // Chẩn đoán nhanh kết nối cho request này
        try {
            const parsed = new URL(url);
            const dnsInfo = await dns.promises.lookup(parsed.hostname, { all: true });
            console.log(`🔍 [Request DNS] ${parsed.hostname} ->`, JSON.stringify(dnsInfo));
        } catch (e) {
            console.warn(`⚠️ [Request DNS Warning]:`, e.message);
        }

        const resultBase64 = await cluster.execute({ url, width, height, wait_seconds }, async ({ page, data }) => {
            const { url, width, height, wait_seconds } = data;

            // Giả lập User-Agent thực tế để tránh bị Cloudflare / WAF chặn
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');

            await page.setViewport({
                width: parseInt(width, 10) || 1080,
                height: parseInt(height, 10) || 1920,
                deviceScaleFactor: 2
            });

            // Thử load trang với networkidle2
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
