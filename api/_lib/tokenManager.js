import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
});

const TOKEN_KEY = 'yummy:user_token';
const EXPIRY_KEY = 'yummy:token_expiry';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function login() {
    console.log('🔐 Логин...');
    
    if (!process.env.YUMMY_EMAIL || !process.env.YUMMY_PASSWORD) {
        throw new Error('❌ Не заданы переменные окружения (LOGIN/PASS)');
    }

    const response = await fetch('https://api.yani.tv/profile/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Application': process.env.YUMMY_APP_TOKEN,
            'User-Agent': USER_AGENT
        },
        body: JSON.stringify({
            login: process.env.YUMMY_EMAIL, 
            password: process.env.YUMMY_PASSWORD
        })
    });
    
    const text = await response.text();
    
    // Пытаемся распарсить JSON
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error(`Server returned non-JSON: ${text.substring(0, 100)}...`);
    }

    // ВАЖНО: Логируем ответ сервера, чтобы видеть проблемы в Vercel Logs
    console.log('📄 YANI RESPONSE:', JSON.stringify(data));

    if (!response.ok) {
        throw new Error(`Login failed (${response.status}): ${text}`);
    }

    // Ищем токен в разных возможных местах
    // 1. data.token (стандарт)
    // 2. data.response.token (иногда бывает вложен)
    const token = data.token || (data.response && data.response.token);

    if (!token) {
        // Если есть сообщение об ошибке в JSON
        if (data.error) {
            throw new Error(`API Error: ${JSON.stringify(data.error)}`);
        }
        throw new Error(`Token not found in response. Keys: ${Object.keys(data).join(', ')}`);
    }
    
    return token;
}

async function refreshToken(currentToken) {
    console.log('🔄 Обновление токена...');
    
    try {
        const response = await fetch('https://api.yani.tv/profile/token', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'X-Application': process.env.YUMMY_APP_TOKEN,
                'User-Agent': USER_AGENT
            }
        });
        
        if (!response.ok) return await login();
        
        const data = await response.json();
        const token = data.token || (data.response && data.response.token);
        
        if (!token) return await login();
        
        return token;
    } catch (e) {
        console.error('Refresh failed:', e);
        return await login();
    }
}

export async function getValidToken() {
    const savedToken = await redis.get(TOKEN_KEY);
    const savedExpiry = await redis.get(EXPIRY_KEY);
    const now = Date.now();
    
    // Если токен есть в кэше
    if (savedToken && savedExpiry && now < Number(savedExpiry)) {
        return savedToken;
    }
    
    // Получаем новый токен
    const newToken = await login();
    
    // ФИНАЛЬНАЯ ПРОВЕРКА: Если токен все равно пустой (null/undefined),
    // мы бросаем ошибку ЗДЕСЬ, чтобы не крашить Redis.
    if (!newToken) {
        throw new Error('CRITICAL: Login function returned null/undefined token');
    }
    
    const newExpiry = now + (2 * 24 * 60 * 60 * 1000); 
    
    await redis.set(TOKEN_KEY, newToken);
    await redis.set(EXPIRY_KEY, newExpiry);
    
    console.log('💾 Токен успешно сохранён');
    
    return newToken;
}
