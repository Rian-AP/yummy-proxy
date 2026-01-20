import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
});

const TOKEN_KEY = 'yummy:user_token';
const EXPIRY_KEY = 'yummy:token_expiry';

// Общий User-Agent для всех запросов
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function login() {
    console.log('🔐 Логин...');
    
    // Проверка наличия переменных перед запросом
    if (!process.env.YUMMY_EMAIL || !process.env.YUMMY_PASSWORD) {
        throw new Error('❌ Ошибка: Не заданы YUMMY_EMAIL или YUMMY_PASSWORD в переменных окружения.');
    }

    const response = await fetch('https://api.yani.tv/profile/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Application': process.env.YUMMY_APP_TOKEN,
            'User-Agent': USER_AGENT
        },
        body: JSON.stringify({
            // ИСПРАВЛЕНО: API требует поле 'login', а не 'email'
            login: process.env.YUMMY_EMAIL, 
            password: process.env.YUMMY_PASSWORD
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Ошибка логина (${response.status}):`, errorText);
        throw new Error(`Login failed: ${response.status} | Server: ${errorText}`);
    }
    
    const data = await response.json();
    return data.token;
}

async function refreshToken(currentToken) {
    console.log('🔄 Обновление токена...');
    
    const response = await fetch('https://api.yani.tv/profile/token', {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${currentToken}`,
            'X-Application': process.env.YUMMY_APP_TOKEN,
            'User-Agent': USER_AGENT
        }
    });
    
    if (!response.ok) {
        console.warn('⚠️ Не удалось обновить токен, пробуем полный ре-логин...');
        return await login();
    }
    
    const data = await response.json();
    return data.token;
}

export async function getValidToken() {
    // Пытаемся получить из Redis
    const savedToken = await redis.get(TOKEN_KEY);
    const savedExpiry = await redis.get(EXPIRY_KEY);
    
    const now = Date.now();
    
    // Если токен есть и он еще не просрочен
    if (savedToken && savedExpiry && now < Number(savedExpiry)) {
        // console.log('✅ Токен валиден (из кэша)');
        return savedToken;
    }
    
    let newToken;
    
    if (savedToken) {
        try {
            newToken = await refreshToken(savedToken);
        } catch (e) {
            console.error('Ошибка refresh, пробуем логин с нуля:', e);
            newToken = await login();
        }
    } else {
        newToken = await login();
    }
    
    // Сохраняем на 2 дня (API говорит обновлять каждые 2-3 дня)
    const newExpiry = now + (2 * 24 * 60 * 60 * 1000); 
    
    await redis.set(TOKEN_KEY, newToken);
    await redis.set(EXPIRY_KEY, newExpiry);
    
    console.log('💾 Новый токен сохранён в Redis');
    
    return newToken;
}
