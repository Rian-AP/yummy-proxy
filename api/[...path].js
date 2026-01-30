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
        
        // ====== ОТЛАДКА ТОКЕНА ======
        let token;
        try {
            token = await getValidToken();
            console.log(`🔑 Токен получен: ${token ? token.substring(0, 20) + '...' : 'NULL!'}`);
        } catch (tokenError) {
            console.error('❌ Ошибка получения токена:', tokenError.message);
            return res.status(500).json({
                error: 'Token Error',
                message: tokenError.message
            });
        }
        
        if (!token) {
            return res.status(500).json({
                error: 'No Token',
                message: 'getValidToken() вернул null/undefined'
            });
        }
        // ============================
        
        const fetchOptions = {
            method: req.method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Application': process.env.YUMMY_APP_TOKEN,
                'Accept': 'application/json',
                'Lang': req.headers['lang'] || 'ru',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            redirect: 'follow' 
        };
        
        // Логируем заголовки (без полного токена)
        console.log('📤 Заголовки запроса:', {
            ...fetchOptions.headers,
            'Authorization': 'Bearer ***',
            'X-Application': process.env.YUMMY_APP_TOKEN ? '***exists***' : 'MISSING!'
        });
        
        if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
            fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
        }
        
        const response = await fetch(fullUrl, fetchOptions);
        
        console.log(`📥 Ответ API: ${response.status} ${response.statusText}`);
        
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            return res.status(response.status).json(data);
        } else if (contentType && contentType.includes('text/html')) {
            // ====== ОТЛАДКА HTML ======
            const htmlContent = await response.text();
            console.warn('⚠️ API вернул HTML!');
            console.warn('📄 Первые 500 символов:', htmlContent.substring(0, 500));
            // ==========================
            
            return res.status(404).json({
                error: 'Endpoint Not Found',
                message: 'Target API returned HTML instead of JSON',
                debugUrl: fullUrl,
                httpStatus: response.status,
                // Показываем начало HTML для отладки
                htmlPreview: htmlContent.substring(0, 300)
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
