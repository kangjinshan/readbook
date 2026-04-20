import {
  extractContentBlocksFromEpubHtml,
  extractHeadingFromEpubHtml,
  extractStructuredTextFromEpubHtml,
  findFallbackEpubCoverHref
} from '../../src/services/bookParserRuntime';

describe('bookParserRuntime epub text extraction', () => {
  it('preserves headings and paragraph boundaries from epub html', () => {
    const html = `
      <html>
        <body>
          <h1>三个学生</h1>
          <p>第一段第一句。</p>
          <p>第二段<br/>第二行。</p>
          <blockquote><p>引用段落。</p></blockquote>
          <section epub:type="footnotes"><aside epub:type="footnote"><p>脚注内容</p></aside></section>
        </body>
      </html>
    `;

    expect(extractHeadingFromEpubHtml(html)).toBe('三个学生');
    expect(extractStructuredTextFromEpubHtml(html)).toBe([
      '三个学生',
      '',
      '第一段第一句。',
      '',
      '第二段',
      '第二行。',
      '',
      '引用段落。',
    ].join('\n'));
  });

  it('falls back to manifest cover-image entries when getCoverImage is empty', () => {
    const href = findFallbackEpubCoverHref({
      metadata: {
        metas: {
          cover: 'cover.jpg',
        },
      },
      manifest: {
        'cover.jpg': {
          id: 'cover.jpg',
          href: 'EPUB/images/cover.jpg',
          mediaType: 'image/jpeg',
          properties: 'cover-image',
        },
      },
    });

    expect(href).toBe('EPUB/images/cover.jpg');
  });

  it('extracts text and image blocks from epub html', () => {
    const html = `
      <html>
        <body>
          <h2>第一章</h2>
          <p>开场白。</p>
          <p><img src="/tmp/parsed/12/assets/panel-1.jpg" alt="插图一" width="1200" height="1800" /></p>
          <div>
            <svg>
              <image width="815" height="1172" xlink:href="/tmp/parsed/12/assets/panel-2.jpg"></image>
            </svg>
          </div>
          <p>结尾。</p>
        </body>
      </html>
    `;

    expect(extractContentBlocksFromEpubHtml(html, '/tmp/parsed/12')).toEqual([
      { type: 'text', text: '第一章\n\n开场白。' },
      { type: 'image', assetPath: 'assets/panel-1.jpg', alt: '插图一', width: 1200, height: 1800 },
      { type: 'image', assetPath: 'assets/panel-2.jpg', width: 815, height: 1172 },
      { type: 'text', text: '结尾。' },
    ]);
  });
});
