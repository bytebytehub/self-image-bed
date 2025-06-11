/**
 * Telegram 存储提供商
 * 使用 Telegram Bot API 作为文件存储后端
 */

import { StorageProvider } from '../StorageManager.js';

export class TelegramStorage extends StorageProvider {
    constructor(env) {
        super(env);
        this.botToken = env.TG_Bot_Token;
        this.chatId = env.TG_Chat_ID;
        this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
        
        if (!this.botToken || !this.chatId) {
            throw new Error('Telegram 存储需要配置 TG_Bot_Token 和 TG_Chat_ID');
        }
    }

    /**
     * 上传文件到 Telegram
     */
    async uploadFile(file, options = {}) {
        const fileName = file.name;
        const fileExtension = fileName.split('.').pop().toLowerCase();
        
        console.log(`Telegram 存储: 上传文件 ${fileName}, 大小: ${file.size}`);

        // 检测文件类型并选择合适的 API 端点
        const { apiEndpoint, formFieldName } = this.getApiEndpoint(file);
        
        // 创建表单数据
        const formData = new FormData();
        formData.append("chat_id", this.chatId);
        formData.append(formFieldName, file);

        // 添加可选参数
        if (options.caption) {
            formData.append("caption", options.caption);
        }

        try {
            const result = await this.sendToTelegram(formData, apiEndpoint);
            
            if (!result.success) {
                throw new Error(result.error);
            }

            const fileId = this.extractFileId(result.data);
            if (!fileId) {
                throw new Error('无法从 Telegram 响应中提取文件ID');
            }

            const fileKey = `${fileId}.${fileExtension}`;
            
            return {
                fileId: fileKey,
                originalName: fileName,
                size: file.size,
                type: file.type,
                url: `/file/${fileKey}`,
                telegramFileId: fileId,
                provider: 'telegram'
            };
        } catch (error) {
            console.error('Telegram 上传失败:', error);
            throw error;
        }
    }

    /**
     * 根据文件类型选择合适的 API 端点
     */
    getApiEndpoint(file) {
        const fileType = file.type.toLowerCase();
        
        if (fileType.startsWith('image/')) {
            // 对于图片，使用 sendDocument 保持原图质量
            return { apiEndpoint: 'sendDocument', formFieldName: 'document' };
        } else if (fileType.startsWith('audio/')) {
            return { apiEndpoint: 'sendAudio', formFieldName: 'audio' };
        } else if (fileType.startsWith('video/')) {
            return { apiEndpoint: 'sendVideo', formFieldName: 'video' };
        } else {
            return { apiEndpoint: 'sendDocument', formFieldName: 'document' };
        }
    }

    /**
     * 发送文件到 Telegram
     */
    async sendToTelegram(formData, apiEndpoint, retryCount = 0) {
        const MAX_RETRIES = 2;
        const apiUrl = `${this.baseUrl}/${apiEndpoint}`;

        try {
            const response = await fetch(apiUrl, {
                method: "POST",
                body: formData
            });

            const responseData = await response.json();

            if (response.ok) {
                return { success: true, data: responseData };
            }

            return {
                success: false,
                error: responseData.description || 'Telegram API 请求失败'
            };
        } catch (error) {
            console.error('Telegram API 网络错误:', error);
            
            if (retryCount < MAX_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                return await this.sendToTelegram(formData, apiEndpoint, retryCount + 1);
            }
            
            return { success: false, error: '网络连接失败' };
        }
    }

    /**
     * 从 Telegram 响应中提取文件ID
     */
    extractFileId(response) {
        if (!response.ok || !response.result) return null;

        const result = response.result;
        
        // 按优先级检查不同类型的文件ID
        if (result.document) return result.document.file_id;
        if (result.video) return result.video.file_id;
        if (result.audio) return result.audio.file_id;
        if (result.photo) {
            // 对于照片，选择最大尺寸的版本
            return result.photo.reduce((prev, current) =>
                (prev.file_size > current.file_size) ? prev : current
            ).file_id;
        }

        return null;
    }

    /**
     * 获取文件的下载路径
     */
    async getFilePath(fileId) {
        try {
            const response = await fetch(`${this.baseUrl}/getFile?file_id=${fileId}`);
            const data = await response.json();
            
            if (data.ok && data.result && data.result.file_path) {
                return data.result.file_path;
            }
            
            return null;
        } catch (error) {
            console.error('获取 Telegram 文件路径失败:', error);
            return null;
        }
    }

    /**
     * 获取文件URL
     */
    async getFileUrl(fileId, options = {}) {
        // 如果是包含扩展名的文件ID，提取真实的文件ID
        const realFileId = fileId.includes('.') ? fileId.split('.')[0] : fileId;
        
        const filePath = await this.getFilePath(realFileId);
        if (!filePath) {
            throw new Error('无法获取文件路径');
        }

        return `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;
    }

    /**
     * 删除文件 (Telegram 不支持删除已发送的文件)
     */
    async deleteFile(fileId) {
        // Telegram Bot API 不支持删除已发送的文件
        console.warn('Telegram 存储不支持删除文件操作');
        return { success: false, message: 'Telegram 不支持删除已上传的文件' };
    }

    /**
     * 健康检查
     */
    async healthCheck() {
        try {
            const response = await fetch(`${this.baseUrl}/getMe`);
            const data = await response.json();
            
            if (data.ok) {
                return {
                    status: 'healthy',
                    message: 'Telegram Bot 连接正常',
                    botInfo: {
                        username: data.result.username,
                        firstName: data.result.first_name
                    }
                };
            } else {
                return {
                    status: 'unhealthy',
                    message: `Telegram API 错误: ${data.description}`
                };
            }
        } catch (error) {
            return {
                status: 'error',
                message: `连接 Telegram API 失败: ${error.message}`
            };
        }
    }

    /**
     * 获取统计信息
     */
    async getStats() {
        try {
            const chatInfo = await this.getChatInfo();
            return {
                provider: 'telegram',
                chatId: this.chatId,
                chatInfo: chatInfo,
                limitations: {
                    maxFileSize: '50MB (文档) / 20MB (照片)',
                    supportedFormats: '所有格式',
                    deleteSupport: false
                }
            };
        } catch (error) {
            return {
                provider: 'telegram',
                error: error.message
            };
        }
    }

    /**
     * 获取聊天信息
     */
    async getChatInfo() {
        try {
            const response = await fetch(`${this.baseUrl}/getChat?chat_id=${this.chatId}`);
            const data = await response.json();
            
            if (data.ok) {
                return {
                    type: data.result.type,
                    title: data.result.title || data.result.first_name,
                    username: data.result.username
                };
            }
            
            return null;
        } catch (error) {
            console.error('获取聊天信息失败:', error);
            return null;
        }
    }
}
