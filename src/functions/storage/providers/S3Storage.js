/**
 * AWS S3 存储提供商
 * 使用 AWS S3 作为文件存储后端
 */

import { StorageProvider } from '../StorageManager.js';

export class S3Storage extends StorageProvider {
    constructor(env) {
        super(env);
        this.accessKeyId = env.AWS_ACCESS_KEY_ID;
        this.secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
        this.region = env.AWS_REGION || 'us-east-1';
        this.bucket = env.AWS_S3_BUCKET;
        this.endpoint = env.AWS_S3_ENDPOINT || `https://s3.${this.region}.amazonaws.com`;
        this.publicUrl = env.AWS_S3_PUBLIC_URL || `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
        
        if (!this.accessKeyId || !this.secretAccessKey || !this.bucket) {
            throw new Error('S3 存储需要配置 AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY 和 AWS_S3_BUCKET');
        }
    }

    async uploadFile(file, options = {}) {
        const fileName = options.fileName || this.generateFileId(file.name);
        const contentType = file.type || 'application/octet-stream';
        const key = options.prefix ? `${options.prefix}/${fileName}` : fileName;
        
        console.log(`S3 存储: 上传文件 ${fileName} 到 ${key}, 大小: ${file.size}`);

        try {
            const fileBuffer = await file.arrayBuffer();
            const uploadResult = await this.putObject(key, fileBuffer, contentType, options);
            
            return {
                fileId: key,
                originalName: file.name,
                size: file.size,
                type: contentType,
                url: `${this.publicUrl}/${key}`,
                provider: 's3',
                bucket: this.bucket,
                key: key,
                etag: uploadResult.etag
            };
        } catch (error) {
            console.error('S3 上传失败:', error);
            throw new Error(`S3 上传失败: ${error.message}`);
        }
    }

    async putObject(key, body, contentType, options = {}) {
        const { url, host, canonicalUri, canonicalQueryString } = this.buildRequest('PUT', key);
        const date = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
        const dateStamp = date.substr(0, 8);
        
        const headers = {
            'Content-Type': contentType,
            'Content-Length': body.byteLength.toString(),
            'Host': host,
            'x-amz-date': date,
            'x-amz-content-sha256': await this.sha256(body)
        };

        if (options.public !== false) {
            headers['x-amz-acl'] = 'public-read';
        }

        const authorization = await this.generateSignature('PUT', canonicalUri, canonicalQueryString, headers, dateStamp);
        headers['Authorization'] = authorization;

        const response = await fetch(url, {
            method: 'PUT',
            headers: headers,
            body: body
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`S3 PUT 请求失败: ${response.status} ${errorText}`);
        }

        return {
            etag: response.headers.get('etag'),
            location: url
        };
    }

    async generateSignature(method, canonicalUri, canonicalQueryString, headers, dateStamp) {
        const service = 's3';
        const algorithm = 'AWS4-HMAC-SHA256';
        const credentialScope = `${dateStamp}/${this.region}/${service}/aws4_request`;
        
        const signedHeaders = Object.keys(headers)
            .map(h => h.toLowerCase())
            .sort()
            .join(';');
            
        const canonicalHeaders = Object.keys(headers)
            .map(h => h.toLowerCase())
            .sort()
            .map(h => `${h}:${headers[Object.keys(headers).find(k => k.toLowerCase() === h)]}\n`)
            .join('');

        const payloadHash = headers['x-amz-content-sha256'];
        
        const canonicalRequest = [
            method,
            canonicalUri,
            canonicalQueryString,
            canonicalHeaders,
            signedHeaders,
            payloadHash
        ].join('\n');

        const stringToSign = [
            algorithm,
            headers['x-amz-date'],
            credentialScope,
            await this.sha256(canonicalRequest)
        ].join('\n');

        const signingKey = await this.getSignatureKey(this.secretAccessKey, dateStamp, this.region, service);
        const signatureBytes = await this.hmacSha256(signingKey, stringToSign);
        const signatureHex = this.toHex(signatureBytes);
        
        return `${algorithm} Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signatureHex}`;
    }

    async getSignatureKey(key, dateStamp, regionName, serviceName) {
        const kDate = await this.hmacSha256(`AWS4${key}`, dateStamp);
        const kRegion = await this.hmacSha256(kDate, regionName);
        const kService = await this.hmacSha256(kRegion, serviceName);
        const kSigning = await this.hmacSha256(kService, 'aws4_request');
        return kSigning;
    }

    async hmacSha256(key, data) {
        const encoder = new TextEncoder();
        const keyData = typeof key === 'string' ? encoder.encode(key) : key;
        const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
        
        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        
        const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
        return new Uint8Array(signature);
    }

    toHex(bytes) {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async sha256(data) {
        const encoder = new TextEncoder();
        const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async deleteFile(fileId) {
        try {
            const { url, host, canonicalUri, canonicalQueryString } = this.buildRequest('DELETE', fileId);
            const date = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
            const dateStamp = date.substr(0, 8);
            
            const headers = {
                'Host': host,
                'x-amz-date': date,
                'x-amz-content-sha256': await this.sha256('')
            };

            const authorization = await this.generateSignature('DELETE', canonicalUri, canonicalQueryString, headers, dateStamp);
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
            console.error('S3 删除文件失败:', error);
            return { success: false, message: error.message };
        }
    }

    async getFileUrl(fileId, options = {}) {
        return `${this.publicUrl}/${fileId}`;
    }

    async healthCheck() {
        try {
            const { url, host, canonicalUri, canonicalQueryString } = this.buildRequest('GET', '', { 'max-keys': '1' });
            const date = new Date().toISOString().replace(/[:\-]|\.\d{3}/g, '');
            const dateStamp = date.substr(0, 8);
            
            const headers = {
                'Host': host,
                'x-amz-date': date,
                'x-amz-content-sha256': await this.sha256('')
            };

            const authorization = await this.generateSignature('GET', canonicalUri, canonicalQueryString, headers, dateStamp);
            headers['Authorization'] = authorization;

            const response = await fetch(url, {
                method: 'GET',
                headers: headers
            });

            if (response.ok) {
                return {
                    status: 'healthy',
                    message: 'S3 连接正常',
                    bucket: this.bucket,
                    region: this.region
                };
            } else {
                return {
                    status: 'unhealthy',
                    message: `S3 连接失败: ${response.status}`
                };
            }
        } catch (error) {
            return {
                status: 'error',
                message: `S3 健康检查失败: ${error.message}`
            };
        }
    }

    async getStats() {
        return {
            provider: 's3',
            bucket: this.bucket,
            region: this.region,
            endpoint: this.endpoint,
            limitations: {
                maxFileSize: '5TB',
                supportedFormats: '所有格式',
                deleteSupport: true
            }
        };
    }

    buildRequest(method, key = '', query = undefined) {
        const endpointUrl = new URL(this.endpoint);
        const endpointHost = endpointUrl.host;
        const protocol = endpointUrl.protocol || 'https:';
        const useVirtual = this.shouldUseVirtualHost();

        let host;
        let path;
        if (useVirtual) {
            // Virtual-hosted-style: bucket as subdomain
            host = `${this.bucket}.${endpointHost}`;
            path = `/${key}`.replace(/\/+$/, '/');
        } else {
            // Path-style
            host = endpointHost;
            path = `/${this.bucket}/${key}`.replace(/\/+$/, '/');
        }

        // Build canonical query string
        let canonicalQueryString = '';
        if (query && Object.keys(query).length > 0) {
            const sorted = Object.keys(query).sort();
            canonicalQueryString = sorted.map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`).join('&');
        }

        const url = `${protocol}//${host}${path}${canonicalQueryString ? `?${canonicalQueryString}` : ''}`;
        const canonicalUri = path;

        return { url, host, canonicalUri, canonicalQueryString };
    }

    shouldUseVirtualHost() {
        // Prefer virtual-hosted for AWS default endpoint; allow override via AWS_S3_VIRTUAL_HOST
        const endpointUrl = new URL(this.endpoint);
        const isAwsDefault = /(^|\.)s3[.-][a-z0-9-]+\.amazonaws\.com$/i.test(endpointUrl.host);
        const flag = this.env?.AWS_S3_VIRTUAL_HOST;
        if (typeof flag !== 'undefined') {
            return String(flag).toLowerCase() !== 'false';
        }
        return isAwsDefault;
    }
}
