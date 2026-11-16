import express from 'express';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';
import { closeDatabase, execute, initDatabase } from '../../src/database';
import router from '../../src/routes/wordLookup';
import { createHash } from 'crypto';

async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function close(server: Server) {
  await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
}

describe('authenticated reading word lookup', () => {
  let temp: string, server: Server, upstream: Server, origin: string;
  let calls: Array<{ body: any; authorization: string | undefined }>;
  let mode: 'success' | 'error' | 'redirect' | 'bad-audio';
  const audioBytes = Buffer.from('ID3-isolated-audio-test-payload');
  const originalConfig = { ...config.wordlearning };
  const payload = { bookId: 1, pageNumber: 2, word: 'apple', context: 'An apple fell.',
    selectionStart: 3, requestId: 'lookup-event-000001' };

  beforeAll(async () => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'readbook-word-test-'));
    config.database.path = path.join(temp, 'test.db');
    await initDatabase();
    execute("INSERT INTO children(id,admin_id,name) VALUES(1,1,'QA')");
    execute("INSERT INTO devices(id,admin_id,child_id,device_token,last_online_at) VALUES(1,1,1,'reader-test',CURRENT_TIMESTAMP)");
    execute("INSERT INTO devices(id,admin_id,device_token,last_online_at) VALUES(2,1,'unbound-test',CURRENT_TIMESTAMP)");
    execute("INSERT INTO books(id,admin_id,title,original_path,format,total_pages) VALUES(1,1,'Test Book','test.txt','txt',5),(2,1,'Other Book','other.txt','txt',5)");
    execute('INSERT INTO book_assignments(book_id,child_id) VALUES(1,1)');
    upstream = createServer(async (req, res) => {
      let raw = ''; for await (const chunk of req) raw += chunk;
      calls.push({ body: JSON.parse(raw), authorization: req.headers.authorization });
      if (mode === 'error') { res.writeHead(502); res.end('upstream private failure'); return; }
      if (mode === 'redirect') { res.writeHead(302, { Location: `${origin}/external` }); res.end(); return; }
      res.setHeader('Content-Type', 'application/json');
      const parsed = JSON.parse(raw);
      if (parsed.action === 'reader_audio') {
        res.end(JSON.stringify({success:true,word:parsed.word,audio:audioBytes.toString('base64'),mimeType:'audio/mpeg',
          audioSha256:mode === 'bad-audio' ? 'wrong' : createHash('sha256').update(audioBytes).digest('hex'),privateKey:'must-not-leak'}));
        return;
      }
      res.end(JSON.stringify({ success: true, word: 'apple', lemma: 'apple', meaning: '苹果', details: '',
        source: 'wordlearning', recorded: true, isPersonName: false, candidateStatus: 'candidate',
        integrationKey: 'must-not-leak', user_id: 99 }));
    });
    config.wordlearning.apiUrl = `${await listen(upstream)}/api`;
    config.wordlearning.integrationKey = 'test-integration-key-0000000000000000';
    const app = express(); app.use(express.json()); app.use('/api/tv', router);
    server = createServer(app); origin = await listen(server);
  });
  afterAll(async () => {
    await close(server); await close(upstream); closeDatabase();
    Object.assign(config.wordlearning, originalConfig);
    fs.rmSync(temp, { recursive: true, force: true });
  });
  beforeEach(() => { calls = []; mode = 'success'; });
  async function lookup(body: any = payload, token = 'reader-test') {
    const response = await fetch(`${origin}/api/tv/word-lookup`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    return { response, body: await response.json() as any };
  }

  it('derives child and title from authorization, keeps retry ID, returns explicit safe fields', async () => {
    const { response, body } = await lookup({ ...payload, reader_child_id: 99, bookTitle: 'Forged' });
    expect(body.code).toBe(0);
    expect(body.data.meaning).toBe('苹果');
    expect(body.data.integrationKey).toBeUndefined();
    expect(body.data.user_id).toBeUndefined();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(calls[0].body).toMatchObject({ reader_child_id: 1, bookTitle: 'Test Book', requestId: payload.requestId });
    expect(calls[0].authorization).toBe(`Bearer ${config.wordlearning.integrationKey}`);
    expect(JSON.stringify(calls[0].body)).not.toContain('reader-test');
  });
  it('rejects invalid devices, unbound devices and unassigned books before calling wordlearning', async () => {
    expect((await lookup(payload, 'invalid')).body.code).toBe(2005);
    expect((await lookup(payload, 'unbound-test')).body.code).toBe(2004);
    expect((await lookup({ ...payload, bookId: 2 })).body.code).toBe(3005);
    expect(calls).toHaveLength(0);
  });
  it.each([{ word: '<script>' }, { selectionStart: 4 }, { context: 'x'.repeat(601) },
    { pageNumber: 0 }, { requestId: 'short' }])('rejects malformed or mismatched selection %p', async update => {
    expect((await lookup({ ...payload, ...update })).body.code).toBe(501);
    expect(calls).toHaveLength(0);
  });
  it('does not follow credential-bearing redirects or expose upstream failures', async () => {
    mode = 'redirect'; expect((await lookup()).response.status).toBe(503);
    mode = 'error'; const { response, body } = await lookup();
    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain('private');
    expect(calls).toHaveLength(2);
  });

  it('authorizes audio separately, verifies its hash and returns only the clicked word recording', async () => {
    async function audio(bookId: number) {
      const response=await fetch(`${origin}/api/tv/word-audio`,{method:'POST',
        headers:{'Content-Type':'application/json',Authorization:'Bearer reader-test'},body:JSON.stringify({bookId,word:'highest',word_id:999})});
      return {status:response.status,body:await response.json() as any};
    }
    expect((await audio(2)).body.code).toBe(3005);
    expect(calls).toHaveLength(0);
    const result=await audio(1);
    expect(result.status).toBe(200);
    expect(Buffer.from(result.body.data.audio,'base64')).toEqual(audioBytes);
    expect(result.body.data.word).toBe('highest');
    expect(result.body.data.privateKey).toBeUndefined();
    expect(calls[0].body).toEqual({action:'reader_audio',reader_child_id:1,word:'highest'});
    mode='bad-audio'; expect((await audio(1)).status).toBe(503);
  });
});
