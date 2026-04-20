import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';
import {
  parseBookDirect,
  getChapterContent,
  getPageContent,
  type ParseResult,
  type ParseBookPayload,
  type ChapterContent,
  type BookMetadata,
  type ParseMode,
} from './bookParserRuntime';

const runtimeJsPath = path.resolve(__dirname, 'bookParserRuntime.js');
const runtimeTsPath = path.resolve(__dirname, 'bookParserRuntime.ts');

function createWorkerBootstrap(): string {
  return `
    const { parentPort, workerData } = require('worker_threads');
    const fs = require('fs');
    const compiledPath = ${JSON.stringify(runtimeJsPath)};
    const sourcePath = ${JSON.stringify(runtimeTsPath)};

    const loadRuntime = () => {
      if (fs.existsSync(compiledPath)) {
        return require(compiledPath);
      }

      require('ts-node/register/transpile-only');
      return require(sourcePath);
    };

    (async () => {
      const runtime = loadRuntime();
      const result = await runtime.parseBookDirect(workerData);
      parentPort.postMessage({ result });
    })().catch((error) => {
      parentPort.postMessage({
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }
      });
    });
  `;
}

async function parseBookInWorker(payload: ParseBookPayload): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const worker = new Worker(createWorkerBootstrap(), {
      eval: true,
      workerData: payload,
    });

    worker.once('message', (message: { result?: ParseResult; error?: { message: string; stack?: string } }) => {
      settled = true;
      if (message.error) {
        const workerError = new Error(message.error.message);
        workerError.stack = message.error.stack;
        reject(workerError);
        return;
      }

      if (!message.result) {
        reject(new Error('书籍解析 Worker 未返回结果'));
        return;
      }

      resolve(message.result);
    });

    worker.once('error', (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    worker.once('exit', (code) => {
      if (!settled && code !== 0) {
        settled = true;
        reject(new Error(`书籍解析 Worker 异常退出，退出码: ${code}`));
      }
    });
  });
}

export { getChapterContent, getPageContent, type ParseResult, type ChapterContent, type BookMetadata, type ParseMode };

export class BookParser {
  private readonly payload: ParseBookPayload;

  constructor(bookId: number, format: string, originalPath: string, parsedDir?: string, parseMode?: ParseMode) {
    this.payload = { bookId, format, originalPath, parsedDir, parseMode };
  }

  async parse(): Promise<ParseResult> {
    try {
      return await parseBookInWorker(this.payload);
    } catch (error) {
      const canFallbackToLocal = !fs.existsSync(runtimeJsPath);
      if (!canFallbackToLocal) {
        throw error;
      }

      console.warn('书籍解析 Worker 不可用，已回退到主线程解析:', error);
      return parseBookDirect(this.payload);
    }
  }
}
