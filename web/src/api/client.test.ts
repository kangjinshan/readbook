import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock antd message
vi.mock('antd', () => ({
  message: {
    error: vi.fn(),
  },
}));

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create axios instance with correct config', async () => {
    // Import after mocking
    const axios = await import('axios');
    const client = (await import('../api/client')).default;

    expect(axios.default.create).toBeDefined();
    expect(client).toBeDefined();
    expect(client.interceptors).toBeDefined();
  });

  it('should have interceptors', async () => {
    const client = (await import('../api/client')).default;

    expect(client.interceptors.request).toBeDefined();
    expect(client.interceptors.response).toBeDefined();
  });

  it('should have HTTP methods', async () => {
    const client = (await import('../api/client')).default;

    expect(client.get).toBeDefined();
    expect(client.post).toBeDefined();
    expect(client.put).toBeDefined();
    expect(client.delete).toBeDefined();
  });
});
