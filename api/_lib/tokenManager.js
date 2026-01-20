import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
});

const TOKEN_KEY = 'yummy:user_token';
const EXPIRY_KEY = 'yummy:token_expiry';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function login() {
    console.log('🔐 Логин (Этап 1)...');
    
    if (!process.env.YUMMY_EMAIL || !process.env.YUMMY_PASSWORD) {
        throw new Error('❌ Не заданы переменные окружения (LOGIN/PASS)');
    }

    // 1. Первый запрос - отправляем логин/пароль
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
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error(`Server returned non-JSON: ${text}`);
    }

    console.log('📄 Ответ логина:', JSON.stringify(data));

    // Проверяем, пришел ли токен сразу
    let token = data.token || (data.response && data.response.token);

    // ЕСЛИ ТОКЕНА НЕТ, НО ЕСТЬ SUCCESS -> ПРОБУЕМ ЧЕРЕЗ COOKIE
    if (!token && data.response && data.response.success === true) {
        console.log('⚠️ Токен не пришел сразу. Пробуем получить через Cookie...');
        
        // Получаем куки из заголовков
        const cookies = response.headers.get('set-cookie');
        
        if (!cookies) {
            throw new Error('Login success, but no Token and no Cookies returned.');
        }

        console.log('🍪 Куки получены, запрашиваем токен (Этап 2)...');

        // 2. Второй запрос - обмениваем куки на токен
        const tokenResponse = await fetch('https://api.yani.tv/profile/token', {
            method: 'GET',
            headers: {
                'Cookie': cookies, // Передаем полученные куки
                'X-Application': process.env.YUMMY_APP_TOKEN,
                'User-Agent': USER_AGENT
            }
        });

        const tokenText = await tokenResponse.text();
        const tokenData = JSON.parse(tokenText);
        
        console.log('📄 Ответ получения токена:', JSON.stringify(tokenData));
        
        token = tokenData.token || (tokenData.response && tokenData.response.token);
    }

    if (!token) {
        throw new Error(`Не удалось получить токен ни напрямую, ни через Cookie. Ответ: ${JSON.stringify(data)}`);
    }
    
    return token;
}

// ... остальной код refreshToken и getValidToken остаётся тем же, 
// но лучше скопировать файл целиком ниже, чтобы ничего не потерять.

async function refreshToken(currentToken) {
    // В данной реализации refreshToken может быть не так важен, 
    // если мы просто перелогиниваемся, но оставим для совместимости.
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
        return token || await login();
    } catch (e) {
        return await login();
    }
}

export async function getValidToken() {
    const savedToken = await redis.get(TOKEN_KEY);
    const savedExpiry = await redis.get(EXPIRY_KEY);
    const now = Date.now();
    
    if (savedToken && savedExpiry && now < Number(savedExpiry)) {
        return savedToken;
    }
    
    const newToken = await login();
    
    if (!newToken) throw new Error('CRITICAL: Token is null');
    
    const newExpiry = now + (2 * 24 * 60 * 60 * 1000); 
    await redis.set(TOKEN_KEY, newToken);
    await redis.set(EXPIRY_KEY, newExpiry);
    
    console.log('💾 Токен успешно сохранён');
    return newToken;
}
