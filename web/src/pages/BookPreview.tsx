import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Spin, message } from 'antd';
import {
  ArrowLeftOutlined,
  LeftOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { getBook, previewBook } from '@/api/books';
import type { BookDetail, Chapter } from '@/types';
import { getErrorMessage } from '@/utils/error';
import styles from './BookPreview.module.css';

type ReaderTheme = 'yellow' | 'white' | 'dark';
type ReaderFontSize = 'small' | 'medium' | 'large';
type TurnDirection = 'forward' | 'backward';

interface ThemePreset {
  background: string;
  text: string;
  secondary: string;
  progress: string;
  shadow: string;
  panel: string;
  webviewStage: string;
}

interface FontPreset {
  label: string;
  size: number;
}

interface PreviewContentBlock {
  type: 'text' | 'image';
  text?: string;
  assetUrl?: string;
  alt?: string | null;
}

interface PreviewRenderPayload {
  mode: 'xhtml';
  baseUrl: string;
  html: string;
  cssTexts: string[];
}

type PreviewFrameWindow = Window & {
  __readbookShowPage?: (index: number) => number;
};

const themePresets: Record<ReaderTheme, ThemePreset> = {
  yellow: {
    background: '#FFF8DC',
    text: '#2A2A2A',
    secondary: '#888888',
    progress: '#5B9BD5',
    shadow: 'rgba(126, 96, 38, 0.18)',
    panel: 'rgba(255, 248, 220, 0.8)',
    webviewStage: '#f4ecd2',
  },
  white: {
    background: '#FAFAFA',
    text: '#1A1A1A',
    secondary: '#777777',
    progress: '#5B9BD5',
    shadow: 'rgba(91, 107, 124, 0.14)',
    panel: 'rgba(250, 250, 250, 0.82)',
    webviewStage: '#ededed',
  },
  dark: {
    background: '#222222',
    text: '#E0E0E0',
    secondary: '#AAAAAA',
    progress: '#7bb4ff',
    shadow: 'rgba(0, 0, 0, 0.35)',
    panel: 'rgba(34, 34, 34, 0.82)',
    webviewStage: '#2f2f2f',
  },
};

const fontPresets: Record<ReaderFontSize, FontPreset> = {
  small: { label: '小', size: 36 },
  medium: { label: '中', size: 42 },
  large: { label: '大', size: 48 },
};

const parsePositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseOptionalPositiveInt = (value: string | null): number | null => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const mapServerPageToHtmlIndex = (page: number, chapter: Chapter | null, slotCount: number) => {
  if (!chapter || slotCount <= 1) {
    return 0;
  }

  const serverPageCount = Math.max(chapter.endPage - chapter.startPage + 1, 1);
  if (serverPageCount <= 1) {
    return 0;
  }

  const normalizedPage = clamp(page, chapter.startPage, chapter.endPage);
  const ratio = (normalizedPage - chapter.startPage) / (serverPageCount - 1);
  return clamp(Math.round(ratio * (slotCount - 1)), 0, slotCount - 1);
};

const mapHtmlIndexToServerPage = (slotIndex: number, chapter: Chapter | null, slotCount: number) => {
  if (!chapter) {
    return 1;
  }

  const serverPageCount = Math.max(chapter.endPage - chapter.startPage + 1, 1);
  if (slotCount <= 1 || serverPageCount <= 1) {
    return chapter.startPage;
  }

  const normalizedSlotIndex = clamp(slotIndex, 0, slotCount - 1);
  const ratio = normalizedSlotIndex / (slotCount - 1);
  return clamp(
    chapter.startPage + Math.round(ratio * (serverPageCount - 1)),
    chapter.startPage,
    chapter.endPage,
  );
};

function buildWebviewPreviewDocument(params: {
  bookTitle: string;
  chapterTitle?: string;
  renderHtml: string;
  renderCss: string[];
  renderBaseUrl: string;
  theme: ThemePreset;
  fontSize: number;
}): string {
  const cssBlock = params.renderCss
    .map((cssText) => `<style>${cssText}</style>`)
    .join('\n');
  const titleText = escapeHtml(params.chapterTitle || params.bookTitle);
  const bookTitleText = escapeHtml(params.bookTitle);
  const pagePaddingHorizontal = 44;
  const pagePaddingTop = 54;
  const pagePaddingBottom = 58;

  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"
      />
      <base href="${escapeHtml(params.renderBaseUrl)}" />
      <style>
        :root {
          color-scheme: light;
          --preview-bg: ${params.theme.webviewStage};
          --preview-text: ${params.theme.text};
          --preview-secondary: ${params.theme.secondary};
          --preview-shadow: ${params.theme.shadow};
          --preview-font-size: ${params.fontSize}px;
        }

        html,
        body {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: transparent;
        }

        body {
          -webkit-text-size-adjust: none;
        }

        #page-stage {
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          padding: 8px;
          box-sizing: border-box;
          background: transparent;
        }

        #page-shell {
          width: 100%;
          height: 100%;
          position: relative;
          border-radius: 28px;
          background: var(--preview-bg);
          box-shadow: 0 24px 56px rgba(0, 0, 0, 0.12);
          overflow: hidden;
        }

        #page-title {
          position: absolute;
          top: 14px;
          left: 0;
          right: 0;
          text-align: center;
          font-size: 13px;
          color: var(--preview-secondary);
          font-weight: 600;
          letter-spacing: 0.02em;
          z-index: 3;
          pointer-events: none;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          padding: 0 72px;
          box-sizing: border-box;
        }

        #book-title {
          position: absolute;
          left: 20px;
          bottom: 16px;
          font-size: 12px;
          color: var(--preview-secondary);
          z-index: 3;
          pointer-events: none;
          max-width: 32%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        #page-number {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 16px;
          text-align: center;
          font-size: 12px;
          color: var(--preview-secondary);
          z-index: 3;
          pointer-events: none;
        }

        #page-scroll {
          position: absolute;
          left: ${pagePaddingHorizontal}px;
          right: ${pagePaddingHorizontal}px;
          top: ${pagePaddingTop}px;
          bottom: ${pagePaddingBottom}px;
          overflow: hidden;
        }

        #content-frame {
          position: relative;
          width: fit-content;
          height: fit-content;
          transform-origin: top left;
        }

        #chapter-content {
          position: absolute;
          left: 0;
          top: 0;
          min-width: 1px;
          min-height: 1px;
          transform-origin: top left;
          color: var(--preview-text);
          font-size: var(--preview-font-size);
          line-height: 1.7;
        }

        #chapter-content,
        #chapter-content * {
          box-sizing: border-box;
        }

        #chapter-content img,
        #chapter-content svg,
        #chapter-content video,
        #chapter-content canvas,
        #chapter-content table {
          max-width: 100%;
          height: auto;
        }

        #chapter-content img {
          display: block;
          margin-left: auto;
          margin-right: auto;
        }

        #chapter-content p,
        #chapter-content h1,
        #chapter-content h2,
        #chapter-content h3,
        #chapter-content h4,
        #chapter-content h5,
        #chapter-content h6,
        #chapter-content div {
          max-width: 100%;
        }
      </style>
      ${cssBlock}
      <script>
        (function() {
          let pageAxis = 'vertical';
          let currentViewportWidth = 1;
          let currentViewportHeight = 1;
          let currentPageCount = 1;

          function waitForImages() {
            const images = Array.from(document.images || []);
            if (!images.length) {
              return Promise.resolve();
            }
            return Promise.all(images.map((image) => {
              if (image.complete) {
                return Promise.resolve();
              }
              return new Promise((resolve) => {
                image.addEventListener('load', resolve, { once: true });
                image.addEventListener('error', resolve, { once: true });
              });
            }));
          }

          function viewportWidth(scroller) {
            return Math.max(scroller ? scroller.clientWidth : 0, 1);
          }

          function viewportHeight(scroller) {
            return Math.max(scroller ? scroller.clientHeight : 0, 1);
          }

          function emitReady(pageCount) {
            currentPageCount = Math.max(pageCount || 1, 1);
            window.parent.postMessage({
              type: 'readbook-webview-ready',
              pageCount: currentPageCount
            }, '*');
          }

          function layoutContent() {
            const scroller = document.getElementById('page-scroll');
            const frame = document.getElementById('content-frame');
            const content = document.getElementById('chapter-content');
            if (!scroller || !frame || !content) {
              currentViewportWidth = 1;
              currentViewportHeight = 1;
              pageAxis = 'vertical';
              currentPageCount = 1;
              return currentPageCount;
            }

            currentViewportWidth = viewportWidth(scroller);
            currentViewportHeight = viewportHeight(scroller);

            content.style.transform = 'scale(1)';
            frame.style.width = 'auto';
            frame.style.height = 'auto';
            frame.style.marginLeft = '0px';
            frame.style.marginTop = '0px';

            const naturalWidth = Math.max(
              content.scrollWidth,
              content.offsetWidth,
              content.clientWidth,
              1
            );
            const naturalHeight = Math.max(
              content.scrollHeight,
              content.offsetHeight,
              content.clientHeight,
              1
            );

            const unscaledHorizontalPages = Math.max(1, Math.ceil((naturalWidth + 1) / currentViewportWidth));
            const unscaledVerticalPages = Math.max(1, Math.ceil((naturalHeight + 1) / currentViewportHeight));
            const shouldFitSinglePage = Math.max(unscaledHorizontalPages, unscaledVerticalPages) <= 2
              && (naturalWidth > currentViewportWidth || naturalHeight > currentViewportHeight);

            if (shouldFitSinglePage) {
              const fitScale = Math.min(
                1,
                currentViewportWidth / naturalWidth,
                currentViewportHeight / naturalHeight
              );
              const scaledWidth = Math.max(1, Math.round(naturalWidth * fitScale));
              const scaledHeight = Math.max(1, Math.round(naturalHeight * fitScale));

              frame.style.width = scaledWidth + 'px';
              frame.style.height = scaledHeight + 'px';
              frame.style.marginLeft = Math.max(Math.floor((currentViewportWidth - scaledWidth) / 2), 0) + 'px';
              frame.style.marginTop = Math.max(Math.floor((currentViewportHeight - scaledHeight) / 2), 0) + 'px';
              content.style.width = naturalWidth + 'px';
              content.style.height = naturalHeight + 'px';
              content.style.transform = 'scale(' + fitScale + ')';
              pageAxis = 'vertical';
              currentPageCount = 1;
              return currentPageCount;
            }

            frame.style.width = naturalWidth + 'px';
            frame.style.height = naturalHeight + 'px';
            frame.style.marginLeft = unscaledHorizontalPages === 1
              ? Math.max(Math.floor((currentViewportWidth - naturalWidth) / 2), 0) + 'px'
              : '0px';
            frame.style.marginTop = unscaledVerticalPages === 1
              ? Math.max(Math.floor((currentViewportHeight - naturalHeight) / 2), 0) + 'px'
              : '0px';

            pageAxis = unscaledHorizontalPages > unscaledVerticalPages ? 'horizontal' : 'vertical';
            currentPageCount = pageAxis === 'horizontal' ? unscaledHorizontalPages : unscaledVerticalPages;
            return currentPageCount;
          }

          window.__readbookShowPage = function(index) {
            const scroller = document.getElementById('page-scroll');
            const pageCount = layoutContent();
            const safeIndex = Math.max(0, Math.min(index, pageCount - 1));

            if (scroller) {
              if (pageAxis === 'horizontal') {
                scroller.scrollLeft = safeIndex * currentViewportWidth;
                scroller.scrollTop = 0;
              } else {
                scroller.scrollTop = safeIndex * currentViewportHeight;
                scroller.scrollLeft = 0;
              }
            }

            const number = document.getElementById('page-number');
            if (number) {
              number.textContent = String(safeIndex + 1) + ' / ' + String(pageCount);
            }

            return safeIndex;
          };

          function waitAndLayout() {
            waitForImages()
              .then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
              .then(() => {
                const pageCount = layoutContent();
                window.__readbookShowPage(0);
                emitReady(pageCount);
              });
          }

          window.addEventListener('resize', function() {
            const pageCount = layoutContent();
            emitReady(pageCount);
          });

          window.addEventListener('load', waitAndLayout);
        })();
      </script>
    </head>
    <body>
      <div id="page-stage">
        <div id="page-shell">
          <div id="page-title">${titleText}</div>
          <div id="page-scroll">
            <div id="content-frame">
              <div id="chapter-content">${params.renderHtml}</div>
            </div>
          </div>
          <div id="book-title">${bookTitleText}</div>
          <div id="page-number">1 / 1</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

