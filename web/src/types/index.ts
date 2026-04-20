// API 响应基础类型
export interface ApiResponse<T = unknown> {
  code: number;
  data?: T;
  message?: string;
}

// 管理员
export interface Admin {
  id: number;
  username: string;
  email?: string | null;
}

// 子账号
export interface Child {
  id: number;
  name: string;
  avatar?: string | null;
  birthDate?: string | null;
  booksCount?: number;
  devicesCount?: number;
  todayReadingMinutes?: number;
}

// 设备
export interface Device {
  id: number;
  deviceName?: string;
  deviceToken?: string;
  childId?: number;
  childName?: string;
  bindCode?: string;
  bindCodeExpiresAt?: string;
  lastOnlineAt?: string;
  createdAt?: string;
  online?: boolean;
  bound?: boolean;
  isOwner?: boolean;
  remoteCommand?: string;
}

// 书籍
export interface Book {
  id: number;
  title: string;
  author?: string;
  publisher?: string;
  coverPath?: string | null;
  parseMode?: 'plainText' | 'webview';
  format: 'EPUB' | 'PDF' | 'TXT' | string;
  totalPages: number;
  totalChapters?: number;
  assignedChildren?: { childId: number; childName: string }[];
  createdAt?: string;
}

// 章节
export interface Chapter {
  index: number;
  title?: string;
  startPage: number;
  endPage: number;
  pages?: number;
}

// 书籍详情
export interface BookDetail extends Book {
  chapters?: Chapter[];
}

// 书签
export interface Bookmark {
  id: number;
  childId?: number;
  bookId: number;
  bookTitle?: string;
  pageNumber: number;
  previewText?: string;
  createdAt: string;
}

// 防沉迷策略
export interface ControlPolicy {
  childId: number;
  dailyLimitMinutes: number;
  continuousLimitMinutes: number;
  restMinutes: number;
  forbiddenStartTime?: string;
  forbiddenEndTime?: string;
  allowedFontSizes: string[];
  allowedThemes: string[];
}

// 实时阅读状态
export interface RealtimeStatus {
  isReading: boolean;
  bookTitle?: string;
  currentPage?: number;
  todayReadMinutes?: number;
  deviceName?: string;
}

// 每日统计
export interface DailyStat {
  date: string;
  totalMinutes: number;
  booksRead: number;
  pagesRead: number;
}

// 阅读记录
export interface ReadingRecord {
  date: string;
  bookTitle: string;
  durationMinutes: number;
  pages: number;
  startTime: string;
  endTime: string | null;
}

// 阅读总结
export interface ReadingSummary {
  period: 'day' | 'week' | 'month';
  totalMinutes: number;
  totalBooks: number;
  totalPages: number;
  averageDailyMinutes: number;
  mostReadBook?: {
    id: number;
    title: string;
    minutes: number;
  };
  completionRate: number;
}

// 分页数据
export interface PaginatedData<T> {
  total: number;
  page: number;
  limit: number;
  items: T[];
}

// 书籍上传进度
export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}
