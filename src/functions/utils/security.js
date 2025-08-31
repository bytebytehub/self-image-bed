/**
 * Security middleware and utilities
 */

/**
 * Security headers middleware
 * Adds essential security headers to all responses
 */
export async function securityHeaders(c, next) {
  await next();
  
  // Prevent clickjacking attacks
  c.header('X-Frame-Options', 'DENY');
  
  // Prevent MIME type sniffing
  c.header('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection in older browsers
  c.header('X-XSS-Protection', '1; mode=block');
  
  // Enforce HTTPS
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  
  // Basic Content Security Policy
  // Adjust based on your application's needs
  c.header('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
    "img-src 'self' data: https: blob:; " +
    "font-src 'self' data: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
    "connect-src 'self' https://api.telegram.org; " +
    "frame-ancestors 'none';"
  );
  
  // Referrer Policy
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions Policy (formerly Feature Policy)
  c.header('Permissions-Policy', 
    'camera=(), microphone=(), geolocation=(), payment=()'
  );
}

/**
 * CORS configuration middleware
 * Configure Cross-Origin Resource Sharing
 */
export async function corsMiddleware(c, next) {
  const origin = c.req.header('Origin');
  
  // Configure allowed origins (adjust based on your needs)
  const allowedOrigins = [
    'http://localhost:8787',
    'http://localhost:3000',
    // Add your production domains here
  ];
  
  // Check if the origin is allowed
  if (origin && (allowedOrigins.includes(origin) || origin.startsWith('http://localhost:'))) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Credentials', 'true');
  }
  
  // Handle preflight requests
  if (c.req.method === 'OPTIONS') {
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    c.header('Access-Control-Max-Age', '86400');
    return c.text('', 204);
  }
  
  await next();
}

/**
 * Rate limiting middleware
 * Basic rate limiting using Cloudflare KV
 */
export async function rateLimiter(options = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute
    max = 100, // limit each IP to 100 requests per windowMs
    keyPrefix = 'rate_limit',
    skipSuccessfulRequests = false,
  } = options;
  
  return async function(c, next) {
    // Get client IP
    const ip = c.req.header('CF-Connecting-IP') || 
                c.req.header('X-Forwarded-For') || 
                'unknown';
    
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    try {
      // Get current request count from KV
      const data = await c.env.img_url.get(key, 'json');
      
      let requests = [];
      if (data && Array.isArray(data)) {
        // Filter out old requests outside the window
        requests = data.filter(timestamp => timestamp > windowStart);
      }
      
      // Check if limit exceeded
      if (requests.length >= max) {
        c.status(429);
        return c.json({
          error: 'Too many requests',
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }
      
      // Add current request timestamp
      requests.push(now);
      
      // Store updated request list with expiration
      await c.env.img_url.put(key, JSON.stringify(requests), {
        expirationTtl: Math.ceil(windowMs / 1000)
      });
      
      // Add rate limit headers
      c.header('X-RateLimit-Limit', String(max));
      c.header('X-RateLimit-Remaining', String(max - requests.length));
      c.header('X-RateLimit-Reset', String(new Date(now + windowMs).toISOString()));
      
      await next();
    } catch (error) {
      console.error('Rate limiting error:', error);
      // Continue without rate limiting on error
      await next();
    }
  };
}

/**
 * Input sanitization utility
 * Sanitize user input to prevent XSS and injection attacks
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  
  // Remove any HTML tags
  let sanitized = input.replace(/<[^>]*>/g, '');
  
  // Escape special characters
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
  
  // Remove any potential script injections
  sanitized = sanitized.replace(/javascript:/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=/gi, '');
  
  return sanitized.trim();
}

/**
 * Validate file upload
 * Check file type and size
 */
export function validateFileUpload(file, options = {}) {
  const {
    maxSize = 50 * 1024 * 1024, // 50MB default
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp']
  } = options;
  
  const errors = [];
  
  // Check file size
  if (file.size > maxSize) {
    errors.push(`File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`);
  }
  
  // Check MIME type
  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    errors.push(`File type '${file.type}' is not allowed`);
  }
  
  // Check file extension
  const fileName = file.name || '';
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
    errors.push(`File extension '${extension}' is not allowed`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}