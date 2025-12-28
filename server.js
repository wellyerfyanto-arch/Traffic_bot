require('dotenv').config();
const express = require('express');
const socketIO = require('socket.io');
const http = require('http');
const path = require('path');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const { v4: uuidv4 } = require('uuid');

// PERUBAHAN PENTING: Gunakan puppeteer-core dan chromium untuk Render
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserPreferencesPlugin = require('puppeteer-extra-plugin-user-preferences');
const UserDataDirPlugin = require('puppeteer-extra-plugin-user-data-dir');

// Setup puppeteer-extra dengan plugin
puppeteerExtra.use(StealthPlugin());
puppeteerExtra.use(UserPreferencesPlugin({
  userPreferences: {
    'profile.default_content_setting_values.notifications': 2, // Block notifications
    'credentials_enable_service': false,
    'profile.password_manager_enabled': false
  }
}));
// CATATAN: Plugin UserDataDir mungkin kurang efektif di Render karena filesystem ephemeral
puppeteerExtra.use(UserDataDirPlugin());

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fungsi utama untuk menjalankan sesi bot
async function runTrafficBot(config) {
    console.log(`Memulai sesi bot dengan konfigurasi:`, config.target);
    
    let browser;
    try {
        // PERUBAHAN PENTING: Konfigurasi launch untuk Render
        const launchOptions = {
            args: [
                ...chromium.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-blink-features=AutomationControlled',
            ],
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(), // KUNCI: Pakai Chromium dari package
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        };

        // Tambahkan proxy jika ada di config
        if (config.proxyServer && config.proxyServer !== '') {
            launchOptions.args.push(`--proxy-server=${config.proxyServer}`);
        }

        // Gunakan puppeteer-extra dengan konfigurasi
        browser = await puppeteerExtra.launch(launchOptions);
        const page = await browser.newPage();

        // Setup user agent (gunakan dari config atau default)
        if (config.userAgent) {
            await page.setUserAgent(config.userAgent);
        }

        // Setup proxy authentication jika diperlukan
        if (config.proxyAuth && config.proxyAuth.username) {
            await page.authenticate({
                username: config.proxyAuth.username,
                password: config.proxyAuth.password || ''
            });
        }

        // Setup viewport dan lainnya
        await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
        await page.setJavaScriptEnabled(true);

        // Emit status via Socket.IO
        io.emit('bot-status', { 
            sessionId: config.sessionId || uuidv4(),
            status: 'starting',
            message: 'Browser berhasil diluncurkan'
        });

        // LOGIKA BOT BERDASARKAN TARGET
        if (config.target === 'youtube') {
            await handleYouTubeTraffic(page, config);
        } else if (config.target === 'website') {
            await handleWebsiteTraffic(page, config);
        }
        // Tambahkan target lain (facebook, tiktok) di sini

        await browser.close();
        
        io.emit('bot-status', {
            sessionId: config.sessionId,
            status: 'completed',
            message: 'Sesi bot selesai'
        });
        
        return { success: true, message: 'Bot session completed' };
        
    } catch (error) {
        console.error('Error dalam sesi bot:', error);
        if (browser) await browser.close();
        
        io.emit('bot-status', {
            sessionId: config.sessionId,
            status: 'error',
            message: `Error: ${error.message}`
        });
        
        throw error;
    }
}

