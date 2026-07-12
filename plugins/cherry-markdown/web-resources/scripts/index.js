import Cherry from 'cherry-markdown';
import 'cherry-markdown/dist/cherry-markdown.css';
import '../index.css';
import './index.css';

const vscode = acquireVsCodeApi();

const basicConfig = {
  id: 'markdown',
  theme: [
    { className: 'connectome-dark', label: 'Connectome Dark' }
  ],
  themeSettings: {
    themeList: [
      { className: 'connectome-dark', label: 'Connectome Dark' }
    ],
    mainTheme: 'connectome-dark',
    codeBlockTheme: 'default',
  },
  engine: {
    global: {
      urlProcessor(url, _srcType) {
        return url;
      },
    },
    syntax: {
      codeBlock: {
        theme: 'twilight',
        mermaid: {
          svg2img: false,
        },
      },
      table: {
        enableChart: false,
      },
      fontEmphasis: {
        allowWhitespace: false,
      },
      strikethrough: {
        needWhitespace: false,
      },
      mathBlock: {
        engine: 'MathJax',
      },
      inlineMath: {
        engine: 'MathJax',
      },
      emoji: {
        useUnicode: true,
      },
      header: {
        anchorStyle: 'none',
      },
    },
  },
  toolbars: {
    toolbar: [
      'bold',
      'italic',
      'strikethrough',
      'underline',
      'sub',
      'sup',
      'size',
      'color',
      '|',
      'header',
      'list',
      '|',
      'panel',
      'justify',
      'detail',
      '|',
      'image',
      'link',
      'hr',
      'br',
      'code',
      'formula',
      'table',
    ],
    bubble: ['bold', 'italic', 'underline', 'strikethrough', 'sub', 'sup', 'quote', '|', 'size', 'color'],
    sidebar: ['copy'],
    customMenu: {},
    toc: false,
  },
  editor: {
    defaultModel: 'editOnly',
    fileUpload: (file, callback) => {
      callback(file.path || file.name);
    },
  },
  previewer: {
    lazyLoadImg: {},
  },
  keydown: [],
  callback: {
    changeString2Pinyin: (str) => str,
    beforeImageMounted(srcProp, srcValue) {
      const { _activeTextEditorPath } = window;
      if (isHttpUrl(srcValue) || isDataUrl(srcValue)) {
        return { src: srcValue };
      }
      try {
        const absolutePath = new URL(srcValue, _activeTextEditorPath).href;
        return { src: absolutePath };
      } catch (e) {
        return { src: srcValue };
      }
    },
  },
};

function isDataUrl(url) {
  return /^data:/.test(url);
}

function isHttpUrl(url) {
  return /https?:\/\//.test(url);
}

const mdInfo = JSON.parse(document.getElementById('markdown-info').value);
const locale = 'en_US';

const config = Object.assign({}, basicConfig, { value: mdInfo.text, locale });
const cherry = new Cherry(config);

