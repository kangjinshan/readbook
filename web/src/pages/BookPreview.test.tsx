import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookPreview from './BookPreview';

const mocks = vi.hoisted(() => ({
  getBook: vi.fn(),
  previewBook: vi.fn(),
}));

vi.mock('@/api/books', () => ({
  getBook: mocks.getBook,
  previewBook: mocks.previewBook,
}));

describe('BookPreview page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

    mocks.getBook.mockResolvedValue({
      id: 7,
      title: '半小时漫画中国史',
      author: '作者',
      parseMode: 'webview',
      format: 'EPUB',
      totalPages: 12,
      totalChapters: 1,
      chapters: [
        {
          index: 1,
          title: '第一章',
          startPage: 1,
          endPage: 12,
        },
      ],
    });

    mocks.previewBook.mockResolvedValue({
      chapter: 1,
      page: 1,
      content: '',
      contentBlocks: [],
      renderMode: 'xhtml',
      renderBaseUrl: 'https://readbook.test/storage/parsed/7/',
      renderHtml: '<section><p>漫画版式预览</p></section>',
      renderCss: ['body { color: #333; }'],
    });
  });

  it('renders iframe preview when the API returns xhtml payload', async () => {
    render(
      <MemoryRouter initialEntries={['/books/7/preview?page=1&chapter=1']}>
        <Routes>
          <Route path="/books/:id/preview" element={<BookPreview />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mocks.previewBook).toHaveBeenCalledWith(7, {
        chapter: 1,
        page: 1,
      });
    });

    const iframe = await screen.findByTitle('书籍 WebView 预览');
    expect(iframe).toBeInTheDocument();
    expect(iframe.getAttribute('srcdoc')).toContain('漫画版式预览');
    expect(iframe.getAttribute('srcdoc')).toContain('<base href="https://readbook.test/storage/parsed/7/" />');
  });
});
