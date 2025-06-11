/**
 * Supabase 存储提供商
 * 使用 Supabase Storage 作为文件存储后端
 */

import { StorageProvider } from '../StorageManager.js';

export class SupabaseStorage extends StorageProvider {
    constructor(env) {
        super(env);
        this.supabaseUrl = env.SUPABASE_URL;
        this.anonKey = env.SUPABASE_ANON_KEY;
        this.serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
        this.bucket = env.SUPABASE_BUCKET;
        this.baseUrl = `${this.supabaseUrl}/storage/v1`;
        
        if (!this.supabaseUrl || !this.anonKey || !this.bucket) {
            throw new Error('Supabase 存储需要配置 SUPABASE_URL, SUPABASE_ANON_KEY 和 SUPABASE_BUCKET');
        }
    }

    async uploadFile(file, options = {}) {
        const fileName = options.fileName || this.generateFileId(file.name);
        const contentType = file.type || 'application/octet-stream';
        const path = options.prefix ? `${options.prefix}/${fileName}` : fileName;
        
        console.log(`Supabase 存储: 上传文件 ${fileName} 到 ${path}, 大小: ${file.size}`);

        try {
            const fileBuffer = await file.arrayBuffer();
            const uploadResult = await this.uploadToSupabase(path, fileBuffer, contentType, options);
            
            const publicUrl = this.getPublicUrl(path);
            
            return {
                fileId: path,
                originalName: file.name,
                size: file.size,
                type: contentType,
                url: publicUrl,
                provider: 'supabase',
                bucket: this.bucket,
                path: path,
                key: uploadResult.Key || path
            };
        } catch (error) {
            console.error('Supabase 上传失败:', error);
            throw new Error(`Supabase 上传失败: ${error.message}`);
        }
    }

    async uploadToSupabase(path, fileBuffer, contentType, options = {}) {
        const url = `${this.baseUrl}/object/${this.bucket}/${path}`;
        
        const headers = {
            'Authorization': `Bearer ${this.anonKey}`,
            'Content-Type': contentType,
            'apikey': this.anonKey
        };

        if (options.cacheControl) {
            headers['Cache-Control'] = options.cacheControl;
        }

        if (options.upsert) {
            headers['x-upsert'] = 'true';
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: fileBuffer
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Supabase 上传失败: ${response.status} ${errorData.message || response.statusText}`);
        }

        return await response.json();
    }

    getPublicUrl(path) {
        return `${this.supabaseUrl}/storage/v1/object/public/${this.bucket}/${path}`;
    }

    async getSignedUrl(path, expiresIn = 3600) {
        const url = `${this.baseUrl}/object/sign/${this.bucket}/${path}`;
        
        const headers = {
            'Authorization': `Bearer ${this.anonKey}`,
            'Content-Type': 'application/json',
            'apikey': this.anonKey
        };

        const body = {
            expiresIn: expiresIn
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`获取签名URL失败: ${response.status} ${errorData.message || response.statusText}`);
        }

        const data = await response.json();
        return `${this.supabaseUrl}${data.signedURL}`;
    }

    async deleteFile(fileId) {
        try {
            const url = `${this.baseUrl}/object/${this.bucket}/${fileId}`;
            
            const headers = {
                'Authorization': `Bearer ${this.serviceRoleKey || this.anonKey}`,
                'apikey': this.serviceRoleKey || this.anonKey
            };

            const response = await fetch(url, {
                method: 'DELETE',
                headers: headers
            });

            if (response.ok) {
                return { success: true, message: '文件删除成功' };
            } else {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`删除失败: ${response.status} ${errorData.message || response.statusText}`);
            }
        } catch (error) {
            console.error('Supabase 删除文件失败:', error);
            return { success: false, message: error.message };
        }
    }

    async getFileUrl(fileId, options = {}) {
        if (options.signed) {
            return await this.getSignedUrl(fileId, options.expiresIn || 3600);
        }
        
        return this.getPublicUrl(fileId);
    }

    async listFiles(prefix = '', limit = 100, offset = 0) {
        const url = `${this.baseUrl}/object/list/${this.bucket}`;
        
        const headers = {
            'Authorization': `Bearer ${this.anonKey}`,
            'Content-Type': 'application/json',
            'apikey': this.anonKey
        };

        const body = {
            limit: limit,
            offset: offset,
            prefix: prefix
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`列出文件失败: ${response.status} ${errorData.message || response.statusText}`);
        }

        return await response.json();
    }

    async healthCheck() {
        try {
            const files = await this.listFiles('', 1);
            
            return {
                status: 'healthy',
                message: 'Supabase Storage 连接正常',
                bucket: this.bucket,
                url: this.supabaseUrl
            };
        } catch (error) {
            return {
                status: 'error',
                message: `Supabase Storage 健康检查失败: ${error.message}`
            };
        }
    }

    async getStats() {
        try {
            const bucketInfo = await this.getBucketInfo();
            
            return {
                provider: 'supabase',
                bucket: this.bucket,
                url: this.supabaseUrl,
                bucketInfo: bucketInfo,
                limitations: {
                    maxFileSize: '50MB (免费版) / 5GB (付费版)',
                    supportedFormats: '所有格式',
                    deleteSupport: true,
                    signedUrlSupport: true
                }
            };
        } catch (error) {
            return {
                provider: 'supabase',
                bucket: this.bucket,
                error: error.message
            };
        }
    }

    async getBucketInfo() {
        try {
            const url = `${this.baseUrl}/bucket/${this.bucket}`;
            
            const headers = {
                'Authorization': `Bearer ${this.anonKey}`,
                'apikey': this.anonKey
            };

            const response = await fetch(url, {
                method: 'GET',
                headers: headers
            });

            if (response.ok) {
                return await response.json();
            } else {
                return null;
            }
        } catch (error) {
            console.error('获取存储桶信息失败:', error);
            return null;
        }
    }
}
