/**
 * 用户认证相关工具函数
 */

// 生成JWT令牌
export async function generateToken(payload, env) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 60 * 60 * 24 * 7; // 7天过期
  
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn
  };

  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(tokenPayload));
  
  const signature = await generateSignature(`${encodedHeader}.${encodedPayload}`, env.JWT_SECRET);
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// 验证JWT令牌
export async function verifyToken(token, env) {
  try {
    const [encodedHeader, encodedPayload, signature] = token.split('.');
    
    // 验证签名
    const expectedSignature = await generateSignature(`${encodedHeader}.${encodedPayload}`, env.JWT_SECRET);
    if (signature !== expectedSignature) {
      return { valid: false, message: '无效的令牌签名' };
    }
    
    // 解析载荷
    const payload = JSON.parse(atob(encodedPayload));
    
    // 检查令牌是否过期
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, message: '令牌已过期' };
    }
    
    return { valid: true, payload };
  } catch (error) {
    return { valid: false, message: '令牌解析错误' };
  }
}

// 生成签名
async function generateSignature(data, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );
  
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// 密码哈希函数 - 使用 PBKDF2 with salt
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  
  // 生成随机盐
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // 使用 PBKDF2 进行密钥派生
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  // 派生密钥 (100,000 iterations for security)
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  
  // 将盐和哈希组合存储
  const hashArray = new Uint8Array(derivedBits);
  const combined = new Uint8Array(salt.length + hashArray.length);
  combined.set(salt);
  combined.set(hashArray, salt.length);
  
  // 返回 base64 编码的结果
  return btoa(String.fromCharCode(...combined));
}

// 验证密码
export async function verifyPassword(password, hashedPassword) {
  const encoder = new TextEncoder();
  
  try {
    // 解码存储的哈希
    const combined = Uint8Array.from(atob(hashedPassword), c => c.charCodeAt(0));
    
    // 提取盐和哈希
    const salt = combined.slice(0, 16);
    const storedHash = combined.slice(16);
    
    // 使用相同的盐重新计算哈希
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );
    
    const hashArray = new Uint8Array(derivedBits);
    
    // 比较哈希值
    if (hashArray.length !== storedHash.length) return false;
    
    for (let i = 0; i < hashArray.length; i++) {
      if (hashArray[i] !== storedHash[i]) return false;
    }
    
    return true;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

// 认证中间件
export async function authMiddleware(c, next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: '未授权访问' }, 401);
  }
  
  const token = authHeader.substring(7);
  const { valid, payload, message } = await verifyToken(token, c.env);
  
  if (!valid) {
    return c.json({ error: message || '无效的令牌' }, 401);
  }
  
  // 将用户信息添加到请求上下文
  c.set('user', payload);
  
  return next();
}
