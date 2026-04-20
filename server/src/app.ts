import express from 'express';
import session from 'express-session';
import cors from 'cors';
import * as path from 'path';

import { config } from './config';
import { initDatabase } from './database';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { storageAuth } from './middleware/storageAuth';

// 导入路由
import authRoutes from './routes/auth';
import childrenRoutes from './routes/children';
import devicesRoutes from './routes/devices';
import booksRoutes from './routes/books';
import bookmarksRoutes from './routes/bookmarks';
import controlRoutes from './routes/control';
import statsRoutes from './routes/stats';
import tvRoutes from './routes/tv';

/**
 * 创建Express应用
 */
export async function createApp(): Promise<express.Application> {
  if (!config.session.secret) {
    throw new Error('SESSION_SECRET 未配置，生产环境必须显式设置');
  }

  // 初始化数据库
  await initDatabase();

  const app = express();

  // 安全 HTTP 头中间件
  app.use((req, res, next) => {
    // 防止点击劫持
    res.setHeader('X-Frame-Options', 'DENY');
    // 防止 MIME 类型嗅探
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // XSS 保护
    res.setHeader('X-XSS-Protection', '1; mode=block');
    // 引用来源策略
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // 权限策略
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
  });

  // 中间件配置
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (config.cors.allowedOrigins.length === 0) {
        if (process.env.NODE_ENV === 'production') {
          callback(new Error('CORS origin not allowed'));
          return;
        }
        callback(null, true);
        return;
      }

      callback(null, config.cors.allowedOrigins.includes(origin));
    },
    credentials: true
  }));

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));

  // Session配置
  app.use(session({
    name: config.session.cookieName,
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: config.session.maxAge,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    }
  }));

  // 静态文件服务（封面、解析后的章节等）- 添加权限验证
  app.use('/storage', storageAuth, express.static(path.resolve('./storage')));

  // API路由
  app.use('/api/auth', authRoutes);
  app.use('/api/children', childrenRoutes);
  app.use('/api/devices', devicesRoutes);
  app.use('/api/books', booksRoutes);
  app.use('/api/bookmarks', bookmarksRoutes);
  app.use('/api/control', controlRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/tv', tvRoutes);

  // 健康检查
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 404处理
  app.use(notFoundHandler);

  // 全局错误处理
  app.use(errorHandler);

  return app;
}
