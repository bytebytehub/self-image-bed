import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
import { authenticatedUpload } from './functions/upload';
import { fileHandler } from './functions/file/[id]';
import { register, login, getCurrentUser, updateUserAvatar, getUserProfile } from './functions/user/auth';
import { getUserImages, deleteUserImage, updateImageInfo, searchUserImages } from './functions/user/images';
import { getUserFavorites, addToFavorites, removeFromFavorites, checkFavoriteStatus, batchFavoriteOperation } from './functions/user/favorites';
import { getUserTags, createTag, updateTag, deleteTag, batchTagOperation, getTagImages } from './functions/user/tags';
import { authMiddleware } from './functions/utils/auth';
import { apiUpload, apiUploadWithAuth, getStorageProviders, healthCheck, getUploadConfig } from './functions/api/upload';

const app = new Hono();

// 上传接口
app.post('/upload', authenticatedUpload);

// 文件访问接口
app.get('/file/:id', fileHandler);

// 根路径重定向到index.html
app.get('/', (c) => c.redirect('/index.html'));

// API 上传接口
app.post('/api/upload', apiUpload); // 无认证上传
app.post('/api/upload/auth', apiUploadWithAuth); // 需要认证的上传

// 存储管理 API
app.get('/api/storage/providers', getStorageProviders); // 获取可用存储提供商
app.get('/api/storage/health', healthCheck); // 存储健康检查
app.get('/api/upload/config', getUploadConfig); // 获取上传配置

// 用户认证相关API
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);
app.get('/api/auth/user', authMiddleware, getCurrentUser);
app.get('/api/auth/profile', authMiddleware, getUserProfile);
app.put('/api/auth/avatar', authMiddleware, updateUserAvatar);

// 用户图片管理相关API
app.get('/api/images', authMiddleware, getUserImages);
app.get('/api/images/search', authMiddleware, searchUserImages);
app.delete('/api/images/:id', authMiddleware, deleteUserImage);
app.put('/api/images/:id', authMiddleware, updateImageInfo);

// 用户收藏相关API
app.get('/api/favorites', authMiddleware, getUserFavorites);
app.post('/api/favorites/:id', authMiddleware, addToFavorites);
app.delete('/api/favorites/:id', authMiddleware, removeFromFavorites);
app.get('/api/favorites/:id/status', authMiddleware, checkFavoriteStatus);
app.post('/api/favorites/batch', authMiddleware, batchFavoriteOperation);

// 用户标签相关API
app.get('/api/tags', authMiddleware, getUserTags);
app.post('/api/tags', authMiddleware, createTag);
app.put('/api/tags/:id', authMiddleware, updateTag);
app.delete('/api/tags/:id', authMiddleware, deleteTag);
app.post('/api/tags/batch', authMiddleware, batchTagOperation);
app.get('/api/tags/:id/images', authMiddleware, getTagImages);

// 静态文件服务放在最后，避免覆盖 API 路由
app.use('/*', serveStatic({ root: './' }));

export default app;
