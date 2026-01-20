import { getValidToken } from './_lib/tokenManager.js';

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    try {
        // 1. Получаем путь
        // Запрос: /api/anime/123/reviews
        // path = ['anime', '123', 'reviews']
        const pathArray = req.query.path || [];
        const apiPath = '/' + pathArray.join('/');
        
        // 2. Собираем query параметры
        const queryParams = { ...req.query };
        delete queryParams.path; // Убираем служебный параметр
        
        const queryString = new URLSearchParams(queryParams).toString();
        const fullUrl = `https://api.yani.tv${apiPath}${queryString ? '?' + queryString : ''}`;
        
        console.log(`📡 ${req.method} ${fullUrl}`);
        
        // 3. Получаем токен
        const token = await getValidToken();
        
        // 4. Делаем запрос к YummyAnime
        const fetchOptions = {
            method: req.method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'X-Application': process.env.YUMMY_APP_TOKEN,
                'Accept': 'image/avif,image/webp',
                'Lang': req.headers['lang'] || 'ru',
                'Content-Type': 'application/json'
            }
        };
        
        // Если есть тело запроса (POST, PUT, PATCH)
        if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
            fetchOptions.body = JSON.stringify(req.body);
        }
        
        const response = await fetch(fullUrl, fetchOptions);
        
        // 5. Обрабатываем ответ
        const contentType = response.headers.get('content-type');
        
        if (contentType?.includes('application/json')) {
            const data = await response.json();
            res.status(response.status).json(data);
        } else {
            const text = await response.text();
            res.status(response.status).send(text);
        }
        
    } catch (error) {
        console.error('❌ Proxy error:', error);
        res.status(500).json({ 
            error: 'Proxy Error', 
            message: error.message 
        });
    }
}