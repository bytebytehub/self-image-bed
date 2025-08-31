import { StorageManager } from "../storage/StorageManager.js";
import { authMiddleware } from "../utils/auth";

// Helpers
function parseMaxFileSize(env) {
    const raw = env.MAX_FILE_SIZE || "50MB";
    const match = /^\s*(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?\s*$/i.exec(raw);
    if (!match) return 50 * 1024 * 1024;
    const value = parseFloat(match[1]);
    const unit = (match[2] || "MB").toUpperCase();
    const multipliers = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
    return Math.floor(value * (multipliers[unit] || multipliers.MB));
}

function parseAllowedTypes(env) {
    const raw = env.ALLOWED_FILE_TYPES || "image/jpeg,image/png,image/gif,image/webp";
    return raw.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
}

function isTypeAllowed(file, allowedList) {
    if (!allowedList || allowedList.length === 0) return true;
    const mime = (file.type || "").toLowerCase();
    const ext = (file.name || "").split(".").pop()?.toLowerCase() || "";
    return allowedList.some(t => mime === t || mime.startsWith(t + "/") || ext === t || t === "*/*");
}

function sanitizeFileInfo(file) {
    return {
        fileName: file?.name || "unknown",
        fileSize: file?.size || 0,
        fileType: file?.type || ""
    };
}

function ok(c, data, status = 200) {
    return c.json({ success: true, data }, status);
}

function fail(c, message, status = 400, details) {
    return c.json({ success: false, error: { message, ...(details ? { details } : {}) } }, status);
}

export async function apiUpload(c) {
    const env = c.env;
    try {
        const formData = await c.req.formData();
        const files = formData.getAll("file");
        if (!files || files.length === 0) {
            return fail(c, "未上传文件", 400);
        }

        const provider = formData.get("provider") || env.DEFAULT_STORAGE_PROVIDER || "telegram";
        const storageManager = new StorageManager(env);

        // Validation
        const maxSize = parseMaxFileSize(env);
        const allowed = parseAllowedTypes(env);

        const results = [];
        const errors = [];

        for (const file of files) {
            if (!file) continue;
            // Validate
            if (file.size > maxSize) {
                errors.push({ file: sanitizeFileInfo(file), error: `文件超出大小限制 (${maxSize} bytes)` });
                continue;
            }
            if (!isTypeAllowed(file, allowed)) {
                errors.push({ file: sanitizeFileInfo(file), error: "文件类型不被允许" });
                continue;
            }

            try {
                const result = await storageManager.uploadFile(file, { provider });
                results.push(result);
            } catch (e) {
                errors.push({ file: sanitizeFileInfo(file), error: e.message });
            }
        }

        if (files.length === 1) {
            if (results.length === 1) {
                const r = results[0];
                return ok(c, {
                    fileId: r.fileId,
                    url: r.url,
                    provider: r.provider,
                    size: r.size,
                    type: r.type,
                    fileName: r.originalName
                });
            }
            return fail(c, errors[0]?.error || "上传失败", 400, errors[0]);
        }

        const status = errors.length > 0 ? 207 : 200;
        return ok(c, {
            total: files.length,
            successCount: results.length,
            errorCount: errors.length,
            files: results.map(r => ({
                fileId: r.fileId,
                url: r.url,
                provider: r.provider,
                size: r.size,
                type: r.type,
                fileName: r.originalName
            })),
            errors
        }, status);
    } catch (e) {
        return fail(c, e.message || "服务器错误", 500);
    }
}

export async function apiUploadWithAuth(c) {
    // Wrap with auth; on success delegate to apiUpload
    return authMiddleware(c, () => apiUpload(c));
}

export async function getStorageProviders(c) {
    const env = c.env;
    try {
        const manager = new StorageManager(env);
        const available = manager.getAvailableProviders();
        const defaultProvider = env.DEFAULT_STORAGE_PROVIDER || "telegram";
        return ok(c, { default: defaultProvider, available });
    } catch (e) {
        return fail(c, e.message || "无法获取存储提供商", 500);
    }
}

export async function healthCheck(c) {
    const env = c.env;
    try {
        const manager = new StorageManager(env);
        const results = await manager.healthCheck();
        const unhealthy = Object.values(results).some((r) => (r?.status !== "healthy" && r?.status !== "ok"));
        const code = unhealthy ? 503 : 200;
        return c.json({ success: true, data: results }, code);
    } catch (e) {
        return fail(c, e.message || "健康检查失败", 500);
    }
}

export async function getUploadConfig(c) {
    const env = c.env;
    try {
        const maxFileSizeBytes = parseMaxFileSize(env);
        const allowedTypes = parseAllowedTypes(env);
        const defaultProvider = env.DEFAULT_STORAGE_PROVIDER || "telegram";
        const requireAuth = String(env.REQUIRE_AUTH_FOR_UPLOAD || "false").toLowerCase() === "true";
        return ok(c, {
            maxFileSize: maxFileSizeBytes,
            allowedTypes,
            defaultProvider,
            requireAuth
        });
    } catch (e) {
        return fail(c, e.message || "无法获取上传配置", 500);
    }
}

