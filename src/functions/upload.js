import { errorHandling, telemetryData } from "./utils/middleware";
import { authMiddleware } from "./utils/auth";
import { StorageManager } from "./storage/StorageManager.js";

// 添加认证中间件包装
export const authenticatedUpload = async (c) => {
    // 检查是否有认证头
    const authHeader = c.req.header('Authorization');

    // 如果有认证头，验证用户
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authMiddleware(c, () => upload(c));
    }

    // 如果没有认证头，允许匿名上传
    return upload(c);
};

export async function upload(c) {
    const env = c.env;
    // 获取用户信息（如果已认证）
    const user = c.get('user');
    const userId = user ? user.id : null;

    // 受限调试日志（避免记录敏感信息）
    const debug = String(env.DEBUG || 'false').toLowerCase() === 'true';
    if (debug) {
        console.log('上传请求 - 用户状态:', user ? '已登录' : '未登录');
    }

    try {
        const formData = await c.req.formData();

        // 错误处理和遥测数据
        await errorHandling(c);
        telemetryData(c);

        // 检查是否是批量上传
        const files = formData.getAll('file');
        if (!files || files.length === 0) {
            throw new Error('未上传文件');
        }

        if (debug) console.log(`接收到${files.length}个文件上传请求`);

        // 初始化存储管理器
        const storageManager = new StorageManager(env);

        // 获取存储提供商选择 (默认使用 Telegram 保持向后兼容)
        const provider = formData.get('provider') || env.DEFAULT_STORAGE_PROVIDER || 'telegram';

        // 读取并解析上传限制
        const maxFileSize = (() => {
            const raw = env.MAX_FILE_SIZE || '50MB';
            const m = /^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i.exec(raw);
            if (!m) return 50 * 1024 * 1024;
            const value = parseFloat(m[1]);
            const unit = (m[2] || 'MB').toUpperCase();
            const map = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
            return Math.floor(value * (map[unit] || map.MB));
        })();

        const allowedTypes = (env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,image/webp')
            .split(',')
            .map(s => s.trim().toLowerCase())
            .filter(Boolean);

        // 处理所有文件上传
        const uploadResults = [];
        const validationErrors = [];
        for (const uploadFile of files) {
            if (!uploadFile) continue;

            const fileName = uploadFile.name;
            if (debug) console.log(`处理文件: ${fileName}, 类型: ${uploadFile.type}, 大小: ${uploadFile.size}`);

            // 校验大小
            if (uploadFile.size > maxFileSize) {
                validationErrors.push({ fileName, error: `文件超过大小限制 (${maxFileSize} bytes)` });
                continue;
            }

            // 校验类型
            const mime = (uploadFile.type || '').toLowerCase();
            const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
            const typeAllowed = allowedTypes.length === 0 || allowedTypes.some(t => t === mime || mime.startsWith(t + '/') || t === ext || t === '*/*');
            if (!typeAllowed) {
                validationErrors.push({ fileName, error: '文件类型不被允许' });
                continue;
            }

            try {
                // 使用新的存储管理器上传文件
                const result = await storageManager.uploadFile(uploadFile, {
                    provider: provider,
                    metadata: {
                        userId: userId || "anonymous",
                        uploadedBy: user ? (user.username || user.email) : "anonymous"
                    }
                });

                const fileKey = result.fileId;
                const timestamp = result.timestamp || Date.now();

                if (debug) console.log(`文件 ${fileName} 上传成功，文件键: ${fileKey}`);

                // 保存文件元数据到 KV 存储
                if (env.img_url) {
                    const metadata = {
                        TimeStamp: timestamp,
                        ListType: "None",
                        Label: "None",
                        liked: false,
                        fileName: fileName,
                        fileSize: uploadFile.size,
                        fileType: uploadFile.type,
                        provider: result.provider,
                        userId: userId || "anonymous"
                    };

                    // 单文件元数据索引：file:{fileKey}
                    await env.img_url.put(`file:${fileKey}`, "", { metadata });

                    // 如果是已登录用户，将文件添加到用户的文件列表中
                    if (userId) {
                        // 将文件ID追加到分片列表中以便分页：user:{userId}:files:index
                        const indexKey = `user:${userId}:files:index`;
                        const index = await env.img_url.get(indexKey, { type: 'json' }) || { ids: [], total: 0 };
                        index.ids.push(fileKey);
                        index.total = (index.total || 0) + 1;
                        await env.img_url.put(indexKey, JSON.stringify(index));

                        // 为该用户建立条目 key：user:{userId}:file:{fileKey}
                        const userFileKey = `user:${userId}:file:${fileKey}`;
                        const userFileValue = JSON.stringify({
                            id: fileKey,
                            fileName: fileName,
                            fileSize: uploadFile.size,
                            fileType: uploadFile.type,
                            provider: result.provider,
                            uploadTime: timestamp,
                            url: result.url
                        });
                        await env.img_url.put(userFileKey, userFileValue);
                    } else {
                        if (debug) console.log('匿名上传，不关联用户');
                    }
                }

                // 添加到上传结果 (保持原有格式以兼容前端)
                uploadResults.push({ 'src': result.url });
            } catch (error) {
                console.error(`文件 ${fileName} 上传失败:`, error?.message || String(error));
                // 继续处理其他文件
                continue;
            }
        }

        if (validationErrors.length && uploadResults.length === 0) {
            return c.json({ error: '部分或全部文件校验失败', details: validationErrors }, 400);
        }

        if (debug) console.log(`成功上传${uploadResults.length}个文件`);
        return c.json(uploadResults);
    } catch (error) {
        console.error('上传错误:', error);
        return c.json({ error: error.message }, 500);
    }
}

/**
 * 获取上传文件的ID
 * 对于图片，我们现在使用document类型上传以保持原图质量
 */
function getFileId(response) {
    if (!response.ok || !response.result) return null;

    const result = response.result;
    // 保留photo处理逻辑以兼容旧数据，但新上传的图片会走document逻辑
    if (result.photo) {
        return result.photo.reduce((prev, current) =>
            (prev.file_size > current.file_size) ? prev : current
        ).file_id;
    }
    if (result.document) return result.document.file_id;
    if (result.video) return result.video.file_id;
    if (result.audio) return result.audio.file_id;

    return null;
}

async function sendToTelegram(formData, apiEndpoint, env, retryCount = 0) {
    const MAX_RETRIES = 2;
    const apiUrl = `https://api.telegram.org/bot${env.TG_Bot_Token}/${apiEndpoint}`;

    try {
        const response = await fetch(apiUrl, { method: "POST", body: formData });
        const responseData = await response.json();

        if (response.ok) {
            return { success: true, data: responseData };
        }

        // 不再需要从sendPhoto转为sendDocument的重试逻辑，因为我们直接使用sendDocument

        return {
            success: false,
            error: responseData.description || '上传到Telegram失败'
        };
    } catch (error) {
        console.error('网络错误:', error);
        if (retryCount < MAX_RETRIES) {
            // 网络错误时的重试逻辑保留
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return await sendToTelegram(formData, apiEndpoint, env, retryCount + 1);
        }
        return { success: false, error: '发生网络错误' };
    }
}