import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookDetail from './BookDetail';

const mocks = vi.hoisted(() => ({
  loadChildren: vi.fn(),
  getBook: vi.fn(),
  updateBook: vi.fn(),
  deleteBook: vi.fn(),
  assignBook: vi.fn(),
  unassignBook: vi.fn(),
  uploadBookCover: vi.fn(),
  reparseBook: vi.fn(),
}));

vi.mock('@/hooks/useChild', () => ({
  useChild: () => ({
    children: [],
    loadChildren: mocks.loadChildren,
  }),
}));

vi.mock('@/api/books', () => ({
  getBook: mocks.getBook,
  updateBook: mocks.updateBook,
  deleteBook: mocks.deleteBook,
  assignBook: mocks.assignBook,
  unassignBook: mocks.unassignBook,
  uploadBookCover: mocks.uploadBookCover,
  reparseBook: mocks.reparseBook,
}));

describe('BookDetail page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBook
      .mockResolvedValueOnce({
        id: 1,
        title: 'Book One',
        author: 'Author',
        publisher: 'Publisher',
        coverPath: 'covers/1.jpg',
        parseMode: 'plainText',
        format: 'EPUB',
        totalPages: 12,
        totalChapters: 1,
        chapters: [],
        assignedChildren: [],
      })
      .mockResolvedValueOnce({
        id: 1,
        title: 'Book One',
        author: 'Author',
        publisher: 'Publisher',
        coverPath: 'covers/1.jpg',
        parseMode: 'plainText',
        format: 'EPUB',
        totalPages: 12,
        totalChapters: 1,
        chapters: [],
        assignedChildren: [],
      });
    mocks.uploadBookCover.mockResolvedValue({ coverPath: 'covers/1.jpg' });
    mocks.reparseBook.mockResolvedValue({
      bookId: 1,
      title: 'Book One',
      parseMode: 'plainText',
      totalPages: 12,
      totalChapters: 1,
      coverPath: 'covers/1.jpg',
      progressReset: true,
      bookmarksReset: true,
    });
    mocks.updateBook.mockResolvedValue(undefined);
    mocks.deleteBook.mockResolvedValue(undefined);
    mocks.assignBook.mockResolvedValue(undefined);
    mocks.unassignBook.mockResolvedValue(undefined);
  });

  it('uploads a replacement cover from the detail page and reloads the book', async () => {
    render(
      <MemoryRouter initialEntries={['/books/1']}>
        <Routes>
          <Route path="/books/:id" element={<BookDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Book One')).toBeInTheDocument();

    const input = screen.getByTestId('cover-upload-input') as HTMLInputElement;
    const file = new File(['cover'], 'cover.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mocks.uploadBookCover).toHaveBeenCalledWith(1, file);
    });
    await waitFor(() => {
      expect(mocks.getBook).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByAltText('Book One')).toHaveAttribute('src', expect.stringMatching(/\/storage\/covers\/1\.jpg\?v=\d+/));
    });
  });

  it('shows the current parse mode and both reparse actions', async () => {
    render(
      <MemoryRouter initialEntries={['/books/1']}>
        <Routes>
          <Route path="/books/:id" element={<BookDetail />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Book One')).toBeInTheDocument();
    expect(screen.getByText('纯文本解析')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /纯文本重新解析/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /WebView重新解析/ })).toBeInTheDocument();
  });
});
