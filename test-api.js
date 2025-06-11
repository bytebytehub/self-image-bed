#!/usr/bin/env node

/**
 * API 测试脚本
 * 用于测试新的多存储后端和API上传功能
 */

const fs = require('fs');
const path = require('path');

// 配置
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8787';
const TEST_IMAGE_PATH = process.env.TEST_IMAGE_PATH || './test-image.jpg';
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN || '';

/**
 * 创建测试图片文件
 */
function createTestImage() {
    if (fs.existsSync(TEST_IMAGE_PATH)) {
        console.log('✅ 测试图片已存在:', TEST_IMAGE_PATH);
        return;
    }

    // 创建一个简单的测试图片 (1x1 像素的 JPEG)
    const jpegData = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
        0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
        0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
        0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
        0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
        0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
        0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
        0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xFF, 0xC4,
        0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x0C,
        0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0x8A, 0x00,
        0xFF, 0xD9
    ]);

    fs.writeFileSync(TEST_IMAGE_PATH, jpegData);
    console.log('✅ 创建测试图片:', TEST_IMAGE_PATH);
}

/**
 * 发送 HTTP 请求
 */
async function request(url, options = {}) {
    try {
        const response = await fetch(url, options);
        const data = await response.json();
        return { status: response.status, data };
    } catch (error) {
        return { status: 0, error: error.message };
    }
}

/**
 * 测试获取存储提供商列表
 */
async function testGetProviders() {
    console.log('\n🔍 测试获取存储提供商列表...');
    
    const result = await request(`${BASE_URL}/api/storage/providers`);
    
    if (result.status === 200) {
        console.log('✅ 获取存储提供商成功');
        console.log('   默认提供商:', result.data.data.default);
        console.log('   可用提供商:', result.data.data.available.join(', '));
    } else {
        console.log('❌ 获取存储提供商失败:', result.status, result.data || result.error);
    }
    
    return result;
}

/**
 * 测试健康检查
 */
async function testHealthCheck() {
    console.log('\n🏥 测试存储健康检查...');
    
    const result = await request(`${BASE_URL}/api/storage/health`);
    
    if (result.status === 200 || result.status === 503) {
        console.log('✅ 健康检查完成');
        Object.entries(result.data.data).forEach(([provider, status]) => {
            const icon = status.status === 'healthy' || status.status === 'ok' ? '✅' : '❌';
            console.log(`   ${icon} ${provider}: ${status.status} - ${status.message}`);
        });
    } else {
        console.log('❌ 健康检查失败:', result.status, result.data || result.error);
    }
    
    return result;
}

/**
 * 测试获取上传配置
 */
async function testGetUploadConfig() {
    console.log('\n⚙️ 测试获取上传配置...');
    
    const result = await request(`${BASE_URL}/api/upload/config`);
    
    if (result.status === 200) {
        console.log('✅ 获取上传配置成功');
        console.log('   最大文件大小:', result.data.data.maxFileSize);
        console.log('   默认提供商:', result.data.data.defaultProvider);
        console.log('   需要认证:', result.data.data.requireAuth);
    } else {
        console.log('❌ 获取上传配置失败:', result.status, result.data || result.error);
    }
    
    return result;
}

/**
 * 测试文件上传
 */
async function testUpload(provider = 'telegram', useAuth = false) {
    console.log(`\n📤 测试文件上传 (${provider}${useAuth ? ', 带认证' : ''})...`);
    
    if (!fs.existsSync(TEST_IMAGE_PATH)) {
        console.log('❌ 测试图片不存在:', TEST_IMAGE_PATH);
        return null;
    }
    
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(TEST_IMAGE_PATH);
    const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
    
    formData.append('file', blob, 'test-image.jpg');
    formData.append('provider', provider);
    
    const url = useAuth ? `${BASE_URL}/api/upload/auth` : `${BASE_URL}/api/upload`;
    const headers = {};
    
    if (useAuth && AUTH_TOKEN) {
        headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
    }
    
    const result = await request(url, {
        method: 'POST',
        headers: headers,
        body: formData
    });
    
    if (result.status === 200) {
        console.log('✅ 文件上传成功');
        console.log('   文件ID:', result.data.data.fileId);
        console.log('   文件URL:', result.data.data.url);
        console.log('   存储提供商:', result.data.data.provider);
        console.log('   文件大小:', result.data.data.size, 'bytes');
    } else {
        console.log('❌ 文件上传失败:', result.status, result.data || result.error);
    }
    
    return result;
}

/**
 * 测试批量上传
 */
async function testBatchUpload(provider = 'telegram') {
    console.log(`\n📤📤 测试批量文件上传 (${provider})...`);
    
    if (!fs.existsSync(TEST_IMAGE_PATH)) {
        console.log('❌ 测试图片不存在:', TEST_IMAGE_PATH);
        return null;
    }
    
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(TEST_IMAGE_PATH);
    
    // 添加多个文件
    for (let i = 1; i <= 3; i++) {
        const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
        formData.append('file', blob, `test-image-${i}.jpg`);
    }
    
    formData.append('provider', provider);
    
    const result = await request(`${BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData
    });
    
    if (result.status === 200 || result.status === 207) {
        console.log('✅ 批量上传完成');
        console.log('   总文件数:', result.data.data.total);
        console.log('   成功数:', result.data.data.successCount);
        console.log('   失败数:', result.data.data.errorCount);
        
        if (result.data.data.files.length > 0) {
            console.log('   上传的文件:');
            result.data.data.files.forEach((file, index) => {
                console.log(`     ${index + 1}. ${file.fileName} -> ${file.url}`);
            });
        }
        
        if (result.data.errors && result.data.errors.length > 0) {
            console.log('   错误信息:');
            result.data.errors.forEach((error, index) => {
                console.log(`     ${index + 1}. ${error.fileName}: ${error.error}`);
            });
        }
    } else {
        console.log('❌ 批量上传失败:', result.status, result.data || result.error);
    }
    
    return result;
}

/**
 * 主测试函数
 */
async function runTests() {
    console.log('🚀 开始 API 测试...');
    console.log('测试地址:', BASE_URL);
    
    // 创建测试图片
    createTestImage();
    
    // 运行测试
    await testGetProviders();
    await testHealthCheck();
    await testGetUploadConfig();
    
    // 测试上传 (使用默认提供商)
    await testUpload();
    
    // 如果有认证令牌，测试认证上传
    if (AUTH_TOKEN) {
        await testUpload('telegram', true);
    }
    
    // 测试批量上传
    await testBatchUpload();
    
    console.log('\n✅ 测试完成!');
    
    // 清理测试文件
    if (fs.existsSync(TEST_IMAGE_PATH)) {
        fs.unlinkSync(TEST_IMAGE_PATH);
        console.log('🧹 清理测试文件:', TEST_IMAGE_PATH);
    }
}

// 运行测试
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = {
    testGetProviders,
    testHealthCheck,
    testGetUploadConfig,
    testUpload,
    testBatchUpload
};
