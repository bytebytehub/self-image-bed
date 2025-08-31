# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in TG-Image, please report it by emailing the maintainers. Please do not create public GitHub issues for security vulnerabilities.

## Security Measures Implemented

### 1. Authentication & Authorization
- JWT-based authentication with secure token generation
- PBKDF2 password hashing with salt (100,000 iterations)
- Secure session management
- Protected API endpoints with authentication middleware

### 2. Security Headers
The application implements comprehensive security headers:
- `X-Frame-Options: DENY` - Prevents clickjacking
- `X-Content-Type-Options: nosniff` - Prevents MIME type sniffing
- `X-XSS-Protection: 1; mode=block` - XSS protection for older browsers
- `Strict-Transport-Security` - Enforces HTTPS
- `Content-Security-Policy` - Controls resource loading
- `Referrer-Policy` - Controls referrer information
- `Permissions-Policy` - Restricts browser features

### 3. Rate Limiting
- API endpoints: 100 requests per minute per IP
- Upload endpoint: 20 requests per minute per IP
- Configurable limits based on endpoint sensitivity

### 4. Input Validation & Sanitization
- File type validation for uploads
- File size limits (default 50MB, configurable)
- Input sanitization to prevent XSS attacks
- SQL injection prevention through parameterized queries

### 5. CORS Configuration
- Configurable allowed origins
- Proper handling of preflight requests
- Credentials support with strict origin checking

### 6. Environment Variables
- Sensitive configuration moved to environment variables
- No hardcoded secrets in source code
- `.env.example` provided for configuration reference
- Proper `.gitignore` to prevent accidental commits

## Security Best Practices

### For Developers
1. Never commit sensitive data (tokens, passwords, keys)
2. Always use environment variables for configuration
3. Keep dependencies updated (`npm audit` regularly)
4. Use the provided security middleware
5. Validate and sanitize all user inputs
6. Log security events for monitoring

### For Deployment
1. Use strong, unique values for:
   - JWT_SECRET (minimum 32 characters)
   - Database passwords
   - API tokens
2. Enable HTTPS only
3. Configure Cloudflare security features:
   - DDoS protection
   - Web Application Firewall (WAF)
   - Bot management
4. Regular security audits
5. Monitor rate limiting and adjust as needed

## Security Checklist

Before deploying to production:

- [ ] All environment variables configured
- [ ] JWT_SECRET changed from default
- [ ] Telegram Bot Token secured
- [ ] HTTPS enforced
- [ ] Rate limiting configured
- [ ] Security headers verified
- [ ] Dependencies updated (`npm audit`)
- [ ] Input validation active
- [ ] Error messages don't leak sensitive info
- [ ] Logging configured (without sensitive data)

## Known Security Considerations

1. **File Upload Security**: Files are validated by type and size but additional virus scanning may be needed for production
2. **Rate Limiting**: Current implementation uses KV storage; consider Cloudflare's built-in rate limiting for production
3. **Content Validation**: Implement content moderation for public image hosting

## Compliance

This application includes features to support:
- GDPR compliance (user data management)
- Privacy protection (secure authentication)
- Data encryption (HTTPS, password hashing)

## Updates and Patches

- Security patches are released as soon as vulnerabilities are discovered
- Subscribe to repository notifications for security updates
- Regular dependency updates following semantic versioning

## Contact

For security concerns, contact the maintainers directly rather than creating public issues.