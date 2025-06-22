/**
 * Storage Manager - 存储抽象层
 * 支持多种存储后端：Telegram, S3, MinIO, Supabase
 */

import { TelegramStorage } from './providers/TelegramStorage.js';
import { S3Storage } from './providers/S3Storage.js';
import { MinIOStorage } from './providers/MinIOStorage.js';
import { SupabaseStorage } from './providers/SupabaseStorage.js';

export class StorageManager {
    constructor(env) {
        this.env = env;
        this.providers = new Map();
        this.initializeProviders();
    }

    /**
     * 初始化所有存储提供商
     */
    initializeProviders() {
        // Telegram 存储
        if (this.env.TG_Bot_Token && this.env.TG_Chat_ID) {
            this.providers.set('telegram', new TelegramStorage(this.env));
        }

        // AWS S3 存储
        if (this.env.AWS_ACCESS_KEY_ID && this.env.AWS_SECRET_ACCESS_KEY && this.env.AWS_S3_BUCKET) {
            this.providers.set('s3', new S3Storage(this.env));
        }

        // MinIO 存储
        if (this.env.MINIO_ENDPOINT && this.env.MINIO_ACCESS_KEY && this.env.MINIO_SECRET_KEY && this.env.MINIO_BUCKET) {
            this.providers.set('minio', new MinIOStorage(this.env));
        }

        // Supabase 存储
        if (this.env.SUPABASE_URL && this.env.SUPABASE_ANON_KEY && this.env.SUPABASE_BUCKET) {
            this.providers.set('supabase', new SupabaseStorage(this.env));
        }
    }

    /**
     * 获取默认存储提供商
     */
    getDefaultProvider() {
        const defaultProvider = this.env.DEFAULT_STORAGE_PROVIDER || 'telegram';
        return this.getProvider(defaultProvider);
    }

    /**
     * 获取指定的存储提供商
     */
    getProvider(providerName) {
        const provider = this.providers.get(providerName);
        if (!provider) {
            throw new Error(`存储提供商 '${providerName}' 未配置或不可用`);
        }
        return provider;
    }

    /**
     * 获取所有可用的存储提供商列表
     */
    getAvailableProviders() {
        return Array.from(this.providers.keys());
    }

    /**
     * 检查存储提供商是否可用
     */
    isProviderAvailable(providerName) {
        return this.providers.has(providerName);
    }

    /**
     * 上传文件到指定存储提供商
     */
    async uploadFile(file, options = {}) {
        const providerName = options.provider || this.env.DEFAULT_STORAGE_PROVIDER || 'telegram';
        const provider = this.getProvider(providerName);
        
        console.log(`使用存储提供商: ${providerName}`);
        
        try {
            const result = await provider.uploadFile(file, options);
            
            // 添加提供商信息到结果中
            return {
                ...result,
                provider: providerName,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error(`存储提供商 ${providerName} 上传失败:`, error);
            throw new Error(`上传到 ${providerName} 失败: ${error.message}`);
        }
    }

    /**
     * 批量上传文件
     */
    async uploadFiles(files, options = {}) {
        const results = [];
        const errors = [];

        for (const file of files) {
            try {
                const result = await this.uploadFile(file, options);
                results.push(result);
            } catch (error) {
                console.error(`文件 ${file.name} 上传失败:`, error);
                errors.push({
                    fileName: file.name,
                    error: error.message
                });
            }
        }

        return {
            success: results,
            errors: errors,
            total: files.length,
            successCount: results.length,
            errorCount: errors.length
        };
    }

    /**
     * 删除文件
     */
    async deleteFile(fileId, providerName) {
        const provider = this.getProvider(providerName);
        return await provider.deleteFile(fileId);
    }

    /**
     * 获取文件URL
     */
    async getFileUrl(fileId, providerName, options = {}) {
        const provider = this.getProvider(providerName);
        return await provider.getFileUrl(fileId, options);
    }

    /**
     * 获取存储提供商统计信息
     */
    async getProviderStats(providerName) {
        const provider = this.getProvider(providerName);
        if (typeof provider.getStats === 'function') {
            return await provider.getStats();
        }
        return null;
    }

    /**
     * 健康检查 - 检查所有存储提供商状态
     */
    async healthCheck() {
        const results = {};
        
        for (const [name, provider] of this.providers) {
            try {
                if (typeof provider.healthCheck === 'function') {
                    results[name] = await provider.healthCheck();
                } else {
                    results[name] = { status: 'unknown', message: '未实现健康检查' };
                }
            } catch (error) {
                results[name] = { 
                    status: 'error', 
                    message: error.message 
                };
            }
        }
        
        return results;
    }
}

/**
 * 存储提供商基类
 * 所有存储提供商都应该继承此类并实现相应方法
 */
export class StorageProvider {
    constructor(env) {
        this.env = env;
    }

    /**
     * 上传文件 - 必须实现
     */
    async uploadFile(file, options = {}) {
        throw new Error('uploadFile 方法必须被实现');
    }

    /**
     * 删除文件 - 可选实现
     */
    async deleteFile(fileId) {
        throw new Error('deleteFile 方法未实现');
    }

    /**
     * 获取文件URL - 必须实现
     */
    async getFileUrl(fileId, options = {}) {
        throw new Error('getFileUrl 方法必须被实现');
    }

    /**
     * 健康检查 - 可选实现
     */
    async healthCheck() {
        return { status: 'ok', message: '健康检查通过' };
    }

    /**
     * 获取统计信息 - 可选实现
     */
    async getStats() {
        return null;
    }

    /**
     * 生成唯一文件ID
     */
    generateFileId(originalName) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const extension = originalName.split('.').pop().toLowerCase();
        return `${timestamp}_${random}.${extension}`;
    }

    /**
     * 验证文件类型
     */
    validateFileType(file, allowedTypes = []) {
        if (allowedTypes.length === 0) return true;
        
        const fileType = file.type.toLowerCase();
        const fileExtension = file.name.split('.').pop().toLowerCase();
        
        return allowedTypes.some(type => 
            fileType.includes(type) || fileExtension === type
        );
    }

    /**
     * 验证文件大小
     */
    validateFileSize(file, maxSize) {
        if (!maxSize) return true;
        return file.size <= maxSize;
    }
}
