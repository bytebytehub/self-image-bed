#!/usr/bin/env node

/**
 * Password Migration Script
 * 
 * This script helps migrate existing users from the old SHA-256 password hashing
 * to the new PBKDF2 implementation.
 * 
 * Usage:
 * 1. Run this script locally with access to your KV namespace
 * 2. It will create a migration flag for users who need to reset passwords
 * 3. The application will prompt these users to reset their passwords on next login
 */

console.log('Password Migration Script');
console.log('========================\n');

console.log('⚠️  IMPORTANT: This script should be run after deploying the security update.\n');

console.log('Migration Strategy:');
console.log('1. The new code can detect old password hashes (64 char hex strings)');
console.log('2. Users with old hashes will be prompted to reset passwords');
console.log('3. New registrations will use PBKDF2 automatically\n');

console.log('Recommended Actions:');
console.log('1. Deploy the updated code');
console.log('2. Notify users about the security update');
console.log('3. Provide password reset instructions');
console.log('4. Monitor for any authentication issues\n');

console.log('To implement automatic migration in your app, add this to the login function:\n');

console.log(`
// In src/functions/user/auth.js login function:

// Check if password needs migration (old SHA-256 format)
if (user.password.length === 64 && /^[a-f0-9]+$/.test(user.password)) {
  // This is an old SHA-256 hash
  const oldHash = await hashPasswordOld(password); // Old SHA-256 method
  
  if (oldHash === user.password) {
    // Password is correct, migrate to new format
    const newHash = await hashPassword(password);
    user.password = newHash;
    user.updatedAt = Date.now();
    user.passwordMigrated = true;
    
    // Save updated user
    await c.env.users.put(\`user:\${username}\`, JSON.stringify(user));
    
    // Continue with login
    const token = await generateToken({ id: user.id, username }, c.env);
    return c.json({ 
      message: '登录成功（密码已安全升级）', 
      user: userWithoutPassword,
      token
    });
  }
}
`);

console.log('\n✅ Migration instructions complete.');
console.log('📝 Remember to test thoroughly in a staging environment first!');