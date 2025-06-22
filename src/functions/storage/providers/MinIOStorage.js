/**
 * MinIO 存储提供商
 * 使用 MinIO (S3兼容) 作为文件存储后端
 */

import { StorageProvider } from '../StorageManager.js';

export class MinIOStorage extends StorageProvider {
    constructor(env) {
        super(env);
        this.endpoint = env.MINIO_ENDPOINT;
        this.accessKey = env.MINIO_ACCESS_KEY;
        this.secretKey = env.MINIO_SECRET_KEY;
        this.bucket = env.MINIO_BUCKET;
        this.region = env.MINIO_REGION || 'us-east-1';
        this.useSSL = env.MINIO_USE_SSL !== 'false';
        this.port = env.MINIO_PORT ? parseInt(env.MINIO_PORT) : (this.useSSL ? 443 : 80);
        
        const protocol = this.useSSL ? 'https' : 'http';
        const portSuffix = (this.useSSL && this.port === 443) || (!this.useSSL && this.port === 80) ? '' : `:${this.port}`;
        this.baseUrl = `${protocol}://${this.endpoint}${portSuffix}`;
        
        if (!this.endpoint || !this.accessKey || !this.secretKey || !this.bucket) {
            throw new Error('MinIO 存储需要配置 MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY 和 MINIO_BUCKET');
        }
    }

    async uploadFile(file, options = {}) {
        const fileName = options.fileName || this.generateFileId(file.name);
        const contentType = file.type || 'application/octet-stream';
        const key = options.prefix ? `${options.prefix}/${fileName}` : fileName;
        
        console.log(`MinIO 存储: 上传文件 ${fileName} 到 ${key}, 大小: ${file.size}`);

        try {
            const fileBuffer = await file.arrayBuffer();
            const uploadResult = await this.putObject(key, fileBuffer, contentType, options);
            
            return {
                fileId: key,
                originalName: file.name,
                size: file.size,
                type: contentType,
                url: `${this.baseUrl}/${this.bucket}/${key}`,
                provider: 'minio',
                bucket: this.bucket,
                key: key,
                etag: uploadResult.etag
            };
        } catch (error) {
            console.error('MinIO 上传失败:', error);
            throw new Error(`MinIO 上传失败: ${error.message}`);
        }
    }

    async putObject(key, body, contentType, options = {}) {
        const url = `${this.baseUrl}/${this.bucket}/${key}`;
        const date = new Date();
        const dateString = date.toUTCString();
        
        const headers = {
            'Content-Type': contentType,
            'Content-Length': body.byteLength.toString(),
            'Date': dateString,
            'Host': `${this.endpoint}${this.port !== 80 && this.port !== 443 ? `:${this.port}` : ''}`
        };

        if (options.metadata) {
            for (const [key, value] of Object.entries(options.metadata)) {
                headers[`x-amz-meta-${key}`] = value;
            }
        }

        const authorization = await this.generateAuthorization('PUT', key, headers, body);
        headers['Authorization'] = authorization;

        const response = await fetch(url, {
            method: 'PUT',
            headers: headers,
            body: body
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`MinIO PUT 请求失败: ${response.status} ${errorText}`);
        }

        return {
            etag: response.headers.get('etag'),
            location: url
        };
    }

    async generateAuthorization(method, key, headers, body) {
        const contentMD5 = '';
        const contentType = headers['Content-Type'] || '';
        const date = headers['Date'];
        
        const amzHeaders = Object.keys(headers)
            .filter(h => h.toLowerCase().startsWith('x-amz-'))
            .sort()
            .map(h => `${h.toLowerCase()}:${headers[h]}`)
            .join('\n');
        
        const canonicalizedAmzHeaders = amzHeaders ? amzHeaders + '\n' : '';
        const canonicalizedResource = `/${this.bucket}/${key}`;
        
        const stringToSign = [
            method,
            contentMD5,
            contentType,
            date,
            canonicalizedAmzHeaders + canonicalizedResource
        ].join('\n');

        const signature = await this.hmacSha1(this.secretKey, stringToSign);
        
        return `AWS ${this.accessKey}:${signature}`;
    }

    async hmacSha1(key, data) {
        const encoder = new TextEncoder();
        const keyData = encoder.encode(key);
        const dataBuffer = encoder.encode(data);
        
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-1' },
            false,
            ['sign']
        );
        
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
        const signatureArray = Array.from(new Uint8Array(signature));
        return btoa(String.fromCharCode(...signatureArray));
    }

    async deleteFile(fileId) {
        try {
            const url = `${this.baseUrl}/${this.bucket}/${fileId}`;
            const date = new Date().toUTCString();
            
            const headers = {
                'Date': date,
                'Host': `${this.endpoint}${this.port !== 80 && this.port !== 443 ? `:${this.port}` : ''}`
            };

            const authorization = await this.generateAuthorization('DELETE', fileId, headers, new ArrayBuffer(0));
            headers['Authorization'] = authorization;

            const response = await fetch(url, {
                method: 'DELETE',
                headers: headers
            });

            if (response.ok || response.status === 404) {
                return { success: true, message: '文件删除成功' };
            } else {
                const errorText = await response.text();
                throw new Error(`删除失败: ${response.status} ${errorText}`);
            }
        } catch (error) {
            console.error('MinIO 删除文件失败:', error);
            return { success: false, message: error.message };
        }
    }

    async getFileUrl(fileId, options = {}) {
        if (options.signed) {
            return await this.generatePresignedUrl(fileId, options.expiresIn || 3600);
        }
        
        return `${this.baseUrl}/${this.bucket}/${fileId}`;
    }

    async generatePresignedUrl(key, expiresIn = 3600) {
        const expires = Math.floor(Date.now() / 1000) + expiresIn;
        const method = 'GET';
        const canonicalizedResource = `/${this.bucket}/${key}`;
        
        const stringToSign = [
            method,
            '',
            '',
            expires,
            canonicalizedResource
        ].join('\n');

        const signature = await this.hmacSha1(this.secretKey, stringToSign);
        const encodedSignature = encodeURIComponent(signature);
        
        return `${this.baseUrl}/${this.bucket}/${key}?AWSAccessKeyId=${this.accessKey}&Expires=${expires}&Signature=${encodedSignature}`;
    }

    async healthCheck() {
        try {
            const url = `${this.baseUrl}/${this.bucket}?max-keys=1`;
            const date = new Date().toUTCString();
            
            const headers = {
                'Date': date,
                'Host': `${this.endpoint}${this.port !== 80 && this.port !== 443 ? `:${this.port}` : ''}`
            };

            const authorization = await this.generateAuthorization('GET', '', headers, new ArrayBuffer(0));
            headers['Authorization'] = authorization;

            const response = await fetch(url, {
                method: 'GET',
                headers: headers
            });

            if (response.ok) {
                return {
                    status: 'healthy',
                    message: 'MinIO 连接正常',
                    bucket: this.bucket,
                    endpoint: this.endpoint
                };
            } else {
                return {
                    status: 'unhealthy',
                    message: `MinIO 连接失败: ${response.status}`
                };
            }
        } catch (error) {
            return {
                status: 'error',
                message: `MinIO 健康检查失败: ${error.message}`
            };
        }
    }

    async getStats() {
        return {
            provider: 'minio',
            bucket: this.bucket,
            endpoint: this.endpoint,
            useSSL: this.useSSL,
            port: this.port,
            limitations: {
                maxFileSize: '5TB',
                supportedFormats: '所有格式',
                deleteSupport: true,
                presignedUrlSupport: true
            }
        };
    }
}
