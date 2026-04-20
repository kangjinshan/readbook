import { createApp } from './app';
import { config } from './config';
import { closeDatabase } from './database';

/**
 * 启动HTTP服务器
 */
async function startServer(): Promise<void> {
  try {
    const app = await createApp();
    const port = typeof config.port === 'string' ? parseInt(config.port) : config.port;

    const server = app.listen(port, config.host, () => {
      console.log(`=================================`);
      console.log(`  儿童护眼阅读器后端服务`);
      console.log(`=================================`);
      console.log(`  端口: ${config.port}`);
      console.log(`  地址: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
      console.log(`  环境: ${process.env.NODE_ENV || 'development'}`);
      console.log(`=================================`);
      console.log(`  API文档:`);
      console.log(`  - 认证: /api/auth`);
      console.log(`  - 子账号: /api/children`);
      console.log(`  - 设备: /api/devices`);
      console.log(`  - 书籍: /api/books`);
      console.log(`  - 书签: /api/bookmarks`);
      console.log(`  - 管控: /api/control`);
      console.log(`  - 统计: /api/stats`);
      console.log(`  - 电视端: /api/tv`);
      console.log(`=================================`);
      console.log(`  如首次启动创建了管理员账号，请查看上方启动日志中的初始密码`);
      console.log(`=================================`);
    });

    const shutdown = (signal: string) => {
      console.log(`收到 ${signal}，正在关闭服务...`);
      server.close(() => {
        closeDatabase();
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('启动服务器失败:', err);
    process.exit(1);
  }
}

// 启动服务器
startServer();
