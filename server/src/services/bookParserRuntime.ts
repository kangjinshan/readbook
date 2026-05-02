import * as path from 'path';
import { promises as fsPromises, readFileSync } from 'fs';
import { config } from '../config';
import { queryOne } from '../database';
import { buildCoverDiskPath, buildStoredCoverPath, pickCoverExtension } from '../utils/bookCover';

const { readFile, writeFile, mkdir, readdir, copyFile, access, stat } = fsPromises;

// 懒加载书籍解析库
let pdfParser: any = null;
let mammothParser: any = null;
const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;

export interface BookMetadata {
  title: string;
  author: string;
  publisher: string;
  coverPath?: string;
  totalChapters: number;
  totalPages: number;
}

export type ParseMode = 'plain_text' | 'webview';

export interface ChapterContent {
  index: number;
  title: string;
  content: string;
  contentBlocks?: ChapterContentBlock[];
  renderMode?: 'xhtml';
  renderHtml?: string;
  renderCssTexts?: string[];
  startPage: number;
  endPage: number;
}

export type ChapterContentBlock = ChapterTextBlock | ChapterImageBlock;

export interface ChapterTextBlock {
  type: 'text';
  text: string;
}

export interface ChapterImageBlock {
  type: 'image';
  assetPath: string;
  alt?: string;
  width?: number;
  height?: number;
  widthPercent?: number;
}

export interface ParseResult {
  metadata: BookMetadata;
  chapters: ChapterContent[];
  originalPath: string;
}

export interface ParseBookPayload {
  bookId: number;
  format: string;
  originalPath: string;
  parsedDir?: string;
  parseMode?: ParseMode;
}

const BLOCK_TAG_PATTERN = /<\/?(?:address|article|aside|blockquote|br|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tr|ul)[^>]*>/gi;
const STRIP_TAG_PATTERN = /<[^>]*>/g;
const IMAGE_TAG_PATTERN = /<(img|image)\b[^>]*?(?:src|xlink:href|href)=["']([^"']+)["'][^>]*>/gi;

