import { Router } from 'express';
import { config, ErrorCodes } from '../config';
import { queryOne } from '../database';
import { deviceAuth, requireDeviceBound } from '../middleware/deviceAuth';
import { asyncHandler } from '../middleware/errorHandler';
import { error, success } from '../utils/response';
import { createHash } from 'crypto';

const router = Router();

function wordlearningRequest(payload: Record<string, unknown>) {
  const url = new URL(config.wordlearning.apiUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) {
    throw new Error('invalid_wordlearning_url');
  }
  return fetch(url, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(35000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.wordlearning.integrationKey}` },
    body: JSON.stringify(payload)
  });
}

router.post('/word-audio', deviceAuth, requireDeviceBound, asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { bookId, word } = req.body;
  if (!Number.isSafeInteger(bookId) || bookId < 1 || typeof word !== 'string' || word.length > 64 ||
      !/^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(word)) {
    error(res, ErrorCodes.PARAM_ERROR); return;
  }
  const book = queryOne(`SELECT b.id FROM books b JOIN book_assignments ba ON ba.book_id=b.id
    WHERE b.id=? AND b.admin_id=? AND ba.child_id=?`, [bookId, req.adminId, req.childId]);
  if (!book) { error(res, ErrorCodes.BOOK_ACCESS_DENIED); return; }
  try {
    if (config.wordlearning.integrationKey.length < 32) throw new Error('audio_not_configured');
    const response = await wordlearningRequest({ action: 'reader_audio', reader_child_id: req.childId, word });
    if (!response.ok) throw new Error('audio_unavailable');
    const data = await response.json() as Record<string, unknown>;
    if (data.success !== true || data.word !== word || data.mimeType !== 'audio/mpeg' ||
        typeof data.audio !== 'string' || data.audio.length > 1_400_000 ||
        typeof data.audioSha256 !== 'string') throw new Error('invalid_audio');
    const bytes = Buffer.from(data.audio, 'base64');
    if (bytes.length < 12 || bytes.length > 1_000_000 || bytes.toString('base64') !== data.audio ||
        createHash('sha256').update(bytes).digest('hex') !== data.audioSha256) throw new Error('invalid_audio');
    success(res, { word, audio: data.audio, mimeType: 'audio/mpeg', audioSha256: data.audioSha256 });
  } catch {
    res.status(503).json({ code: ErrorCodes.SERVER_ERROR, message: '英文发音暂不可用' });
  }
}));

router.post('/word-lookup', deviceAuth, requireDeviceBound, asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const { bookId, pageNumber, word, context, selectionStart, requestId } = req.body;
  if (!Number.isSafeInteger(bookId) || bookId < 1 || !Number.isSafeInteger(pageNumber) || pageNumber < 1 ||
      typeof word !== 'string' || word.length > 64 || !/^[A-Za-z]+(?:['’-][A-Za-z]+)*$/.test(word) ||
      typeof context !== 'string' || context.length > 600 || !Number.isInteger(selectionStart) ||
      selectionStart < 0 || context.slice(selectionStart, selectionStart + word.length) !== word ||
      typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) {
    error(res, ErrorCodes.PARAM_ERROR, '请选择原文中的英文单词');
    return;
  }
  const book = queryOne(`SELECT b.title FROM books b JOIN book_assignments ba ON ba.book_id=b.id
    WHERE b.id=? AND b.admin_id=? AND ba.child_id=?`, [bookId, req.adminId, req.childId]);
  if (!book) {
    error(res, ErrorCodes.BOOK_ACCESS_DENIED);
    return;
  }
  const { apiUrl, integrationKey } = config.wordlearning;
  if (!apiUrl || integrationKey.length < 32) {
    res.status(503).json({ code: ErrorCodes.SERVER_ERROR, message: '查词服务尚未配置' });
    return;
  }
  try {
    const response = await wordlearningRequest({ action: 'reader_lookup', reader_child_id: req.childId,
      bookId, bookTitle: book.title, pageNumber, word, context, selectionStart, requestId });
    if (!response.ok) {
      const message = response.status === 404 ? '暂未找到可靠的中文释义' :
        response.status === 409 ? '请先关联可用的背单词账号' : '查词服务暂不可用，请重试';
      res.status(response.status === 404 ? 404 : 503).json({ code: ErrorCodes.SERVER_ERROR, message });
      return;
    }
    const data = await response.json() as Record<string, unknown>;
    if (data.success !== true || data.word !== word || typeof data.meaning !== 'string' ||
        !data.meaning || data.meaning.length > 3000 || typeof data.recorded !== 'boolean' ||
        typeof data.isPersonName !== 'boolean') {
      throw new Error('invalid_wordlearning_result');
    }
    // Explicit fields only: provider/admin metadata and credentials never reach clients.
    success(res, { word, lemma: data.lemma, meaning: data.meaning, details: data.details,
      source: data.source, sourceUrl: data.sourceUrl, isPersonName: data.isPersonName,
      recorded: data.recorded, candidateStatus: data.candidateStatus });
  } catch {
    res.status(503).json({ code: ErrorCodes.SERVER_ERROR, message: '查词服务暂不可用，请重试' });
  }
}));

export default router;
