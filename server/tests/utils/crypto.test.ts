import { hashPassword, verifyPassword, generateUUID, generateBindCode, generateFileName } from '../../src/utils/crypto';

describe('Crypto Utils', () => {
  describe('hashPassword and verifyPassword', () => {
    it('should hash a Password', async () => {
      const Password = 'test123456';
      const hash = await hashPassword(Password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(Password);
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should verify correct Password', async () => {
      const Password = 'test123456';
      const hash = await hashPassword(Password);
      const isValid = await verifyPassword(Password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect Password', async () => {
      const Password = 'test123456';
      const hash = await hashPassword(Password);
      const isValid = await verifyPassword('wrongPassword', hash);

      expect(isValid).toBe(false);
    });

    it('should generate different hashes for same Password', async () => {
      const Password = 'test123456';
      const hash1 = await hashPassword(Password);
      const hash2 = await hashPassword(Password);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('generateUUID', () => {
    it('should generate a valid UUID v4', () => {
      const uuid = generateUUID();

      expect(uuid).toBeDefined();
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('should generate unique UUIDs', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }

      expect(uuids.size).toBe(100);
    });
  });

  describe('generateBindCode', () => {
    it('should generate a 6-digit code', () => {
      const code = generateBindCode();

      expect(code).toBeDefined();
      expect(code).toMatch(/^\d{6}$/);
    });

    it('should generate code between 100000 and 999999', () => {
      for (let i = 0; i < 100; i++) {
        const code = parseInt(generateBindCode());
        expect(code).toBeGreaterThanOrEqual(100000);
        expect(code).toBeLessThanOrEqual(999999);
      }
    });
  });

  describe('generateFileName', () => {
    it('should generate filename with original extension', () => {
      const fileName = generateFileName('test.pdf');

      expect(fileName).toMatch(/\.pdf$/);
    });

    it('should generate different names for same input', () => {
      const name1 = generateFileName('test.pdf');
      const name2 = generateFileName('test.pdf');

      expect(name1).not.toBe(name2);
    });

    it('should handle files without extension', () => {
      const fileName = generateFileName('test');

      expect(fileName).toBeDefined();
      expect(fileName.length).toBeGreaterThan(0);
    });
  });
});