function removeNoiseFromEpubHtml(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<section[^>]*epub:type=["']footnotes["'][\s\S]*?<\/section>/gi, '')
    .replace(/<aside[^>]*epub:type=["']footnote["'][\s\S]*?<\/aside>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '');
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&ensp;/g, ' ')
    .replace(/&emsp;/g, ' ')
    .replace(/&thinsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function normalizeStructuredText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function extractStructuredTextFromEpubHtml(html: string): string {
  const withoutNoise = removeNoiseFromEpubHtml(html);

  const structured = withoutNoise
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(BLOCK_TAG_PATTERN, '\n')
    .replace(STRIP_TAG_PATTERN, '');

  return normalizeStructuredText(decodeHtmlEntities(structured));
}

export function extractHeadingFromEpubHtml(html: string): string | null {
  const match = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (!match) {
    return null;
  }

  const heading = normalizeStructuredText(decodeHtmlEntities(match[1].replace(STRIP_TAG_PATTERN, '')));
  return heading || null;
}

function extractNumericAttribute(tag: string, attributeName: string): number | undefined {
  const pattern = new RegExp(`${attributeName}=["'](\\d+(?:\\.\\d+)?)["']`, 'i');
  const value = tag.match(pattern)?.[1];
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function extractTagAttribute(tag: string, attributeName: string): string | undefined {
  const pattern = new RegExp(`${attributeName}=["']([^"']*)["']`, 'i');
  const value = tag.match(pattern)?.[1]?.trim();
  return value || undefined;
}

function normalizeFilesystemLikeUrl(value: string): string {
  if (!value) {
    return value;
  }

  if (value.startsWith('file://')) {
    return decodeURIComponent(value.replace(/^file:\/+/, '/'));
  }

  return value;
}

function resolveChapterAssetPath(src: string, parsedDir: string): string | null {
  if (!src) {
    return null;
  }

  const normalizedSrc = normalizeFilesystemLikeUrl(src);

  if (!path.isAbsolute(normalizedSrc)) {
    const cleaned = normalizedSrc.replace(/^\.?\//, '');
    if (
      !cleaned
      || cleaned.startsWith('../')
      || cleaned.startsWith('#')
      || cleaned.startsWith('data:')
      || cleaned.startsWith('http://')
      || cleaned.startsWith('https://')
      || cleaned.startsWith('epub:')
    ) {
      return null;
    }

    return cleaned.split(path.sep).join('/');
  }

  const absoluteSrc = path.resolve(normalizedSrc);
  const absoluteParsedDir = path.resolve(parsedDir);
  const relative = path.relative(absoluteParsedDir, absoluteSrc);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return relative.split(path.sep).join('/');
}

function rewriteAssetReferencesToRelative(content: string, parsedDir: string): string {
  return content
    .replace(/\b(src|xlink:href|poster)=["']([^"']+)["']/gi, (fullMatch, attributeName: string, rawValue: string) => {
      const relativePath = resolveChapterAssetPath(rawValue, parsedDir);
      if (!relativePath) {
        return fullMatch;
      }

      return `${attributeName}="${relativePath}"`;
    })
    .replace(/url\((['"]?)([^)'"]+)\1\)/gi, (fullMatch, quote: string, rawValue: string) => {
      const relativePath = resolveChapterAssetPath(rawValue, parsedDir);
      if (!relativePath) {
        return fullMatch;
      }

      return `url(${quote}${relativePath}${quote})`;
    });
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) {
    return null;
  }
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (!isPng) {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    const segmentLength = buffer.readUInt16BE(offset + 2);

    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function readGifDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 10) {
    return null;
  }
  const signature = buffer.subarray(0, 6).toString('ascii');
  if (signature !== 'GIF87a' && signature !== 'GIF89a') {
    return null;
  }

  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  };
}

function readImageDimensions(filePath: string): { width: number; height: number } | null {
  try {
    const buffer = readFileSync(filePath);
    return readPngDimensions(buffer) || readJpegDimensions(buffer) || readGifDimensions(buffer);
  } catch {
    return null;
  }
}

function extractClassNames(tag: string): string[] {
  const className = extractTagAttribute(tag, 'class');
  if (!className) {
    return [];
  }

  return className
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractWidthPercentFromTag(tag: string): number | undefined {
  const widthValue = extractTagAttribute(tag, 'width');
  if (!widthValue?.endsWith('%')) {
    return undefined;
  }

  const parsed = Number.parseFloat(widthValue.slice(0, -1));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function createImageBlockFromTag(
  tag: string,
  src: string,
  parsedDir: string,
  imageWidthByClassName: Map<string, number>
): ChapterImageBlock | null {
  const assetPath = resolveChapterAssetPath(src, parsedDir);
  if (!assetPath) {
    return null;
  }

  const classNames = extractClassNames(tag);
  const classWidthPercent = classNames
    .map((className) => imageWidthByClassName.get(className))
    .find((value): value is number => typeof value === 'number');
  const diskPath = path.resolve(parsedDir, assetPath);
  const dimensions = readImageDimensions(diskPath);

  return {
    type: 'image',
    assetPath,
    alt: extractTagAttribute(tag, 'alt'),
    width: extractNumericAttribute(tag, 'width') ?? dimensions?.width,
    height: extractNumericAttribute(tag, 'height') ?? dimensions?.height,
    widthPercent: extractWidthPercentFromTag(tag) ?? classWidthPercent,
  };
}

function appendTextBlock(blocks: ChapterContentBlock[], htmlSegment: string): void {
  const text = extractStructuredTextFromEpubHtml(htmlSegment);
  if (!text) {
    return;
  }

  const previous = blocks[blocks.length - 1];
  if (previous?.type === 'text') {
    previous.text = `${previous.text}\n\n${text}`.trim();
    return;
  }

  blocks.push({
    type: 'text',
    text,
  });
}

function isLikelyTocChapter(html: string, content: string): boolean {
  const normalizedContent = content.replace(/\s+/g, '');
  const anchorCount = (html.match(/<a\b/gi) || []).length;
  const headingCount = (html.match(/<h[1-6]\b/gi) || []).length;

  if (!normalizedContent.includes('目录')) {
    return false;
  }

  if (anchorCount < 3) {
    return false;
  }

  return normalizedContent.length <= 600 && headingCount <= 2;
}

export function extractContentBlocksFromEpubHtml(
  html: string,
  parsedDir: string,
  imageWidthByClassName: Map<string, number> = new Map()
): ChapterContentBlock[] {
  const withoutNoise = removeNoiseFromEpubHtml(html);
  const blocks: ChapterContentBlock[] = [];
  let lastIndex = 0;

  for (const match of withoutNoise.matchAll(IMAGE_TAG_PATTERN)) {
    const matchIndex = match.index ?? 0;
    appendTextBlock(blocks, withoutNoise.slice(lastIndex, matchIndex));

    const imageBlock = createImageBlockFromTag(match[0], match[2], parsedDir, imageWidthByClassName);
    if (imageBlock) {
      blocks.push(imageBlock);
    }

    lastIndex = matchIndex + match[0].length;
  }

  appendTextBlock(blocks, withoutNoise.slice(lastIndex));
  return blocks;
}

function isImageManifestItem(item: any): boolean {
  return typeof item?.mediaType === 'string' && item.mediaType.startsWith('image/');
}

export function findFallbackEpubCoverHref(epub: any): string | null {
  const manifest = epub?.manifest;
  if (!manifest || typeof manifest !== 'object') {
    return null;
  }

  const manifestEntries = Object.values(manifest).filter((item: any) => item && typeof item.href === 'string') as any[];

  const propertyMatch = manifestEntries.find((item: any) =>
    isImageManifestItem(item) && typeof item.properties === 'string' && item.properties.includes('cover-image')
  );
  if (propertyMatch?.href) {
    return propertyMatch.href;
  }

  const metaCoverId = epub?.metadata?.metas?.cover;
  if (typeof metaCoverId === 'string' && metaCoverId) {
    const directManifestMatch = manifest[metaCoverId];
    if (isImageManifestItem(directManifestMatch) && directManifestMatch.href) {
      return directManifestMatch.href;
    }

    const basenameMatch = manifestEntries.find((item: any) =>
      isImageManifestItem(item) && path.basename(item.href).toLowerCase() === metaCoverId.toLowerCase()
    );
    if (basenameMatch?.href) {
      return basenameMatch.href;
    }
  }

  const namedCoverMatch = manifestEntries.find((item: any) =>
    isImageManifestItem(item)
    && (
      String(item.id || '').toLowerCase().includes('cover')
      || String(item.href || '').toLowerCase().includes('cover')
    )
  );

  return namedCoverMatch?.href || null;
}

async function copyFallbackEpubCover(epub: any, bookId: number): Promise<string | null> {
  const href = findFallbackEpubCoverHref(epub);
  const zipFile = href ? epub?.zip?.jsZip?.file(href) : null;
  if (!href || !zipFile) {
    return null;
  }

  const extension = pickCoverExtension(href);
  const destPath = buildCoverDiskPath(bookId, extension);
  const buffer = await zipFile.async('nodebuffer');
  await mkdir(path.resolve(config.storage.covers), { recursive: true });
  await writeFile(destPath, buffer);
  return buildStoredCoverPath(bookId, extension);
}

class BookParserRunner {
  private readonly bookId: number;
  private readonly format: string;
  private readonly originalPath: string;
  private readonly parsedDir: string;
  private readonly parsedAssetDir: string;
  private readonly parseMode: ParseMode;

  constructor(payload: ParseBookPayload) {
    this.bookId = payload.bookId;
    this.format = payload.format.toLowerCase();
    this.originalPath = payload.originalPath;
    this.parsedDir = payload.parsedDir || path.join(config.storage.parsed, String(payload.bookId));
    this.parsedAssetDir = path.join(this.parsedDir, 'assets');
    this.parseMode = payload.parseMode === 'webview' ? 'webview' : 'plain_text';
  }

  async parse(): Promise<ParseResult> {
    try {
      await access(this.parsedDir);
    } catch {
      await mkdir(this.parsedDir, { recursive: true });
    }

    switch (this.format) {
      case 'epub':
        return this.parseEpub();
      case 'pdf':
        return this.parsePdf();
      case 'txt':
        return this.parseTxt();
      case 'docx':
        return this.parseDocx();
      case 'mobi':
      case 'azw3':
        return this.parseMobi();
      default:
        throw new Error(`不支持的格式: ${this.format}`);
    }
  }

  private async parseEpub(): Promise<ParseResult> {
    const { initEpubFile } = await dynamicImport('@lingo-reader/epub-parser');
    const epub = await initEpubFile(this.originalPath, this.parsedAssetDir);

    const epubMetadata = epub.getMetadata();
    const metadata: BookMetadata = {
      title: epubMetadata.title || path.basename(this.originalPath, '.epub'),
      author: epubMetadata.creator?.map((c: any) => c.contributor).join(', ') || '未知作者',
      publisher: epubMetadata.publisher || '',
      totalChapters: 0,
      totalPages: 0
    };

    const toc = epub.getToc();
    const idToTitle = new Map<string, string>();

    function extractTocTitles(items: any[]): void {
      for (const item of items) {
        if (item.id && item.label) {
          idToTitle.set(item.id, item.label);
        }
        if (item.children && item.children.length > 0) {
          extractTocTitles(item.children);
        }
      }
    }

    extractTocTitles(toc);

    const spine = epub.getSpine();
    const chapters: ChapterContent[] = [];
    let currentPage = 1;

    for (const item of spine) {
      if (!item.id || item.id === 'titlepage' || item.id === 'cover' || item.id === 'nav' || item.id === 'ncx') {
        continue;
      }

      if (item.mediaType !== 'application/xhtml+xml') {
        continue;
      }

      try {
        const chapterData = await epub.loadChapter(item.id);
        if (!chapterData?.html) {
          continue;
        }

        const imageWidthByClassName = await this.buildImageWidthByClassName(chapterData.css || []);
        const renderHtml = rewriteAssetReferencesToRelative(chapterData.html, this.parsedDir);
        const renderCssTexts = await this.loadRenderableCssTexts(chapterData.css || []);
        const contentBlocks = extractContentBlocksFromEpubHtml(chapterData.html, this.parsedDir, imageWidthByClassName);
        const content = contentBlocks
          .filter((block): block is ChapterTextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n\n')
          .trim();

        if (content.length < 200 && contentBlocks.length === 0) {
          continue;
        }

        if (isLikelyTocChapter(chapterData.html, content)) {
          continue;
        }

        if (content.includes('目录') && content.includes('返回') && content.length < 1000 && contentBlocks.every((block) => block.type === 'text')) {
          continue;
        }

        const pageCount = this.calculateStructuredPages(contentBlocks);
        let chapterTitle = idToTitle.get(item.id) || extractHeadingFromEpubHtml(chapterData.html) || undefined;

        if (!chapterTitle) {
          const lines = content.split('\n').filter((line) => line.trim().length > 0);
          for (const line of lines.slice(0, 3)) {
            const trimmed = line.trim();
            if (trimmed.length > 0 && trimmed.length < 30 && !trimmed.includes('目录')) {
              chapterTitle = trimmed;
              break;
            }
          }
        }

        chapters.push({
          index: chapters.length + 1,
          title: chapterTitle || `第${chapters.length + 1}章`,
          content,
          contentBlocks,
          ...(this.parseMode === 'webview' ? {
            renderMode: 'xhtml' as const,
            renderHtml,
            renderCssTexts,
          } : {}),
          startPage: currentPage,
          endPage: currentPage + pageCount - 1
        });
        currentPage += pageCount;
      } catch {
        continue;
      }
    }

    metadata.totalPages = currentPage - 1;
    metadata.totalChapters = chapters.length;

    const coverPath = epub.getCoverImage();
    if (coverPath) {
      const extension = pickCoverExtension(coverPath);
      const destPath = buildCoverDiskPath(this.bookId, extension);
      try {
        await mkdir(path.resolve(config.storage.covers), { recursive: true });
        await access(coverPath);
        await copyFile(coverPath, destPath);
        metadata.coverPath = buildStoredCoverPath(this.bookId, extension);
      } catch {
        // ignore cover copy failure
      }
    }

    if (!metadata.coverPath) {
      metadata.coverPath = await copyFallbackEpubCover(epub, this.bookId) || undefined;
    }

    await this.saveChapters(chapters);

    return {
      metadata,
      chapters,
      originalPath: this.originalPath
    };
  }

  private async parsePdf(): Promise<ParseResult> {
    if (!pdfParser) {
      pdfParser = require('pdf-parse');
    }

    const fileStat = await stat(this.originalPath);
    if (config.upload.maxPdfParseSize > 0 && fileStat.size > config.upload.maxPdfParseSize) {
      throw new Error(`PDF 文件过大，当前仅支持解析 ${Math.floor(config.upload.maxPdfParseSize / 1024 / 1024)}MB 以内的 PDF`);
    }

    const buffer = await readFile(this.originalPath);
    const data = await pdfParser(buffer);

    const metadata: BookMetadata = {
      title: data.info?.Title || path.basename(this.originalPath, '.pdf'),
      author: data.info?.Author || '未知作者',
      publisher: data.info?.Producer || '',
      totalChapters: 1,
      totalPages: data.numpages
    };

    const chapters: ChapterContent[] = [{
      index: 1,
      title: '正文',
      content: data.text.trim(),
      startPage: 1,
      endPage: data.numpages
    }];

    await this.saveChapters(chapters);

    return {
      metadata,
      chapters,
      originalPath: this.originalPath
    };
  }

  private async parseTxt(): Promise<ParseResult> {
    const content = await readFile(this.originalPath, 'utf-8');
    const lines = content.split('\n');

    const metadata: BookMetadata = {
      title: path.basename(this.originalPath, '.txt'),
      author: '未知作者',
      publisher: '',
      totalChapters: 0,
      totalPages: 0
    };

    const chapterPattern = /^(第[零一二三四五六七八九十百千万0-9]+[章节回集部篇])[^\n]*$/;
    const chapters: ChapterContent[] = [];
    let currentChapter: string[] = [];
    let chapterTitle = '开始';
    let chapterIndex = 0;
    let currentPage = 1;

    for (const line of lines) {
      const trimmedLine = line.trim();
      const match = trimmedLine.match(chapterPattern);

      if (match) {
        if (currentChapter.length > 0) {
          const chapterContent = currentChapter.join('\n');
          const pageCount = this.calculatePages(chapterContent);
          const nextIndex = chapterIndex === 0 ? 1 : chapterIndex;
          chapters.push({
            index: nextIndex,
            title: chapterTitle,
            content: chapterContent,
            startPage: currentPage,
            endPage: currentPage + pageCount - 1
          });
          currentPage += pageCount;
        }

        chapterIndex++;
        chapterTitle = trimmedLine;
        currentChapter = [];
      } else {
        currentChapter.push(line);
      }
    }

    if (currentChapter.length > 0) {
      const chapterContent = currentChapter.join('\n');
      const pageCount = this.calculatePages(chapterContent);
      const nextIndex = chapterIndex === 0 ? 1 : chapterIndex;
      chapters.push({
        index: nextIndex,
        title: chapterTitle,
        content: chapterContent,
        startPage: currentPage,
        endPage: currentPage + pageCount - 1
      });
      currentPage += pageCount;
    }

    if (chapters.length === 0) {
      const pageCount = this.calculatePages(content);
      chapters.push({
        index: 1,
        title: '正文',
        content,
        startPage: 1,
        endPage: pageCount
      });
      currentPage = pageCount + 1;
    }

    metadata.totalChapters = chapters.length;
    metadata.totalPages = currentPage - 1;

    await this.saveChapters(chapters);

    return {
      metadata,
      chapters,
      originalPath: this.originalPath
    };
  }

  private async parseDocx(): Promise<ParseResult> {
    if (!mammothParser) {
      mammothParser = require('mammoth');
    }

    const result = await mammothParser.extractRawText({ path: this.originalPath });
    const content = result.value;

    const metadata: BookMetadata = {
      title: path.basename(this.originalPath, '.docx'),
      author: '未知作者',
      publisher: '',
      totalChapters: 1,
      totalPages: this.calculatePages(content)
    };

    const chapters: ChapterContent[] = [{
      index: 1,
      title: '正文',
      content,
      startPage: 1,
      endPage: metadata.totalPages
    }];

    await this.saveChapters(chapters);

    return {
      metadata,
      chapters,
      originalPath: this.originalPath
    };
  }

  private async parseMobi(): Promise<ParseResult> {
    throw new Error('MOBI/AZW3格式暂不支持，请转换为EPUB或TXT格式');
  }

  private calculatePages(content: string): number {
    const charCount = content.length;
    const pageSize = 800;
    return Math.max(1, Math.ceil(charCount / pageSize));
  }

  private async buildImageWidthByClassName(cssParts: Array<{ href: string }>): Promise<Map<string, number>> {
    const widthByClassName = new Map<string, number>();

    for (const cssPart of cssParts) {
      try {
        const safePath = resolveChapterAssetPath(cssPart.href, this.parsedDir);
        if (!safePath) continue;
        const cssContent = await readFile(path.join(this.parsedDir, safePath), 'utf-8');
        const matches = cssContent.matchAll(/\.([a-zA-Z0-9_-]+)\s*\{[^}]*?\bwidth:\s*([0-9.]+)%/g);
        for (const match of matches) {
          const className = match[1]?.trim();
          const widthPercent = Number.parseFloat(match[2] || '');
          if (!className || !Number.isFinite(widthPercent) || widthPercent <= 0) {
            continue;
          }
          widthByClassName.set(className, widthPercent);
        }
      } catch {
        continue;
      }
    }

    return widthByClassName;
  }

  private async loadRenderableCssTexts(cssParts: Array<{ href: string }>): Promise<string[]> {
    const cssTexts: string[] = [];

    for (const cssPart of cssParts) {
      try {
        const safePath = resolveChapterAssetPath(cssPart.href, this.parsedDir);
        if (!safePath) continue;
        const cssContent = await readFile(path.join(this.parsedDir, safePath), 'utf-8');
        cssTexts.push(rewriteAssetReferencesToRelative(cssContent, this.parsedDir));
      } catch {
        continue;
      }
    }

    return cssTexts;
  }

  private calculateStructuredPages(blocks: ChapterContentBlock[]): number {
    if (blocks.length === 0) {
      return 1;
    }

    const textContent = blocks
      .filter((block): block is ChapterTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n\n')
      .trim();
    const textPageCount = textContent ? this.calculatePages(textContent) : 0;
    const imagePageCount = blocks.filter((block) => block.type === 'image').length;

    return Math.max(1, textPageCount + imagePageCount);
  }

  private async saveChapters(chapters: ChapterContent[]): Promise<void> {
    for (const chapter of chapters) {
      const chapterPath = path.join(this.parsedDir, `chapter_${chapter.index}.json`);
      await writeFile(chapterPath, JSON.stringify(chapter, null, 2), 'utf-8');
    }
  }
}

export async function parseBookDirect(payload: ParseBookPayload): Promise<ParseResult> {
  return new BookParserRunner(payload).parse();
}

export async function getChapterContent(bookId: number, chapterIndex: number): Promise<ChapterContent | null> {
  const chapterPath = path.join(
    config.storage.parsed,
    String(bookId),
    `chapter_${chapterIndex}.json`
  );

  try {
    await access(chapterPath);
    const content = await readFile(chapterPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function getPageContent(bookId: number, pageNumber: number): Promise<{
  content: string;
  chapter: number;
  contentBlocks?: ChapterContentBlock[];
} | null> {
  const parsedDir = path.join(config.storage.parsed, String(bookId));

  try {
    await access(parsedDir);
  } catch {
    return null;
  }

  // 先用数据库查询找到包含该页的章节，避免读取所有章节文件
  const chapterRow = queryOne(
    'SELECT chapter_index FROM chapters WHERE book_id = ? AND start_page <= ? AND end_page >= ?',
    [bookId, pageNumber, pageNumber]
  );

  if (chapterRow) {
    const chapterIndex = chapterRow.chapter_index as number;
    const chapterFile = path.join(parsedDir, `chapter_${chapterIndex}.json`);
    try {
      const content = await readFile(chapterFile, 'utf-8');
      const chapter: ChapterContent = JSON.parse(content);

      if (chapter.contentBlocks?.length) {
        const pages = buildPreviewPagesFromContentBlocks(chapter.contentBlocks);
        const pageIndex = pageNumber - chapter.startPage;
        const page = pages[pageIndex];
        if (page) {
          return {
            content: page.content,
            chapter: chapter.index,
            contentBlocks: page.contentBlocks,
          };
        }
      }

      const pageSize = 800;
      const pageIndex = pageNumber - chapter.startPage;
      const startIndex = pageIndex * pageSize;
      const endIndex = startIndex + pageSize;

      return {
        content: chapter.content.substring(startIndex, endIndex),
        chapter: chapter.index
      };
    } catch {
      // Fall through to scan
    }
  }

  // Fallback: scan files if DB query misses (e.g., no chapters table entry)
  const files = (await readdir(parsedDir)).filter((file) => file.startsWith('chapter_'));

  for (const file of files) {
    const chapterPath = path.join(parsedDir, file);
    const content = await readFile(chapterPath, 'utf-8');
    const chapter: ChapterContent = JSON.parse(content);

    if (pageNumber >= chapter.startPage && pageNumber <= chapter.endPage) {
      if (chapter.contentBlocks?.length) {
        const pages = buildPreviewPagesFromContentBlocks(chapter.contentBlocks);
        const pageIndex = pageNumber - chapter.startPage;
        const page = pages[pageIndex];
        if (!page) {
          return null;
        }

        return {
          content: page.content,
          chapter: chapter.index,
          contentBlocks: page.contentBlocks,
        };
      }

      const pageSize = 800;
      const pageIndex = pageNumber - chapter.startPage;
      const startIndex = pageIndex * pageSize;
      const endIndex = startIndex + pageSize;

      return {
        content: chapter.content.substring(startIndex, endIndex),
        chapter: chapter.index
      };
    }
  }

  return null;
}

function buildPreviewPagesFromContentBlocks(blocks: ChapterContentBlock[]): Array<{
  content: string;
  contentBlocks: ChapterContentBlock[];
}> {
  const pages: Array<{ content: string; contentBlocks: ChapterContentBlock[] }> = [];
  const pageSize = 800;

  for (const block of blocks) {
    if (block.type === 'image') {
      pages.push({
        content: '',
        contentBlocks: [block],
      });
      continue;
    }

    const text = block.text.trim();
    if (!text) {
      continue;
    }

    for (let start = 0; start < text.length; start += pageSize) {
      const slice = text.slice(start, start + pageSize).trim();
      if (!slice) {
        continue;
      }

      pages.push({
        content: slice,
        contentBlocks: [{
          type: 'text',
          text: slice,
        }],
      });
    }
  }

  return pages.length > 0 ? pages : [{
    content: '',
    contentBlocks: [],
  }];
}
