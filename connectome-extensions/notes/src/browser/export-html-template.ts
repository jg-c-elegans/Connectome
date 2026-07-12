/**
 * Standalone export template. The live preview webview uses `--vscode-*`
 * theme variables (see the `connectome-markdown-preview` plugin), but an
 * exported file has no webview theming host — so this mirrors the same
 * Connectome Dark palette with concrete hex values instead.
 */
export function buildExportHtml(title: string, bodyHtml: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>
body {
    margin: 0;
    padding: 32px 40px 80px;
    color: #F2F3F5;
    background-color: #050916;
    font-family: -apple-system, "Segoe UI", sans-serif;
    font-size: 15px;
    line-height: 1.6;
}
h1, h2, h3, h4, h5, h6 {
    color: #F2F3F5;
    font-weight: 650;
    letter-spacing: -0.01em;
}
h1, h2 {
    padding-bottom: 0.3em;
    border-bottom: 1px solid #3B3F89;
}
a, a:visited { color: #A667F4; }
code, tt {
    font-family: Consolas, "Courier New", monospace;
    background-color: #191D29;
    border-radius: 4px;
    padding: 0.1em 0.35em;
}
pre {
    background-color: #191D29;
    border: 1px solid #3B3F89;
    border-radius: 6px;
    padding: 12px 16px;
    overflow: auto;
}
pre code, pre tt { background: transparent; border-radius: 0; padding: 0; }
blockquote {
    margin: 0 0 16px;
    padding: 0 1em;
    color: #B9BBC6;
    border-left: 4px solid #3B3F89;
}
table { border-collapse: collapse; width: max-content; max-width: 100%; }
table th, table td { border: 1px solid #3B3F89; padding: 6px 12px; }
table th { background-color: #191D29; font-weight: 650; }
hr { border: none; border-top: 1px solid #3B3F89; }
img { max-width: 100%; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char] || char));
}
