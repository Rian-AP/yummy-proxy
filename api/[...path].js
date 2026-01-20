import { getValidToken } from './_lib/tokenManager.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application, Lang');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        // --- ИСПРАВЛЕНИЕ ПУТИ ---
        // Мы берем полный URL запроса и вырезаем из него "/api"
        // Это надежнее, чем req.query.path
        const requestUrl = new URL(req.url, `http://${req.headers.host}`);
        
        // Превращаем "/api/anime/1" -> "/anime/1"
        // Превращаем "/api/search" -> "/search"
        let apiPath = requestUrl.pathname.replace(/^\/api/, '');
        
        // Если путь пустой (просто /api), делаем /
        if (!apiPath) apiPath = '/';

        // Собираем полный URL для API Yani
        const fullUrl = `https://api.yani.tv${apiPath}${requestUrl.search}`;
        
        console.log(`📡 Запрос прокси: ${req.method} ${fullUrl}`);
        
        // --- КОНЕЦ ИСПРАВЛЕНИЯ ---
        
        const token = await getValidToken();
        
        const fetchOptions = {
            method: req.method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Application': process.env.YUMMY_APP_TOKEN,
                'Accept': 'application/json',
                'Lang': req.headers['lang'] || 'ru',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            redirect: 'follow' 
        };
        
        if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
            fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
        }
        
        const response = await fetch(fullUrl, fetchOptions);
        
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            return res.status(response.status).json(data);
        } else if (contentType && contentType.includes('text/html')) {
            console.warn('⚠️ API вернул HTML. URL:', fullUrl);
            return res.status(404).json({
                error: 'Endpoint Not Found',
                message: 'Target API returned HTML instead of JSON. Path might be wrong.',
                debugUrl: fullUrl
            });
        } else {
            const text = await response.text();
            return res.status(response.status).send(text);
        }
        
    } catch (error) {
        console.error('❌ Proxy error:', error);
        res.status(500).json({ 
            error: 'Internal Proxy Error', 
            message: error.message 
        });
    }
}
