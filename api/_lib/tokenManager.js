import { Redis } from '@upstash/redis';

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
});

const TOKEN_KEY = 'yummy:user_token';
const EXPIRY_KEY = 'yummy:token_expiry';

async function login() {
    console.log('🔐 Логин...');
    
    const response = await fetch('https://api.yani.tv/profile/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Application': process.env.YUMMY_APP_TOKEN
        },
        body: JSON.stringify({
            email: process.env.YUMMY_EMAIL,
            password: process.env.YUMMY_PASSWORD
        })
    });
    
    if (!response.ok) {
        throw new Error(`Login failed: ${response.status}`);
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
            'X-Application': process.env.YUMMY_APP_TOKEN
        }
    });
    
    if (!response.ok) {
        return await login();
    }
    
    const data = await response.json();
    return data.token;
}

export async function getValidToken() {
    const savedToken = await redis.get(TOKEN_KEY);
    const savedExpiry = await redis.get(EXPIRY_KEY);
    
    const now = Date.now();
    
    if (savedToken && savedExpiry && now < Number(savedExpiry)) {
        console.log('✅ Токен валиден');
        return savedToken;
    }
    
    let newToken;
    
    if (savedToken) {
        newToken = await refreshToken(savedToken);
    } else {
        newToken = await login();
    }
    
    const newExpiry = now + (2 * 24 * 60 * 60 * 1000); // 2 дня
    
    await redis.set(TOKEN_KEY, newToken);
    await redis.set(EXPIRY_KEY, newExpiry);
    
    console.log('💾 Токен сохранён');
    
    return newToken;
}