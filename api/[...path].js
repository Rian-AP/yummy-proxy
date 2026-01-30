import { getValidToken } from './_lib/tokenManager.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application, Lang');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const requestUrl = new URL(req.url, `http://${req.headers.host}`);
        let apiPath = requestUrl.pathname.replace(/^\/api/, '');
        if (!apiPath) apiPath = '/';

        const fullUrl = `https://api.yani.tv${apiPath}${requestUrl.search}`;
        
        console.log(`📡 Запрос прокси: ${req.method} ${fullUrl}`);
        
        const token = await getValidToken();
        console.log(`🔑 Токен: ${token ? 'OK' : 'MISSING'}`);
        
        // ====== ПОЛНАЯ ЭМУЛЯЦИЯ БРАУЗЕРА ======
        const fetchOptions = {
            method: req.method,
            headers: {
                // Основные заголовки API
                'Authorization': `Bearer ${token}`,
                'X-Application': process.env.YUMMY_APP_TOKEN,
                'Lang': req.headers['lang'] || 'ru',
                
                // Полная эмуляция Chrome
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'cross-site',
                'Origin': 'https://yani.tv',
                'Referer': 'https://yani.tv/',
                'DNT': '1',
                'Connection': 'keep-alive'
            },
            redirect: 'follow'
        };
        // =====================================
        
        if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
            fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
            fetchOptions.headers['Content-Type'] = 'application/json';
        }
        
        const response = await fetch(fullUrl, fetchOptions);
        
        console.log(`📥 Ответ: ${response.status}`);
        
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            return res.status(response.status).json(data);
        } else {
            const text = await response.text();
            
            // Если всё ещё HTML — показываем детали
            if (contentType && contentType.includes('text/html')) {
                console.warn('⚠️ Всё ещё HTML:', text.substring(0, 300));
                return res.status(response.status).json({
                    error: 'Blocked by Valtrix',
                    status: response.status,
                    message: 'Anti-bot protection is blocking datacenter IPs',
                    preview: text.substring(0, 200)
                });
            }
            
            return res.status(response.status).send(text);
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ error: error.message });
    }
}
