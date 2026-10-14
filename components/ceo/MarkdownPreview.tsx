/**
 * Minimal, dependency-free markdown renderer for CEO product previews.
 * Supports: headings, bold/italic, lists, tables, blockquotes, code,
 * horizontal rules, paragraphs. HTML is escaped — no raw HTML passthrough.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/`([^`\n]+)`/g, '<code class="rounded bg-slate-100 px-1">$1</code>');
  return out;
}

function renderTable(lines: string[]): string {
  const rows = lines.map((l) =>
    l
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => inline(c.trim()))
  );
  const head = rows[0];
  const body = rows.slice(2);
  return (
    '<div class="overflow-x-auto my-3"><table class="w-full text-sm border-collapse">' +
    '<thead><tr>' +
    head.map((c) => `<th class="border border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold">${c}</th>`).join('') +
    '</tr></thead><tbody>' +
    body
      .map(
        (r) =>
          '<tr>' +
          r.map((c) => `<td class="border border-slate-200 px-2 py-1 align-top">${c}</td>`).join('') +
          '</tr>'
      )
      .join('') +
    '</tbody></table></div>'
  );
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const html: string[] = [];
  let i = 0;
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (/^\|.*\|$/.test(t) && i + 1 < lines.length && /^\|?[\s:|-]+\|?$/.test(lines[i + 1].trim())) {
      closeList();
      const tbl: string[] = [line];
      i += 2;
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) {
        tbl.push(lines[i]);
        i++;
      }
      html.push(renderTable(tbl));
      continue;
    }

    if (/^#{1,4}\s/.test(t)) {
      closeList();
      const level = t.match(/^#+/)![0].length;
      const text = inline(t.replace(/^#+\s*/, ''));
      const cls =
        level === 1
          ? 'text-2xl font-bold mt-6 mb-3'
          : level === 2
            ? 'text-xl font-bold mt-5 mb-2'
            : 'text-lg font-semibold mt-4 mb-2';
      html.push(`<h${level} class="${cls}">${text}</h${level}>`);
    } else if (/^---+$/.test(t) || /^\*\*\*+$/.test(t)) {
      closeList();
      html.push('<hr class="my-4 border-slate-200" />');
    } else if (/^>\s?/.test(t)) {
      closeList();
      html.push(`<blockquote class="border-l-4 border-blue-200 pl-3 my-2 text-slate-600 italic">${inline(t.replace(/^>\s?/, ''))}</blockquote>`);
    } else if (/^[-*]\s+/.test(t)) {
      if (!inList) {
        html.push('<ul class="list-disc pl-5 my-2 space-y-1">');
        inList = true;
      }
      html.push(`<li>${inline(t.replace(/^[-*]\s+/, ''))}</li>`);
    } else if (/^\d+\.\s+/.test(t)) {
      closeList();
      html.push(`<p class="my-1">${inline(t)}</p>`);
    } else if (t === '') {
      closeList();
    } else {
      closeList();
      html.push(`<p class="my-2 leading-relaxed">${inline(t)}</p>`);
    }
    i++;
  }
  closeList();
  return html.join('\n');
}

export function MarkdownPreview({ markdown }: { markdown: string }) {
  return (
    <div
      className="text-slate-800 text-[15px]"
      dangerouslySetInnerHTML={{ __html: markdownToHtml(markdown) }}
    />
  );
}
