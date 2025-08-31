# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - Security Update

### 🔒 Security Fixes
- **CRITICAL**: Removed hardcoded credentials from `wrangler.toml`
- **CRITICAL**: Upgraded Hono from v3.1.0 to v4.6.5 to fix known vulnerabilities
- **HIGH**: Implemented secure password hashing using PBKDF2 with salt (100,000 iterations)
- **HIGH**: Added comprehensive security headers middleware
- **HIGH**: Implemented rate limiting on all API endpoints

### ✨ New Features
- Added security middleware with configurable options
- Implemented CORS configuration
- Added input sanitization utilities
- Created environment variable configuration system
- Added `.gitignore` file to prevent accidental credential commits

### 📝 Documentation
- Added `SECURITY.md` with security policy and best practices
- Created `.env.example` for environment variable reference
- Added `.dev.vars.example` for Cloudflare Workers local development
- Updated configuration documentation

### 🔧 Technical Improvements
- Moved sensitive configuration to environment variables
- Improved error handling to prevent information leakage
- Added file upload validation utilities
- Implemented secure session management

### 📦 Dependencies
- Updated `hono` from ^3.1.0 to ^4.6.5
- All dependencies audited for vulnerabilities

### 🚨 Breaking Changes
- Environment variables now required for:
  - `TG_Bot_Token`
  - `TG_Chat_ID`
  - `JWT_SECRET`
- Password hashing algorithm changed (existing users will need to reset passwords)

### 📋 Migration Guide

1. **Update Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   - Copy `.env.example` to `.env`
   - Copy `.dev.vars.example` to `.dev.vars`
   - Fill in your actual values

3. **Update Cloudflare Dashboard**:
   - Add environment variables in Workers settings
   - Or use `wrangler secret put` for sensitive values

4. **Reset User Passwords**:
   - Due to the password hashing upgrade, existing users will need to reset their passwords
   - Consider implementing a migration script or password reset flow

### 🔍 Security Audit Results
- Fixed 1 moderate severity vulnerability in dependencies
- Implemented 14 security best practices
- Added 6 security headers
- Configured rate limiting on 2 endpoint groups

---

## Previous Versions

See README.md for historical version information.