const isProduction = process.env.NODE_ENV === 'production';

/**
 * 配置常量
 */
export const config = {
  // 服务器配置
  port: process.env.PORT || 8015,
  host: process.env.HOST || '0.0.0.0',

  // Session 配置
  session: {
    secret: process.env.SESSION_SECRET || (isProduction ? '' : 'readbook-dev-session-secret'),
    maxAge: 24 * 60 * 60 * 1000, // 24小时
    cookieName: 'readbook.sid'
  },

  admin: {
    initialUsername: process.env.ADMIN_INITIAL_USERNAME || 'admin',
    initialPassword: process.env.ADMIN_INITIAL_PASSWORD || ''
  },

  cors: {
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
  },

  // 数据库配置
  database: {
    path: './data/readbook.db'
  },

  // 文件存储配置
  storage: {
    originals: './storage/originals',
    parsed: './storage/parsed',
    covers: './storage/covers'
  },

  // 文件上传配置
  upload: {
    maxPdfParseSize: 0, // 0 表示不限制 PDF 解析体积
    allowedFormats: ['epub', 'pdf', 'txt', 'docx', 'mobi', 'azw3']
  },

  // 设备绑定配置
  device: {
    bindCodeLength: 6,
    bindCodeExpireMinutes: 10
  },

  // 轮询间隔配置
  polling: {
    bindStatusInterval: 3000,    // 绑定状态轮询 3秒
    syncInterval: 60000,          // 数据同步轮询 60秒
    heartbeatInterval: 30000      // 心跳轮询 30秒
  },

  // 防沉迷默认配置
  antiAddiction: {
    defaultDailyLimitMinutes: 120,
    defaultContinuousLimitMinutes: 45,
    defaultRestMinutes: 15
  },

  rateLimit: {
    loginWindowMs: 15 * 60 * 1000,
    loginMaxAttempts: 5,
    loginBlockMs: 15 * 60 * 1000
  }
};

/**
 * 错误码定义
 */
export const ErrorCodes = {
  // 通用错误码 (0-999)
  SUCCESS: 0,
  SERVER_ERROR: 500,
  PARAM_ERROR: 501,
  RATE_LIMIT: 502,

  // 认证错误码 (1000-1999)
  LOGIN_FAILED: 1001,
  ACCOUNT_DISABLED: 1002,
  SESSION_EXPIRED: 1003,
  NOT_LOGGED_IN: 1004,
  PERMISSION_DENIED: 1005,

  // 设备错误码 (2000-2999)
  BIND_CODE_INVALID: 2001,
  BIND_CODE_USED: 2002,
  DEVICE_ALREADY_BOUND: 2003,
  DEVICE_NOT_BOUND: 2004,
  DEVICE_TOKEN_INVALID: 2005,
  DEVICE_OFFLINE: 2006,

  // 书籍错误码 (3000-3999)
  FORMAT_NOT_SUPPORTED: 3001,
  PARSE_FAILED: 3002,
  FILE_TOO_LARGE: 3003,
  BOOK_NOT_FOUND: 3004,
  BOOK_ACCESS_DENIED: 3005,
  CHAPTER_NOT_FOUND: 3006,
  PAGE_OUT_OF_RANGE: 3007,

  // 阅读控制错误码 (4000-4999)
  DAILY_LIMIT_EXCEEDED: 4001,
  CONTINUOUS_LIMIT_EXCEEDED: 4002,
  FORBIDDEN_TIME: 4003,
  SESSION_NOT_FOUND: 4004,
  SESSION_ENDED: 4005
} as const;

/**
 * 错误消息定义
 */
export const ErrorMessages: Record<number, string> = {
  [ErrorCodes.SUCCESS]: '成功',
  [ErrorCodes.SERVER_ERROR]: '服务器内部错误',
  [ErrorCodes.PARAM_ERROR]: '参数验证失败',
  [ErrorCodes.RATE_LIMIT]: '请求频率过高',

  [ErrorCodes.LOGIN_FAILED]: '用户名或密码错误',
  [ErrorCodes.ACCOUNT_DISABLED]: '账号已被禁用',
  [ErrorCodes.SESSION_EXPIRED]: 'Session已过期',
  [ErrorCodes.NOT_LOGGED_IN]: '未登录',
  [ErrorCodes.PERMISSION_DENIED]: '权限不足',

  [ErrorCodes.BIND_CODE_INVALID]: '绑定码无效或已过期',
  [ErrorCodes.BIND_CODE_USED]: '绑定码已被使用',
  [ErrorCodes.DEVICE_ALREADY_BOUND]: '设备已绑定其他账号',
  [ErrorCodes.DEVICE_NOT_BOUND]: '设备未绑定',
  [ErrorCodes.DEVICE_TOKEN_INVALID]: '设备Token无效',
  [ErrorCodes.DEVICE_OFFLINE]: '设备离线',

  [ErrorCodes.FORMAT_NOT_SUPPORTED]: '文件格式不支持',
  [ErrorCodes.PARSE_FAILED]: '文件解析失败',
  [ErrorCodes.FILE_TOO_LARGE]: '文件过大',
  [ErrorCodes.BOOK_NOT_FOUND]: '书籍不存在',
  [ErrorCodes.BOOK_ACCESS_DENIED]: '无权访问此书籍',
  [ErrorCodes.CHAPTER_NOT_FOUND]: '章节不存在',
  [ErrorCodes.PAGE_OUT_OF_RANGE]: '页码超出范围',

  [ErrorCodes.DAILY_LIMIT_EXCEEDED]: '已达每日阅读时长限制',
  [ErrorCodes.CONTINUOUS_LIMIT_EXCEEDED]: '已达连续阅读时长限制',
  [ErrorCodes.FORBIDDEN_TIME]: '当前为禁止阅读时段',
  [ErrorCodes.SESSION_NOT_FOUND]: '会话不存在',
  [ErrorCodes.SESSION_ENDED]: '会话已结束'
};