function updateSemanticHighlights(markdown) {
  if (!window.CSS?.highlights || typeof Highlight === 'undefined') return;
  const sourceLines = markdown.split(/\r?\n/);
  const renderedLines = [...document.querySelectorAll('.cherry-editor .cm-content .cm-line')];
  if (!renderedLines.length) return;

  const groups = {
    'frontmatter-key': [], 'frontmatter-value': [], 'frontmatter-delimiter': [],
    'markdown-bracket': [], 'markdown-link-text': [], 'markdown-link-target': [],
    'markdown-marker': [], 'markdown-emphasis': [],
  };
  const addRange = (lineElement, kind, start, finish) => {
    if (finish <= start) return;
    const nodes = [];
    const walker = document.createTreeWalker(lineElement, NodeFilter.SHOW_TEXT);
    let node;
    let offset = 0;
    while ((node = walker.nextNode())) {
      nodes.push({ node, start: offset, end: offset + node.data.length });
      offset += node.data.length;
    }
    const first = nodes.find(entry => start >= entry.start && start < entry.end);
    const last = [...nodes].reverse().find(entry => finish > entry.start && finish <= entry.end);
    if (first && last) {
      const range = new Range();
      range.setStart(first.node, start - first.start);
      range.setEnd(last.node, finish - last.start);
      groups[kind].push(range);
    }
  };

  let sourceCursor = 0;
  const visibleLines = renderedLines.map((lineElement, renderedIndex) => {
    if (renderedLines.length === sourceLines.length) {
      return { lineElement, sourceLine: sourceLines[renderedIndex], sourceIndex: renderedIndex };
    }
    const text = lineElement.textContent || '';
    let sourceIndex = sourceLines.findIndex((candidate, index) => index >= sourceCursor && candidate === text);
    if (sourceIndex < 0) sourceIndex = sourceLines.findIndex((candidate, index) => index >= sourceCursor && candidate.trim() === text.trim());
    if (sourceIndex < 0) sourceIndex = sourceCursor;
    sourceCursor = sourceIndex + 1;
    return { lineElement, sourceLine: sourceLines[sourceIndex] || text, sourceIndex };
  });

  const frontmatterEnd = sourceLines[0]?.trim() === '---'
    ? sourceLines.findIndex((line, index) => index > 0 && line.trim() === '---')
    : -1;
  visibleLines.forEach(({ lineElement, sourceLine, sourceIndex }) => {
    const line = lineElement.textContent || '';
    const leadingOffset = Math.max(0, line.indexOf(sourceLine.trimStart()));

    if (frontmatterEnd >= 0 && sourceIndex <= frontmatterEnd) {
      const trimmed = sourceLine.trim();
      if (trimmed === '---') {
        addRange(lineElement, 'frontmatter-delimiter', leadingOffset, leadingOffset + 3);
        return;
      }
      const colon = sourceLine.indexOf(':');
      if (colon >= 0) {
        const keyStart = sourceLine.search(/\S/);
        addRange(lineElement, 'frontmatter-key', leadingOffset + keyStart, leadingOffset + colon + 1);
        const valueStart = sourceLine.slice(colon + 1).search(/\S/);
        if (valueStart >= 0) {
          addRange(lineElement, 'frontmatter-value', leadingOffset + colon + 1 + valueStart, leadingOffset + sourceLine.length);
        }
      } else if (trimmed) {
        addRange(lineElement, 'frontmatter-value', leadingOffset, leadingOffset + trimmed.length);
      }
      return;
    }

    const patterns = [
      { regex: /(!?)(\[\[)(.*?)(\]\])/g, apply: m => {
        const base = m.index + m[1].length;
        addRange(lineElement, 'markdown-bracket', base, base + 2);
        addRange(lineElement, 'markdown-link-text', base + 2, base + 2 + m[3].length);
        addRange(lineElement, 'markdown-bracket', base + 2 + m[3].length, base + 4 + m[3].length);
      } },
      { regex: /(!?)(\[)([^\]]*)(\])(?:\(([^)]*)\))?/g, apply: m => {
        const base = m.index + m[1].length;
        addRange(lineElement, 'markdown-bracket', base, base + 1);
        addRange(lineElement, 'markdown-link-text', base + 1, base + 1 + m[3].length);
        addRange(lineElement, 'markdown-bracket', base + 1 + m[3].length, base + 2 + m[3].length);
        if (m[5] !== undefined) {
          const targetStart = base + m[2].length + m[3].length + m[4].length;
          addRange(lineElement, 'markdown-bracket', targetStart, targetStart + 1);
          addRange(lineElement, 'markdown-link-target', targetStart + 1, targetStart + 1 + m[5].length);
          addRange(lineElement, 'markdown-bracket', targetStart + 1 + m[5].length, targetStart + 2 + m[5].length);
        }
      } },
      { regex: /^(#{1,6})(?=\s)/g, apply: m => addRange(lineElement, 'markdown-marker', m.index, m.index + m[1].length) },
      { regex: /(\*\*|__|~~)(.+?)\1/g, apply: m => addRange(lineElement, 'markdown-emphasis', m.index, m.index + m[0].length) },
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(sourceLine))) pattern.apply(match);
    }
  });

  for (const [kind, ranges] of Object.entries(groups)) {
    CSS.highlights.set(`connectome-${kind}`, new Highlight(...ranges));
  }
}

requestAnimationFrame(() => updateSemanticHighlights(mdInfo.text));
const editorRoot = document.querySelector('.cherry-editor .cm-content');
if (editorRoot) {
  let semanticRefresh;
  new MutationObserver(() => {
    clearTimeout(semanticRefresh);
    semanticRefresh = setTimeout(() => updateSemanticHighlights(cherry.getValue()), 20);
  }).observe(editorRoot, { childList: true, subtree: true });
}

cherry.onChange((newValue) => {
  requestAnimationFrame(() => updateSemanticHighlights(newValue));
  if (window.disableEditListener) {
    return true;
  }
  vscode.postMessage({
    type: 'cherry-change',
    data: newValue,
  });
});

let editTimeOut;
window.addEventListener('message', (e) => {
  const { cmd, data } = e.data;
  switch (cmd) {
    case 'editor-change':
      window.disableEditListener = true;
      cherry.setValue(data.text);
      requestAnimationFrame(() => updateSemanticHighlights(data.text));
      editTimeOut && clearTimeout(editTimeOut);
      editTimeOut = setTimeout(() => {
        window.disableEditListener = false;
      }, 500);
      break;
  }
});
