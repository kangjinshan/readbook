export const STORAGE_BASE_URL = import.meta.env.VITE_STORAGE_BASE_URL || '/storage';

export const BOOK_FORMAT_TAG_COLORS: Record<string, string> = {
  EPUB: 'blue',
  PDF: 'red',
  TXT: 'green',
};
