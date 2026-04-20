import { Request, Response, NextFunction } from 'express';
import { queryOne } from '../database';
import { error } from '../utils/response';
import { ErrorCodes } from '../config';

type ChildIdResolver = (req: Request) => number | null;

export function requireOwnedChild(resolveChildId: ChildIdResolver) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const adminId = req.session.adminId;
    const childId = resolveChildId(req);

    if (!adminId) {
      error(res, ErrorCodes.NOT_LOGGED_IN);
      return;
    }

    if (childId === null) {
      error(res, ErrorCodes.PARAM_ERROR, '无效的子账号ID');
      return;
    }

    const child = queryOne(
      'SELECT id FROM children WHERE id = ? AND admin_id = ?',
      [childId, adminId]
    );

    if (!child) {
      error(res, ErrorCodes.PERMISSION_DENIED, '子账号不存在');
      return;
    }

    req.childId = childId;
    next();
  };
}
