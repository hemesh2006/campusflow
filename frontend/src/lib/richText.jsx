// Lightweight Markdown-ish renderer for assistant chat replies — no
// extra dependency needed just for **bold**, *italic*, bullet lines,
// and automatically highlighting dates/times so schedule-sensitive
// info stands out even if the model's bold-syntax placement is a
// little off around them.

const DATE_TIME_RE = new RegExp(
  [
    "\\b\\d{1,2}\\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\\s+\\d{4})?\\b", // 24 Aug 2026
    "\\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s+\\d{1,2}(?:,\\s*\\d{4})?\\b", // Aug 24, 2026
    "\\b\\d{4}-\\d{2}-\\d{2}\\b", // 2026-08-24
    "\\b\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}\\b", // 24/08/2026
    "\\b\\d{1,2}:\\d{2}\\s?(?:AM|PM|am|pm)?\\b", // 10:30 AM / 22:15
    "\\b(?:Today|Tomorrow|Tonight|Yesterday)\\b",
  ].join("|"),
  "g"
);

function highlightDates(text, keyPrefix) {
  if (!text) return [];
  const out = [];
  let last = 0;
  let i = 0;
  let m;
  DATE_TIME_RE.lastIndex = 0;
  while ((m = DATE_TIME_RE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <mark key={`${keyPrefix}-d${i++}`} className="assistant-highlight">
        {m[0]}
      </mark>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function inline(text, keyPrefix) {
  // Bold/italic first, then run date highlighting over the leftover
  // plain segments so we never re-process an already-formatted span.
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter((t) => t !== "");
  return tokens.flatMap((tok, i) => {
    const key = `${keyPrefix}-${i}`;
    if (tok.startsWith("**") && tok.endsWith("**")) {
      return <strong key={key}>{tok.slice(2, -2)}</strong>;
    }
    if (tok.startsWith("*") && tok.endsWith("*")) {
      return <em key={key}>{tok.slice(1, -1)}</em>;
    }
    return highlightDates(tok, key);
  });
}

export function renderAssistantText(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const blocks = [];
  let listBuffer = [];

  const flushList = (key) => {
    if (!listBuffer.length) return;
    blocks.push(
      <ul key={`ul-${key}`} className="assistant-list">
        {listBuffer.map((item, i) => (
          <li key={i}>{inline(item, `li-${key}-${i}`)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (/^[-*]\s+/.test(line)) {
      listBuffer.push(line.replace(/^[-*]\s+/, ""));
      return;
    }
    flushList(idx);
    if (line === "") return; // collapse blank lines — spacing comes from block margins
    blocks.push(<p key={`p-${idx}`}>{inline(line, `p-${idx}`)}</p>);
  });
  flushList("end");

  return blocks;
}
