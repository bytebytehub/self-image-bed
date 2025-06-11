# 多存储后端配置指南

本项目现在支持多种存储后端，包括 Telegram、AWS S3、MinIO 和 Supabase Storage。

## 🚀 新功能

### 1. 多存储后端支持
- **Telegram** (默认) - 使用 Telegram Bot API 存储文件
- **AWS S3** - 使用 Amazon S3 存储服务
- **MinIO** - 使用 MinIO (S3兼容) 存储服务
- **Supabase** - 使用 Supabase Storage 存储服务

### 2. API 上传接口
- 程序化上传接口，支持选择存储后端
- 返回结构化的 JSON 响应
- 支持批量上传

## ⚙️ 配置说明

### 环境变量配置

在 `wrangler.toml` 文件中配置相应的环境变量：

#### 基础配置
```toml
# 默认存储提供商
DEFAULT_STORAGE_PROVIDER = "telegram"  # 可选: telegram, s3, minio, supabase
```

#### Telegram 配置 (默认)
```toml
TG_Bot_Token = "your-telegram-bot-token"
TG_Chat_ID = "your-telegram-chat-id"
```

#### AWS S3 配置
```toml
AWS_ACCESS_KEY_ID = "your-aws-access-key"
AWS_SECRET_ACCESS_KEY = "your-aws-secret-key"
AWS_S3_BUCKET = "your-s3-bucket"
AWS_REGION = "us-east-1"
# 可选配置
AWS_S3_ENDPOINT = "https://s3.us-east-1.amazonaws.com"
AWS_S3_PUBLIC_URL = "https://your-bucket.s3.amazonaws.com"
```

#### MinIO 配置
```toml
MINIO_ENDPOINT = "your-minio-endpoint.com"
MINIO_ACCESS_KEY = "your-minio-access-key"
MINIO_SECRET_KEY = "your-minio-secret-key"
MINIO_BUCKET = "your-minio-bucket"
# 可选配置
MINIO_REGION = "us-east-1"
MINIO_USE_SSL = "true"
MINIO_PORT = "9000"
```

#### Supabase Storage 配置
```toml
SUPABASE_URL = "https://your-project.supabase.co"
SUPABASE_ANON_KEY = "your-supabase-anon-key"
SUPABASE_BUCKET = "your-supabase-bucket"
# 可选配置 (用于管理员操作)
SUPABASE_SERVICE_ROLE_KEY = "your-service-role-key"
```

## 📡 API 使用说明

### 1. API 上传接口

#### 基础上传 (无认证)
```bash
curl -X POST "https://your-domain.com/api/upload" \
  -F "file=@image.jpg" \
  -F "provider=s3"
```

#### 认证上传
```bash
curl -X POST "https://your-domain.com/api/upload/auth" \
  -H "Authorization: Bearer your-jwt-token" \
  -F "file=@image.jpg" \
  -F "provider=minio"
```

#### 批量上传
```bash
curl -X POST "https://your-domain.com/api/upload" \
  -F "file=@image1.jpg" \
  -F "file=@image2.png" \
  -F "provider=supabase"
```

#### 响应格式
```json
{
  "success": true,
  "data": {
    "fileId": "1234567890_abc123.jpg",
    "fileName": "image.jpg",
    "size": 102400,
    "type": "image/jpeg",
    "url": "https://your-domain.com/file/1234567890_abc123.jpg",
    "provider": "s3",
    "uploadTime": 1640995200000
  }
}
```

### 2. 存储管理 API

#### 获取可用存储提供商
```bash
curl "https://your-domain.com/api/storage/providers"
```

#### 存储健康检查
```bash
curl "https://your-domain.com/api/storage/health"
```

#### 获取上传配置
```bash
curl "https://your-domain.com/api/upload/config"
```

## 🔧 高级配置

### 文件上传限制
```toml
MAX_FILE_SIZE = "50MB"
ALLOWED_FILE_TYPES = "image/jpeg,image/png,image/gif,image/webp"
REQUIRE_AUTH_FOR_UPLOAD = "false"
```

### 存储提供商特定选项

#### S3/MinIO 选项
- 支持自定义前缀
- 支持 ACL 设置
- 支持自定义元数据

#### Supabase 选项
- 支持缓存控制
- 支持文件覆盖 (upsert)
- 支持签名URL

## 🛠️ 开发指南

### 添加新的存储提供商

1. 在 `src/functions/storage/providers/` 目录下创建新的提供商类
2. 继承 `StorageProvider` 基类
3. 实现必需的方法：`uploadFile`, `getFileUrl`
4. 在 `StorageManager.js` 中注册新提供商

### 示例：自定义存储提供商
```javascript
import { StorageProvider } from '../StorageManager.js';

export class CustomStorage extends StorageProvider {
    constructor(env) {
        super(env);
        // 初始化配置
    }

    async uploadFile(file, options = {}) {
        // 实现文件上传逻辑
        return {
            fileId: 'generated-file-id',
            originalName: file.name,
            size: file.size,
            type: file.type,
            url: 'https://your-storage.com/file-url',
            provider: 'custom'
        };
    }

    async getFileUrl(fileId, options = {}) {
        // 实现获取文件URL逻辑
        return `https://your-storage.com/${fileId}`;
    }
}
```

## 🔍 故障排除

### 常见问题

1. **存储提供商不可用**
   - 检查环境变量配置
   - 确认网络连接
   - 查看健康检查结果

2. **文件上传失败**
   - 检查文件大小限制
   - 验证文件类型
   - 查看错误日志

3. **文件访问失败**
   - 确认文件ID正确
   - 检查存储提供商状态
   - 验证权限设置

### 调试命令
```bash
# 检查存储提供商状态
curl "https://your-domain.com/api/storage/health"

# 查看可用提供商
curl "https://your-domain.com/api/storage/providers"

# 测试上传
curl -X POST "https://your-domain.com/api/upload" \
  -F "file=@test.jpg" \
  -F "provider=telegram"
```

## 📈 性能优化

### 建议配置

1. **生产环境**
   - 使用 S3 或 MinIO 获得更好的性能
   - 配置 CDN 加速文件访问
   - 启用文件压缩

2. **开发环境**
   - 使用 Telegram 进行快速测试
   - 启用详细日志记录

3. **高可用性**
   - 配置多个存储提供商
   - 实现故障转移逻辑
   - 定期健康检查

## 🔐 安全考虑

1. **访问控制**
   - 使用 JWT 认证保护上传接口
   - 配置适当的 CORS 策略
   - 限制文件类型和大小

2. **存储安全**
   - 使用强密码和访问密钥
   - 启用存储加密
   - 定期轮换密钥

3. **网络安全**
   - 使用 HTTPS 传输
   - 配置防火墙规则
   - 监控异常访问
