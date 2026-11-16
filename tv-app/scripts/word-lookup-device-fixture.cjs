// Local-only synthetic API for ReaderWordLookupDeviceTest. No production credentials/data.
const http = require('node:http');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const book = process.env.READER_QA_BOOK_JSON ? JSON.parse(fs.readFileSync(process.env.READER_QA_BOOK_JSON, 'utf8')) :
  { content: 'Harry apple river slow retry', startPage: 1, endPage: 1 };
const policy = { dailyLimitMinutes: 120, continuousLimitMinutes: 45, restMinutes: 15,
  allowedFontSizes: ['small', 'medium', 'large'], allowedThemes: ['yellow', 'white', 'dark'] };
const lookups = new Map(), attempts = new Map();
http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/qa') return res.end(JSON.stringify([...lookups.values()]));
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  let data = {};
  if (req.url === '/api/tv/word-lookup') {
    const n = (attempts.get(body.requestId) || 0) + 1; attempts.set(body.requestId, n);
    if (body.word === 'retry' && n === 1) {
      res.statusCode = 400; return res.end(JSON.stringify({ code: 500, message: '测试断网重试' }));
    }
    if (body.word === 'slow') await new Promise(resolve => setTimeout(resolve, 800));
    const name = ['Harry', 'Jack', 'Annie', 'Will'].includes(body.word);
    data = { word: body.word, lemma: body.word.toLowerCase(),
      meaning: name ? `${body.word}（人物姓名）` : ({apple:'苹果',river:'河流',retry:'重试',slow:'缓慢的',monster:'怪物；怪兽'}[body.word] || '测试释义'),
      details: '', source: 'wordlearning', isPersonName: name, recorded: !name,
      candidateStatus: name ? 'excluded_name' : 'candidate' };
    if (!name) lookups.set(body.requestId, body);
  } else if (req.url === '/api/tv/word-audio') {
    const file = process.env.READER_QA_AUDIO_DIR && /^[A-Za-z]+$/.test(body.word) && path.join(process.env.READER_QA_AUDIO_DIR, body.word.toLowerCase()+'.mp3');
    if (!file || !fs.existsSync(file)) { res.statusCode=404; return res.end(JSON.stringify({code:500,message:'No test audio'})); }
    if (body.word === 'river') await new Promise(resolve => setTimeout(resolve, 900));
    const bytes=fs.readFileSync(file);
    data={word:body.word,audio:bytes.toString('base64'),audioSha256:crypto.createHash('sha256').update(bytes).digest('hex'),mimeType:'audio/mpeg'};
  } else if (req.url === '/api/tv/register') {
    data = { registered: true, bound: true, deviceToken: body.deviceToken };
  } else if (req.url === '/api/tv/bind-status') {
    data = { bound: true, child: { id: 1, name: '隔离测试' } };
  } else if (req.url === '/api/tv/sync') {
    data = { child: { id: 1, name: '隔离测试' }, policy,
      books: [{id: 90004, title: '神奇树屋', format: 'EPUB', totalPages: book.endPage, totalChapters: 1, bookmarks: []}] };
  } else if (req.url === '/api/tv/books/90004/chapters') {
    data = { chapters: [{index: 1, title: 'Into the Woods', pages: book.endPage}] };
  } else if (req.url === '/api/tv/books/90004/chapters/1/content') {
    data = {chapter: 1, title: 'Into the Woods', startPage: 1, endPage: book.endPage, content: book.content};
  } else if (req.url === '/api/tv/session/start') {
    data = { allowed: true, policy, sessionId: 'local-qa-session', todayReadMinutes: 0, continuousReadSeconds: 0 };
  } else if (req.url === '/api/tv/session/heartbeat') {
    data = { shouldLock: false, remainingContinuousMinutes: 45, remainingDailyMinutes: 120 };
  }
  res.end(JSON.stringify({ code: 0, data, message: '成功' }));
}).listen(8896, '127.0.0.1', () => console.log('Reader QA fixture listening on loopback:8896'));