// Fungsi untuk traffic YouTube
async function handleYouTubeTraffic(page, config) {
    io.emit('bot-status', {
        sessionId: config.sessionId,
        status: 'progress',
        message: 'Menuju YouTube...'
    });

    // Pergi ke Google atau langsung ke YouTube
    if (config.searchEngine === 'google') {
        await page.goto('https://www.google.com', { waitUntil: 'networkidle2' });
        
        // Cari keyword YouTube
        await page.type('textarea[name="q"]', `${config.ytKeyword} site:youtube.com`);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        
        // Cari link YouTube dan klik
        const youtubeLink = await page.$x("//a[contains(@href, 'youtube.com')]");
        if (youtubeLink.length > 0) {
            await youtubeLink[0].click();
        } else {
            await page.goto('https://www.youtube.com', { waitUntil: 'networkidle2' });
        }
    } else {
        await page.goto('https://www.youtube.com', { waitUntil: 'networkidle2' });
    }

    // Jika ada direct URL, gunakan itu
    if (config.ytDirectUrl) {
        await page.goto(config.ytDirectUrl, { waitUntil: 'networkidle2' });
    } else {
        // Cari di YouTube
        await page.type('input[name="search_query"]', config.ytKeyword);
        await page.click('button#search-icon-legacy');
        await page.waitForTimeout(3000);
    }

    // Scroll dan interaksi manusiawi
    await humanLikeScroll(page);
    
    // Cari video atau channel
    const videoSelector = 'ytd-video-renderer, ytd-rich-item-renderer';
    await page.waitForSelector(videoSelector, { timeout: 10000 });
    
    // Klik video pertama atau sesuai config
    const videos = await page.$$(videoSelector);
    if (videos.length > 0) {
        await videos[0].click();
        await page.waitForTimeout(5000);
        
        // Tonton video (simulasi)
        io.emit('bot-status', {
            sessionId: config.sessionId,
            status: 'progress',
            message: 'Menonton video...'
        });
        
        // Scroll selama video diputar
        const watchTime = (config.watchDuration || 10) * 60 * 1000;
        const scrollInterval = setInterval(async () => {
            await humanLikeScroll(page, 300, 800);
        }, 10000);
        
        // Tunggu sesuai durasi yang ditentukan
        await page.waitForTimeout(Math.min(watchTime, 60000)); // Maksimal 1 menit untuk demo
        
        clearInterval(scrollInterval);
        
        // Interaksi (like, subscribe, comment)
        if (config.ytLike) {
            try {
                const likeButton = await page.$('button[aria-label="Like this video"]');
                if (likeButton) await likeButton.click();
                await page.waitForTimeout(1000);
            } catch (e) { console.log('Tidak bisa like:', e.message); }
        }
        
        // Buka channel
        try {
            const channelLink = await page.$('ytd-video-owner-renderer #channel-name a');
            if (channelLink) {
                await channelLink.click();
                await page.waitForTimeout(3000);
                await humanLikeScroll(page);
            }
        } catch (e) { console.log('Tidak bisa buka channel:', e.message); }
    }
}

