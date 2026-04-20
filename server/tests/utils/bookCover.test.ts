import { buildStorageCoverUrl, normalizeStoredCoverPath, resolveCoverDiskPath } from '../../src/utils/bookCover';

describe('bookCover helpers', () => {
  it('normalizes legacy filesystem and url-style cover paths', () => {
    expect(normalizeStoredCoverPath('./storage/covers/12.png')).toBe('covers/12.png');
    expect(normalizeStoredCoverPath('/Users/demo/project/storage/covers/12.webp')).toBe('covers/12.webp');
    expect(normalizeStoredCoverPath('/covers/12.jpg')).toBe('covers/12.jpg');
    expect(normalizeStoredCoverPath('covers/12.jpeg')).toBe('covers/12.jpeg');
  });

  it('returns null for invalid cover paths', () => {
    expect(normalizeStoredCoverPath(null)).toBeNull();
    expect(normalizeStoredCoverPath('')).toBeNull();
    expect(normalizeStoredCoverPath('storage/originals/book.epub')).toBeNull();
  });

  it('resolves normalized cover paths back to disk paths', () => {
    expect(resolveCoverDiskPath('covers/12.webp')).toMatch(/storage[\\/]+covers[\\/]+12\.webp$/);
    expect(resolveCoverDiskPath('./storage/covers/12.jpg')).toMatch(/storage[\\/]+covers[\\/]+12\.jpg$/);
    expect(resolveCoverDiskPath('bad/path')).toBeNull();
  });

  it('builds absolute storage cover urls from request origin', () => {
    expect(buildStorageCoverUrl('https://readbook.example.com', 'covers/12.jpg')).toBe(
      'https://readbook.example.com/storage/covers/12.jpg'
    );
    expect(buildStorageCoverUrl('https://readbook.example.com/', '/covers/12.png')).toBe(
      'https://readbook.example.com/storage/covers/12.png'
    );
    expect(buildStorageCoverUrl('https://readbook.example.com', null)).toBeNull();
  });
});
