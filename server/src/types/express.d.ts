import 'express-session';

declare module 'express-session' {
  interface SessionData {
    adminId?: number;
    username?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      deviceId?: number;
      childId?: number;
      adminId?: number;
    }
  }
}

export {};
