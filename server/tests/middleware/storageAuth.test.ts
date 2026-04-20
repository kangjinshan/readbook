import type { Request, Response } from 'express';
import { storageAuth } from '../../src/middleware/storageAuth';

function createResponseMock() {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return response as unknown as Response;
}

describe('storageAuth', () => {
  it('allows public access to cover resources without authentication', () => {
    const req = {
      path: '/covers/52.jpeg',
      session: undefined,
      headers: {},
    } as unknown as Request;
    const res = createResponseMock();
    const next = jest.fn();

    storageAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((res as any).status).not.toHaveBeenCalled();
  });
});
