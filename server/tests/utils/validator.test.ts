import {
  requireFields,
  isValidUsername,
  isValidPassword,
  isValidDate,
  isValidTime,
  validatePagination,
  isValidBookFormat,
  sanitizeHtml,
  truncate
} from '../../src/utils/validator';
import { Request } from 'express';

describe('Validator Utils', () => {
  describe('requireFields', () => {
    it('should return null when all fields are present', () => {
      const obj = { name: 'test', age: 25 };
      const result = requireFields(obj, ['name', 'age']);

      expect(result).toBeNull();
    });

    it('should return error message when field is missing', () => {
      const obj = { name: 'test' };
      const result = requireFields(obj, ['name', 'age']);

      expect(result).toBe('缺少必填字段: age');
    });

    it('should return error for empty string', () => {
      const obj = { name: '', age: 25 };
      const result = requireFields(obj, ['name']);

      expect(result).toBe('缺少必填字段: name');
    });

    it('should return error for null value', () => {
      const obj = { name: null, age: 25 };
      const result = requireFields(obj, ['name']);

      expect(result).toBe('缺少必填字段: name');
    });
  });

  describe('isValidUsername', () => {
    it('should accept valid usernames', () => {
      expect(isValidUsername('user123')).toBe(true);
      expect(isValidUsername('test_user')).toBe(true);
      expect(isValidUsername('abc')).toBe(true);
      expect(isValidUsername('User_Name_123')).toBe(true);
    });

    it('should reject invalid usernames', () => {
      expect(isValidUsername('ab')).toBe(false);
      expect(isValidUsername('user-name')).toBe(false);
      expect(isValidUsername('user@name')).toBe(false);
      expect(isValidUsername('')).toBe(false);
    });
  });

  describe('isValidPassword', () => {
    it('should accept valid Passwords', () => {
      expect(isValidPassword('abc12345')).toBe(true);
      expect(isValidPassword('password123')).toBe(true);
      expect(isValidPassword('A'.repeat(99) + '1')).toBe(true);
    });

    it('should reject weak Passwords', () => {
      expect(isValidPassword('12345')).toBe(false);
      expect(isValidPassword('12345678')).toBe(false);
      expect(isValidPassword('abcdefgh')).toBe(false);
      expect(isValidPassword('')).toBe(false);
    });
  });

  describe('isValidDate', () => {
    it('should accept valid dates', () => {
      expect(isValidDate('2024-01-01')).toBe(true);
      expect(isValidDate('2024-12-31')).toBe(true);
      expect(isValidDate('1999-06-15')).toBe(true);
    });

    it('should reject invalid dates', () => {
      expect(isValidDate('2024/01/01')).toBe(false);
      expect(isValidDate('01-01-2024')).toBe(false);
      expect(isValidDate('2024-1-1')).toBe(false);
    });
  });

  describe('isValidTime', () => {
    it('should accept valid times', () => {
      expect(isValidTime('00:00')).toBe(true);
      expect(isValidTime('12:30')).toBe(true);
      expect(isValidTime('23:59')).toBe(true);
    });

    it('should reject invalid times', () => {
      expect(isValidTime('24:00')).toBe(false);
      expect(isValidTime('12:60')).toBe(false);
      expect(isValidTime('1:30')).toBe(false);
      expect(isValidTime('12:3')).toBe(false);
    });
  });

  describe('validatePagination', () => {
    it('should return default values when no params', () => {
      const req = { query: {} } as Request;
      const result = validatePagination(req);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should parse valid params', () => {
      const req = { query: { page: '2', limit: '50' } } as unknown as Request;
      const result = validatePagination(req);

      expect(result.page).toBe(2);
      expect(result.limit).toBe(50);
    });

    it('should enforce minimum page', () => {
      const req = { query: { page: '-1' } } as unknown as Request;
      const result = validatePagination(req);

      expect(result.page).toBe(1);
    });

    it('should enforce limit bounds', () => {
      // limit '0' triggers default (20) because parseInt('0') || 20 = 20
      const req1 = { query: { limit: '0' } } as unknown as Request;
      expect(validatePagination(req1).limit).toBe(20);

      // limit '200' should be capped at 100
      const req2 = { query: { limit: '200' } } as unknown as Request;
      expect(validatePagination(req2).limit).toBe(100);

      // limit '1' should be valid
      const req3 = { query: { limit: '1' } } as unknown as Request;
      expect(validatePagination(req3).limit).toBe(1);

      // limit '50' should be valid
      const req4 = { query: { limit: '50' } } as unknown as Request;
      expect(validatePagination(req4).limit).toBe(50);
    });
  });

  describe('isValidBookFormat', () => {
    it('should accept valid formats', () => {
      expect(isValidBookFormat('epub')).toBe(true);
      expect(isValidBookFormat('pdf')).toBe(true);
      expect(isValidBookFormat('txt')).toBe(true);
      expect(isValidBookFormat('docx')).toBe(true);
      expect(isValidBookFormat('mobi')).toBe(true);
      expect(isValidBookFormat('azw3')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isValidBookFormat('EPUB')).toBe(true);
      expect(isValidBookFormat('Pdf')).toBe(true);
      expect(isValidBookFormat('TXT')).toBe(true);
    });

    it('should reject invalid formats', () => {
      expect(isValidBookFormat('exe')).toBe(false);
      expect(isValidBookFormat('doc')).toBe(false);
      expect(isValidBookFormat('')).toBe(false);
    });
  });

  describe('sanitizeHtml', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeHtml('<p>Hello</p>')).toBe('Hello');
      expect(sanitizeHtml('<div><span>Test</span></div>')).toBe('Test');
      expect(sanitizeHtml('<a href="link">Link</a>')).toBe('Link');
    });

    it('should handle nested tags', () => {
      expect(sanitizeHtml('<div><p><strong>Bold</strong></p></div>')).toBe('Bold');
    });

    it('should preserve plain text', () => {
      expect(sanitizeHtml('Hello World')).toBe('Hello World');
    });
  });

  describe('truncate', () => {
    it('should not truncate short text', () => {
      expect(truncate('Hello')).toBe('Hello');
      expect(truncate('Hello', 10)).toBe('Hello');
    });

    it('should truncate long text with ellipsis', () => {
      const result = truncate('Hello World This is a long text', 10);
      expect(result).toBe('Hello Worl...');
      expect(result.length).toBe(13);
    });

    it('should use default max length', () => {
      const longText = 'a'.repeat(150);
      const result = truncate(longText);
      expect(result).toBe('a'.repeat(100) + '...');
    });
  });
});
