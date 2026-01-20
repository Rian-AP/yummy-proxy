import { getValidToken } from './_lib/tokenManager.js';

export default async function handler(req, res) {
    // Настройка CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Application, Lang');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        // 1. Формируем URL
        const pathArray = req.query.path || [];
        const apiPath = '/' + pathArray.join('/');
        
        const queryParams = { ...req.query };
        delete queryParams.path; 
        
        const queryString = new URLSearchParams(queryParams).toString();
        const fullUrl = `https://api.yani.tv${apiPath}${queryString ? '?' + queryString : ''}`;
        
        console.log(`📡 Запрос прокси: ${req.method} ${fullUrl}`);
        
        // 2. Получаем токен
        const token = await getValidToken();
        
        // 3. Делаем запрос (с отключенным авто-редиректом)
        const fetchOptions = {
            method: req.method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Application': process.env.YUMMY_APP_TOKEN,
                'Accept': 'application/json', // Требуем только JSON
                'Lang': req.headers['lang'] || 'ru',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            redirect: 'manual' // <--- ВАЖНО: Не следовать за редиректами автоматически
        };
        
        // Тело запроса для POST/PUT
        if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
            fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
        }
        
        const response = await fetch(fullUrl, fetchOptions);
        
        console.log(`🔙 Ответ API: ${response.status} ${response.statusText}`);

        // 4. Обработка редиректов (301, 302)
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            console.warn(`⚠️ API вернул редирект на: ${location}`);
            return res.status(response.status).json({
                error: 'API Redirected',
                location: location,
                message: 'Target API tried to redirect request. Check URL.'
            });
        }

        // 5. Обработка контента
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            return res.status(response.status).json(data);
        } else {
            // Если пришел не JSON (например, HTML с ошибкой)
            const text = await response.text();
            console.error('❌ API вернул НЕ JSON. Начало ответа:', text.substring(0, 200));
            
            return res.status(502).json({
                error: 'Invalid API Response',
                status: response.status,
                contentType: contentType,
                preview: text.substring(0, 500) // Показываем текст ошибки в JSON формате
            });
        }
        
    } catch (error) {
        console.error('❌ Proxy error:', error);
        res.status(500).json({ 
            error: 'Internal Proxy Error', 
            message: error.message 
        });
    }
}
