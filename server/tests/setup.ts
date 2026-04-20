// Jest setup file
import { beforeAll, afterAll } from '@jest/globals';

// Extend timeout for integration tests
jest.setTimeout(30000);

// Mock console.log in tests to reduce noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
};