// Fungsi untuk traffic website
async function handleWebsiteTraffic(page, config) {
    io.emit('bot-status', {
        sessionId: config.sessionId,
        status: 'progress',
        message: 'Menuju website target...'
    });

    // Pergi ke search engine
    const searchUrl = config.searchEngine === 'bing' 
        ? 'https://www.bing.com' 
        : 'https://www.google.com';
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    
    // Cari keyword
    const searchInput = config.searchEngine === 'bing'
        ? 'input[name="q"]'
        : 'textarea[name="q"]';
    
    await page.type(searchInput, `${config.webKeyword} ${config.webUrl}`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    
    // Cari link ke website target
    const searchResults = await page.$$eval('a', links => 
        links.map(link => ({ href: link.href, text: link.textContent }))
    );
    
    const targetLink = searchResults.find(link => 
        link.href.includes(config.webUrl.replace('https://', '').replace('http://', ''))
    );
    
    if (targetLink) {
        // Klik link target
        await page.evaluate((href) => {
            const link = document.querySelector(`a[href*="${href}"]`);
            if (link) link.click();
        }, config.webUrl);
    } else {
        // Jika tidak ditemukan, langsung ke URL
        await page.goto(config.webUrl, { waitUntil: 'networkidle2' });
    }
    
    await page.waitForTimeout(5000);
    
    // Lakukan scrolling manusiawi berdasarkan pattern
    const scrollPattern = config.scrollPattern || 'reader';
    await humanLikeScroll(page, getScrollConfig(scrollPattern));
    
    // Klik internal links jika diaktifkan
    if (config.clickLinks) {
        const internalLinks = await page.$$eval('a', links => 
            links.filter(link => 
                link.href.includes(window.location.hostname) && 
                !link.href.includes('#') &&
                link.textContent.length > 5
            ).map(link => link.href)
        );
        
        if (internalLinks.length > 0) {
            const randomLink = internalLinks[Math.floor(Math.random() * internalLinks.length)];
            await page.goto(randomLink, { waitUntil: 'networkidle2' });
            await page.waitForTimeout(3000);
            await humanLikeScroll(page, getScrollConfig('skimmer'));
        }
    }
}

// Helper: Scroll seperti manusia
async function humanLikeScroll(page, minPx = 200, maxPx = 800) {
    const scrollAmount = Math.floor(Math.random() * (maxPx - minPx + 1)) + minPx;
    const scrollTime = Math.random() * 1000 + 500;
    
    await page.evaluate((amount, time) => {
        window.scrollBy({ top: amount, behavior: 'smooth', duration: time });
    }, scrollAmount, scrollTime);
    
    await page.waitForTimeout(scrollTime + Math.random() * 1000);
}

// Helper: Konfigurasi scroll berdasarkan pattern
function getScrollConfig(pattern) {
    switch(pattern) {
        case 'skimmer':
            return { minPx: 500, maxPx: 1500 }; // Scroll cepat dan jauh
        case 'researcher':
            return { minPx: 100, maxPx: 400 };   // Scroll pelan dan teliti
        case 'bouncer':
            return { minPx: 800, maxPx: 2000 };  // Scroll cepat, sering pindah
        default: // reader
            return { minPx: 200, maxPx: 800 };   // Scroll normal
    }
}

// Route untuk memulai bot
app.post('/api/start-bot', async (req, res) => {
    try {
        const config = req.body;
        
        // Validasi config dasar
        if (!config.target) {
            return res.status(400).json({ 
                success: false, 
                error: 'Target harus ditentukan (youtube/website)' 
            });
        }
        
        // Generate session ID
        config.sessionId = uuidv4();
        
        // Log ke console
        console.log(`Menerima request bot untuk target: ${config.target}`, {
            sessionId: config.sessionId,
            timestamp: new Date().toISOString()
        });
        
        // Kirim respons segera (async processing)
        res.json({ 
            success: true, 
            message: 'Bot session started', 
            sessionId: config.sessionId 
        });
        
        // Jalankan bot secara asynchronous
        setTimeout(async () => {
            try {
                await runTrafficBot(config);
            } catch (error) {
                console.error('Error dalam eksekusi bot:', error);
            }
        }, 100);
        
    } catch (error) {
        console.error('Error dalam /api/start-bot:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message || 'Internal server error' 
        });
    }
});

// Route untuk mendapatkan status bot
app.get('/api/bot-status/:sessionId', (req, res) => {
    // Implementasi tracking status bisa ditambahkan di sini
    res.json({ 
        sessionId: req.params.sessionId, 
        status: 'completed', // Placeholder
        lastUpdated: new Date().toISOString()
    });
});

// Route untuk menghentikan bot
app.post('/api/stop-bot', (req, res) => {
    // Implementasi stop mechanism bisa ditambahkan di sini
    res.json({ success: true, message: 'Stop command received' });
});

// Socket.io connection
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
    
    socket.on('bot-command', (data) => {
        console.log('Bot command received:', data);
        io.emit('bot-update', data);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Puppeteer config: Using puppeteer-core with @sparticuz/chromium`);
});

// Ekspor untuk testing
module.exports = { 
    app, 
    runTrafficBot, 
    handleYouTubeTraffic, 
    handleWebsiteTraffic 
};