import { success, error, paged, ApiResponse, PagedData } from '../../src/utils/response';
import { Response } from 'express';
import { ErrorCodes } from '../../src/config';

describe('Response Utils', () => {
  let mockRes: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnThis();
    mockRes = {
      json: mockJson,
      status: mockStatus
    };
  });

  describe('success', () => {
    it('should send success response with data', () => {
      const data = { id: 1, name: 'test' };
      success(mockRes as Response, data);

      expect(mockJson).toHaveBeenCalledWith({
        code: ErrorCodes.SUCCESS,
        message: '成功',
        data
      });
    });

    it('should send success response with custom message', () => {
      const data = { id: 1 };
      success(mockRes as Response, data, 'Created');

      expect(mockJson).toHaveBeenCalledWith({
        code: ErrorCodes.SUCCESS,
        message: 'Created',
        data
      });
    });

    it('should send success response without data', () => {
      success(mockRes as Response);

      expect(mockJson).toHaveBeenCalledWith({
        code: ErrorCodes.SUCCESS,
        message: '成功'
      });
    });

    it('should send success with null data', () => {
      success(mockRes as Response, null, 'Deleted');

      expect(mockJson).toHaveBeenCalledWith({
        code: ErrorCodes.SUCCESS,
        message: 'Deleted',
        data: null
      });
    });
  });

  describe('error', () => {
    it('should send error response with code', () => {
      error(mockRes as Response, ErrorCodes.PARAM_ERROR);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        code: ErrorCodes.PARAM_ERROR,
        message: '参数验证失败'
      });
    });

    it('should send error with custom message', () => {
      error(mockRes as Response, ErrorCodes.PARAM_ERROR, 'Invalid input');

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        code: ErrorCodes.PARAM_ERROR,
        message: 'Invalid input'
      });
    });

    it('should return 401 for auth errors', () => {
      error(mockRes as Response, ErrorCodes.NOT_LOGGED_IN);
      expect(mockStatus).toHaveBeenCalledWith(401);
    });

    it('should return 403 for control errors', () => {
      error(mockRes as Response, ErrorCodes.DAILY_LIMIT_EXCEEDED);
      expect(mockStatus).toHaveBeenCalledWith(403);
    });

    it('should return 404 for book errors', () => {
      error(mockRes as Response, ErrorCodes.BOOK_NOT_FOUND);
      expect(mockStatus).toHaveBeenCalledWith(404);
    });

    it('should return 500 for unknown errors', () => {
      error(mockRes as Response, 9999);
      expect(mockStatus).toHaveBeenCalledWith(500);
    });
  });

  describe('paged', () => {
    it('should send paged response', () => {
      const pagedData: PagedData<{ id: number }> = {
        total: 100,
        page: 1,
        limit: 20,
        items: [{ id: 1 }, { id: 2 }]
      };

      paged(mockRes as Response, pagedData);

      expect(mockJson).toHaveBeenCalledWith({
        code: ErrorCodes.SUCCESS,
        message: '成功',
        data: pagedData
      });
    });
  });
});
