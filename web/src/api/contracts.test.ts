import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('./client', () => ({
  default: {
    get: getMock,
    post: postMock,
  },
}));

describe('API contract wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads camelCase session fields from auth session response', async () => {
    getMock.mockResolvedValue({
      data: {
        data: {
          loggedIn: true,
          adminId: 7,
          username: 'admin',
        },
      },
    });

    const { checkSession } = await import('./auth');
    await expect(checkSession()).resolves.toEqual({
      loggedIn: true,
      adminId: 7,
      username: 'admin',
    });
  });

  it('returns childId from create child response', async () => {
    postMock.mockResolvedValue({
      data: {
        data: {
          childId: 12,
        },
      },
    });

    const { createChild } = await import('./children');
    await expect(createChild({ name: 'Kid' })).resolves.toBe(12);
  });

  it('returns bookmarkId from create bookmark response', async () => {
    postMock.mockResolvedValue({
      data: {
        data: {
          bookmarkId: 21,
        },
      },
    });

    const { createBookmark } = await import('./bookmarks');
    await expect(
      createBookmark({
        childId: 1,
        bookId: 2,
        pageNumber: 3,
        previewText: 'preview',
      })
    ).resolves.toBe(21);
  });

  it('maps paged history items to records', async () => {
    getMock.mockResolvedValue({
      data: {
        data: {
          total: 1,
          items: [
            {
              date: '2026-04-18',
              bookTitle: 'Book',
              durationMinutes: 10,
              pages: 2,
              startTime: '10:00',
              endTime: '10:10',
            },
          ],
        },
      },
    });

    const { getReadingHistory } = await import('./stats');
    await expect(getReadingHistory(1, { page: 1, limit: 10 })).resolves.toEqual({
      total: 1,
      records: [
        {
          date: '2026-04-18',
          bookTitle: 'Book',
          durationMinutes: 10,
          pages: 2,
          startTime: '10:00',
          endTime: '10:10',
        },
      ],
    });
  });

  it('builds the source download URL for a book', async () => {
    const { getBookSourceDownloadUrl } = await import('./books');
    expect(getBookSourceDownloadUrl(12)).toBe('/api/books/12/source');
  });

  it('passes parseMode when reparsing a book', async () => {
    postMock.mockResolvedValue({
      data: {
        data: {
          bookId: 9,
          title: 'Book',
          parseMode: 'webview',
          totalPages: 20,
          totalChapters: 2,
          coverPath: null,
          progressReset: true,
          bookmarksReset: true,
        },
      },
    });

    const { reparseBook } = await import('./books');
    await expect(reparseBook(9, 'webview')).resolves.toEqual({
      bookId: 9,
      title: 'Book',
      parseMode: 'webview',
      totalPages: 20,
      totalChapters: 2,
      coverPath: null,
      progressReset: true,
      bookmarksReset: true,
    });
    expect(postMock).toHaveBeenCalledWith('/books/9/reparse', { parseMode: 'webview' });
  });

  it('unwraps webview preview payload fields', async () => {
    getMock.mockResolvedValue({
      data: {
        data: {
          chapter: 2,
          page: 18,
          content: '',
          contentBlocks: [],
          renderMode: 'xhtml',
          renderBaseUrl: 'https://readbook.test/storage/parsed/9/',
          renderHtml: '<section>preview</section>',
          renderCss: ['body { color: #333; }'],
        },
      },
    });

    const { previewBook } = await import('./books');
    await expect(previewBook(9, { chapter: 2, page: 18 })).resolves.toEqual({
      chapter: 2,
      page: 18,
      content: '',
      contentBlocks: [],
      renderMode: 'xhtml',
      renderBaseUrl: 'https://readbook.test/storage/parsed/9/',
      renderHtml: '<section>preview</section>',
      renderCss: ['body { color: #333; }'],
    });
    expect(getMock).toHaveBeenCalledWith('/books/9/preview', {
      params: {
        chapter: 2,
        page: 18,
      },
    });
  });
});
