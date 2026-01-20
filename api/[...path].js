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
        // ВАЖНО: API Yani.tv иногда требует слэш в конце, но лучше пусть fetch сам разберется через redirect: 'follow'
        const fullUrl = `https://api.yani.tv${apiPath}${queryString ? '?' + queryString : ''}`;
        
        console.log(`📡 Запрос прокси: ${req.method} ${fullUrl}`);
        
        // 2. Получаем токен
        const token = await getValidToken();
        
        // 3. Настройки запроса
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
            redirect: 'follow' // <--- САМОЕ ВАЖНОЕ: Автоматически следовать за редиректами
        };
        
        if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
            fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
        }
        
        // 4. Выполняем запрос
        const response = await fetch(fullUrl, fetchOptions);
        
        // 5. Обрабатываем ответ
        const contentType = response.headers.get('content-type');
        
        // Если вернулся JSON - отдаем его
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            return res.status(response.status).json(data);
        } 
        // Если вернулся HTML (например, страница Swagger/Документации), значит URL неверный
        else if (contentType && contentType.includes('text/html')) {
            console.warn('⚠️ API вернул HTML (скорее всего страницу Swagger). URL неверен.');
            return res.status(404).json({
                error: 'Endpoint Not Found',
                message: 'API returned HTML documentation instead of JSON. Check your URL path.',
                requestedUrl: fullUrl
            });
        }
        // Любой другой формат (текст, ошибки)
        else {
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
