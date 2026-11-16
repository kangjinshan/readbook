(function () {
  var selected = null;
  var preferredX = null, selectedY = null;
  function clear() {
    if (selected) selected.style.backgroundColor = '';
    selected = null;
    preferredX = selectedY = null;
  }
  function choose(node, box, keepX) {
    if (selected) selected.style.backgroundColor = '';
    selected = node;
    box = box || node.getBoundingClientRect();
    if (!keepX || preferredX === null) preferredX = (box.left + box.right) / 2;
    selectedY = (box.top + box.bottom) / 2;
    node.style.backgroundColor = 'rgba(186,201,155,.63)';
  }
  function lookup(node, resetColumn) {
    if (resetColumn || node !== selected) choose(node);
    var block = node.closest('p,li,h1,h2,h3,h4,h5,h6,td,blockquote') || node.parentElement;
    var range = document.createRange();
    range.setStart(block, 0); range.setEndBefore(node);
    var offset = range.toString().length;
    var text = block.textContent;
    var start = Math.max(0, offset - 180), end = Math.min(text.length, offset + node.textContent.length + 180);
    if (start && /[\uDC00-\uDFFF]/.test(text[start])) start++;
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    window.ReadBookBridge.onWordSelected(JSON.stringify({word: node.textContent,
      context: text.slice(start, end), selectionStart: offset - start}));
  }
  function visibleWords() {
    var scroller = document.getElementById('page-scroll').getBoundingClientRect();
    return Array.from(document.querySelectorAll('.readbook-word')).filter(function (word) {
      return Array.from(word.getClientRects()).some(function (r) {
        return r.width > 0 && r.left >= scroller.left - 1 && r.right <= scroller.right + 1 &&
          r.top >= scroller.top - 1 && r.bottom <= scroller.bottom + 1;
      });
    });
  }
  window.__readbookWordMove = function (delta, vertical) {
    var words = visibleWords();
    if (!words.length) return false;
    var index = words.indexOf(selected);
    if (vertical && index >= 0) {
      var viewport = document.getElementById('page-scroll').getBoundingClientRect();
      var boxes = [];
      words.forEach(function (word) {
        Array.from(word.getClientRects()).forEach(function (r) {
          if (r.width && r.top >= viewport.top - 1 && r.bottom <= viewport.bottom + 1 &&
              r.left >= viewport.left - 1 && r.right <= viewport.right + 1) {
            boxes.push({node: word, left: r.left, right: r.right, top: r.top, bottom: r.bottom,
              column: Math.min(1, Math.max(0, Math.floor(((r.left + r.right) / 2 - viewport.left) / (viewport.width / 2))))});
          }
        });
      });
      var current = boxes.filter(function (b) { return b.node === selected; })
        .sort(function (a, b) { return Math.abs((a.top + a.bottom) / 2 - selectedY) - Math.abs((b.top + b.bottom) / 2 - selectedY); })[0];
      if (!current) return true;
      var rows = [];
      boxes.filter(function (b) { return b.column === current.column; })
        .sort(function (a, b) { return a.top - b.top || a.left - b.left; })
        .forEach(function (b) {
          var row = rows.find(function (r) {
            return Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top) > Math.min(r.bottom-r.top, b.bottom-b.top) / 2;
          });
          if (row) row.boxes.push(b);
          else rows.push({top: b.top, bottom: b.bottom, boxes: [b]});
        });
      var rowIndex = rows.findIndex(function (r) { return r.boxes.indexOf(current) >= 0; });
      var row = rows[rowIndex + (delta < 0 ? -1 : 1)];
      if (!row) return true;
      var x = preferredX === null ? (current.left + current.right) / 2 : preferredX;
      function distance(b) { return Math.max(b.left - x, x - b.right, 0); }
      row.boxes.sort(function (a, b) { return distance(a) - distance(b) ||
        Math.abs((a.left+a.right)/2-x)-Math.abs((b.left+b.right)/2-x); });
      choose(row.boxes[0].node, row.boxes[0], true);
      return true;
    }
    choose(words[index < 0 ? 0 : Math.max(0, Math.min(words.length - 1, index + delta))]);
    return true;
  };
  window.__readbookWordConfirm = function () { if (selected) lookup(selected); };
  window.__readbookWordClear = clear;
  function install() {
    var content = document.getElementById('chapter-content');
    var walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    var nodes = [], node;
    while ((node = walker.nextNode())) {
      if (!node.parentElement.closest('script,style,svg,math,.readbook-word')) nodes.push(node);
    }
    nodes.forEach(function (node) {
      var text = node.textContent, regex = /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;
      var fragment = document.createDocumentFragment(), last = 0, match;
      while ((match = regex.exec(text))) {
        if (match[0].length > 64) continue;
        fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
        var span = document.createElement('span'); span.className = 'readbook-word';
        span.textContent = match[0]; span.style.cursor = 'pointer';
        span.addEventListener('click', function (event) {
          if (event.button !== 0) return;
          event.preventDefault(); event.stopPropagation(); lookup(event.currentTarget, true);
        });
        fragment.appendChild(span); last = match.index + match[0].length;
      }
      fragment.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode.replaceChild(fragment, node);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once: true});
  else install();
})();