const BookPreview: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [loadingBook, setLoadingBook] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  const [content, setContent] = useState('');
  const [pageBlocks, setPageBlocks] = useState<PreviewContentBlock[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentChapter, setCurrentChapter] = useState(1);
  const [theme, setTheme] = useState<ReaderTheme>('yellow');
  const [fontSize, setFontSize] = useState<ReaderFontSize>('medium');
  const [pageVersion, setPageVersion] = useState(0);
  const [turnDirection, setTurnDirection] = useState<TurnDirection>('forward');
  const [renderPayload, setRenderPayload] = useState<PreviewRenderPayload | null>(null);
  const [htmlPageCount, setHtmlPageCount] = useState(0);
  const [htmlPageIndex, setHtmlPageIndex] = useState(0);
  const [preferredHtmlPageIndex, setPreferredHtmlPageIndex] = useState<number | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const activeTheme = themePresets[theme];
  const activeFont = fontPresets[fontSize];

  const currentChapterMeta = useMemo(() => {
    if (!book?.chapters?.length) {
      return null;
    }

    return (
      book.chapters.find((chapterMeta) => currentPage >= chapterMeta.startPage && currentPage <= chapterMeta.endPage)
      || book.chapters.find((chapterMeta) => chapterMeta.index === currentChapter)
      || null
    );
  }, [book?.chapters, currentChapter, currentPage]);

  const contentBlocks = useMemo(
    () => {
      if (pageBlocks.length > 0) {
        return pageBlocks;
      }

      return content
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block) => ({ type: 'text' as const, text: block }));
    },
    [content, pageBlocks],
  );

  const leadingHeadingCount = useMemo(() => {
    if (!currentChapterMeta || currentPage !== currentChapterMeta.startPage) {
      return 0;
    }

    let count = 0;
    for (const block of contentBlocks.slice(0, 2)) {
      if (block.type === 'text' && (block.text || '').length <= 40) {
        count += 1;
      } else {
        break;
      }
    }

    return count;
  }, [contentBlocks, currentChapterMeta, currentPage]);

  const isWebviewPreview = renderPayload?.mode === 'xhtml';

  const webviewDocument = useMemo(() => {
    if (!renderPayload || !book) {
      return '';
    }

    return buildWebviewPreviewDocument({
      bookTitle: book.title,
      chapterTitle: currentChapterMeta?.title,
      renderHtml: renderPayload.html,
      renderCss: renderPayload.cssTexts,
      renderBaseUrl: renderPayload.baseUrl,
      theme: activeTheme,
      fontSize: activeFont.size,
    });
  }, [activeFont.size, activeTheme, book, currentChapterMeta?.title, renderPayload]);

  const updatePreviewQuery = (chapterIndex: number, page: number, slotIndex: number | null) => {
    const nextQuery: Record<string, string> = {
      chapter: String(chapterIndex),
      page: String(page),
    };

    if (slotIndex !== null && slotIndex >= 0) {
      nextQuery.slot = String(slotIndex + 1);
    }

    setSearchParams(nextQuery, { replace: true });
  };

  const loadPage = async (
    targetPage: number,
    direction: TurnDirection,
    bookData?: BookDetail,
    preferredSlotIndex: number | null = null,
  ) => {
    const currentBook = bookData || book;
    if (!id || !currentBook) {
      return;
    }

    const safePage = Math.min(Math.max(targetPage, 1), Math.max(currentBook.totalPages || 1, 1));
    const matchedChapter = currentBook.chapters?.find(
      (chapterMeta) => safePage >= chapterMeta.startPage && safePage <= chapterMeta.endPage,
    );

    setLoadingPage(true);
    try {
      const preview = await previewBook(Number.parseInt(id, 10), {
        chapter: matchedChapter?.index || currentChapter,
        page: safePage,
      });

      const chapterIndex = matchedChapter?.index || preview.chapter;
      const nextRenderPayload = preview.renderMode === 'xhtml' && preview.renderHtml && preview.renderBaseUrl
        ? {
          mode: 'xhtml' as const,
          baseUrl: preview.renderBaseUrl,
          html: preview.renderHtml,
          cssTexts: preview.renderCss || [],
        }
        : null;

      setTurnDirection(direction);
      setContent(preview.content);
      setPageBlocks(
        (preview.contentBlocks || []).map((block) => ({
          type: block.type === 'image' ? 'image' : 'text',
          text: block.text,
          assetUrl: block.assetUrl,
          alt: block.alt,
        })),
      );
      setCurrentPage(preview.page);
      setCurrentChapter(chapterIndex);
      setRenderPayload(nextRenderPayload);
      setHtmlPageCount(0);
      setHtmlPageIndex(preferredSlotIndex ?? 0);
      setPreferredHtmlPageIndex(nextRenderPayload ? preferredSlotIndex : null);
      updatePreviewQuery(chapterIndex, preview.page, nextRenderPayload ? preferredSlotIndex : null);
      setPageVersion((value) => value + 1);
    } catch (error) {
      message.error(getErrorMessage(error, '加载预览失败'));
    } finally {
      setLoadingPage(false);
    }
  };

  const syncHtmlPage = (slotIndex: number) => {
    const frameWindow = iframeRef.current?.contentWindow as PreviewFrameWindow | null;
    if (!frameWindow?.__readbookShowPage || !currentChapterMeta || htmlPageCount <= 0) {
      return;
    }

    const safeSlotIndex = clamp(slotIndex, 0, htmlPageCount - 1);
    const appliedSlotIndex = frameWindow.__readbookShowPage(safeSlotIndex);
    const nextPage = mapHtmlIndexToServerPage(appliedSlotIndex, currentChapterMeta, htmlPageCount);

    setHtmlPageIndex(appliedSlotIndex);
    setCurrentPage(nextPage);
    updatePreviewQuery(currentChapterMeta.index, nextPage, appliedSlotIndex);
  };

  function handleTurnPrev() {
    if (!book || loadingPage) {
      return;
    }

    if (isWebviewPreview && currentChapterMeta && htmlPageCount > 0) {
      if (htmlPageIndex > 0) {
        syncHtmlPage(htmlPageIndex - 1);
        return;
      }

      if (currentChapterMeta.startPage > 1) {
        void loadPage(currentChapterMeta.startPage - 1, 'backward');
      }
      return;
    }

    if (currentPage > 1) {
      void loadPage(currentPage - 1, 'backward');
    }
  }

  function handleTurnNext() {
    if (!book || loadingPage) {
      return;
    }

    if (isWebviewPreview && currentChapterMeta && htmlPageCount > 0) {
      if (htmlPageIndex < htmlPageCount - 1) {
        syncHtmlPage(htmlPageIndex + 1);
        return;
      }

      if (currentChapterMeta.endPage < book.totalPages) {
        void loadPage(currentChapterMeta.endPage + 1, 'forward');
      }
      return;
    }

    if (currentPage < book.totalPages) {
      void loadPage(currentPage + 1, 'forward');
    }
  }

  useEffect(() => {
    if (!id) {
      return;
    }

    const loadBook = async () => {
      setLoadingBook(true);
      try {
        const detail = await getBook(Number.parseInt(id, 10));
        setBook(detail);

        const initialPage = parsePositiveInt(searchParams.get('page'), 1);
        const initialChapter = parsePositiveInt(searchParams.get('chapter'), 1);
        const initialSlot = parseOptionalPositiveInt(searchParams.get('slot'));

        setCurrentPage(initialPage);
        setCurrentChapter(initialChapter);
        await loadPage(initialPage, 'forward', detail, initialSlot ? initialSlot - 1 : null);
      } catch (error) {
        message.error(getErrorMessage(error, '加载书籍详情失败'));
      } finally {
        setLoadingBook(false);
      }
    };

    void loadBook();
  }, [id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!book || loadingPage) {
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        handleTurnPrev();
      }

      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        handleTurnNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [book, currentPage, currentChapterMeta, loadingPage, htmlPageCount, htmlPageIndex, isWebviewPreview]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const payload = event.data;
      if (!payload || payload.type !== 'readbook-webview-ready') {
        return;
      }

      const slotCount = Number.parseInt(String(payload.pageCount), 10);
      if (!Number.isFinite(slotCount) || slotCount <= 0) {
        return;
      }

      setHtmlPageCount(slotCount);
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!isWebviewPreview || !currentChapterMeta || htmlPageCount <= 0) {
      return;
    }

    const targetSlotIndex = preferredHtmlPageIndex !== null
      ? clamp(preferredHtmlPageIndex, 0, htmlPageCount - 1)
      : mapServerPageToHtmlIndex(currentPage, currentChapterMeta, htmlPageCount);

    const frameWindow = iframeRef.current?.contentWindow as PreviewFrameWindow | null;
    if (!frameWindow?.__readbookShowPage) {
      return;
    }

    const appliedSlotIndex = frameWindow.__readbookShowPage(targetSlotIndex);
    setHtmlPageIndex(appliedSlotIndex);

    if (preferredHtmlPageIndex !== null) {
      updatePreviewQuery(
        currentChapterMeta.index,
        mapHtmlIndexToServerPage(appliedSlotIndex, currentChapterMeta, htmlPageCount),
        appliedSlotIndex,
      );
      setPreferredHtmlPageIndex(null);
    }
  }, [currentPage, currentChapterMeta, htmlPageCount, isWebviewPreview, preferredHtmlPageIndex, webviewDocument]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pageVersion]);

  const canTurnPrev = isWebviewPreview && currentChapterMeta
    ? htmlPageIndex > 0 || currentChapterMeta.startPage > 1
    : currentPage > 1;
  const canTurnNext = isWebviewPreview && currentChapterMeta
    ? (htmlPageCount > 0 && htmlPageIndex < htmlPageCount - 1) || currentChapterMeta.endPage < (book?.totalPages || 1)
    : currentPage < (book?.totalPages || 1);
  const progress = book?.totalPages ? Math.round((currentPage / book.totalPages) * 100) : 0;

  if (loadingBook || !book) {
    return (
      <div className={styles.loadingScreen}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div
      className={styles.reader}
      style={
        {
          '--reader-bg': activeTheme.background,
          '--reader-text': activeTheme.text,
          '--reader-secondary': activeTheme.secondary,
          '--reader-progress': activeTheme.progress,
          '--reader-shadow': activeTheme.shadow,
          '--reader-panel': activeTheme.panel,
          '--reader-font-size': `${activeFont.size}px`,
        } as React.CSSProperties
      }
    >
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/books/${book.id}`)}
            className={styles.ghostButton}
          >
            返回详情
          </Button>
          <div className={styles.bookMeta}>
            <span className={styles.bookTitle}>{book.title}</span>
            <span className={styles.chapterTitle}>
              {currentChapterMeta?.title || `第 ${currentChapter} 章`}
            </span>
          </div>
        </div>

        <div className={styles.controls}>
          <div className={styles.segment}>
            {(['small', 'medium', 'large'] as ReaderFontSize[]).map((option) => (
              <button
                key={option}
                type="button"
                className={option === fontSize ? styles.segmentActive : styles.segmentButton}
                onClick={() => setFontSize(option)}
              >
                字号{fontPresets[option].label}
              </button>
            ))}
          </div>
          <div className={styles.segment}>
            {(['yellow', 'white', 'dark'] as ReaderTheme[]).map((option) => (
              <button
                key={option}
                type="button"
                className={option === theme ? styles.segmentActive : styles.segmentButton}
                onClick={() => setTheme(option)}
              >
                {option === 'yellow' ? '护眼黄' : option === 'white' ? '白天' : '夜间'}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className={styles.stage}>
        <button
          type="button"
          className={styles.turnZoneLeft}
          onClick={handleTurnPrev}
          disabled={!canTurnPrev || loadingPage}
          aria-label="上一页"
        />
        <button
          type="button"
          className={styles.turnZoneRight}
          onClick={handleTurnNext}
          disabled={!canTurnNext || loadingPage}
          aria-label="下一页"
        />

        <div className={styles.pageChrome}>
          <div className={styles.pageHeader}>
            <span>{book.title}</span>
            <span>{currentPage} / {book.totalPages}</span>
          </div>

          <section
            key={`${pageVersion}-${currentPage}-${isWebviewPreview ? 'webview' : 'native'}`}
            className={turnDirection === 'forward' ? styles.pageBodyForward : styles.pageBodyBackward}
          >
            {loadingPage ? (
              <div className={styles.pageLoading}>
                <Spin />
              </div>
            ) : isWebviewPreview && renderPayload ? (
              <div className={styles.webviewViewport}>
                <iframe
                  ref={iframeRef}
                  title="书籍 WebView 预览"
                  srcDoc={webviewDocument}
                  className={styles.webviewFrame}
                />
              </div>
            ) : (
              <article className={styles.content}>
                {contentBlocks.map((block, index) => {
                  if (block.type === 'image') {
                    return (
                      <div key={`${currentPage}-${index}`} className={styles.imageBlock}>
                        <img src={block.assetUrl} alt={block.alt || ''} className={styles.pageImage} />
                      </div>
                    );
                  }

                  const blockText = block.text || '';

                  if (leadingHeadingCount === 2 && index === 0) {
                    return (
                      <p key={`${currentPage}-${index}`} className={styles.sectionKicker}>
                        {blockText}
                      </p>
                    );
                  }

                  if (
                    (leadingHeadingCount === 1 && index === 0)
                    || (leadingHeadingCount === 2 && index === 1)
                  ) {
                    return (
                      <h2 key={`${currentPage}-${index}`} className={styles.chapterHeading}>
                        {blockText}
                      </h2>
                    );
                  }

                  return (
                    <p key={`${currentPage}-${index}`} className={styles.paragraph}>
                      {blockText}
                    </p>
                  );
                })}
              </article>
            )}
          </section>

          <div className={styles.pageFooter}>
            <span>{currentChapterMeta?.title || `第 ${currentChapter} 章`}</span>
            <span>
              {isWebviewPreview && htmlPageCount > 0
                ? `本章 ${htmlPageIndex + 1} / ${htmlPageCount}`
                : `${progress}%`}
            </span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressBar} style={{ width: `${progress}%` }} />
          </div>
        </div>
      </main>

      <footer className={styles.bottomBar}>
        <Button
          icon={<LeftOutlined />}
          onClick={handleTurnPrev}
          disabled={!canTurnPrev || loadingPage}
          className={styles.ghostButton}
        >
          上一页
        </Button>
        <span className={styles.hint}>
          {isWebviewPreview
            ? 'WebView 预览会按章节本地分页，保留原始图文版式'
            : '支持方向键、PageUp/PageDown 与空格翻页'}
        </span>
        <Button
          icon={<RightOutlined />}
          iconPosition="end"
          onClick={handleTurnNext}
          disabled={!canTurnNext || loadingPage}
          className={styles.ghostButton}
        >
          下一页
        </Button>
      </footer>
    </div>
  );
};

export default BookPreview;
