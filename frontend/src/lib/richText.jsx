import React, { useState } from "react";
import { FileText, FileCode, Download, Eye, EyeOff, Check, Copy } from "lucide-react";

// Lightweight Markdown & rich text renderer for chat messages & files.
// Handles **bold**, *italic*, headers (#, ##, ###), lists (- and 1.), code blocks,
// blockquotes (>), inline code (`code`), @mentions, and date/time highlights.

const DATE_TIME_RE = new RegExp(
  [
    "\\b\\d{1,2}\\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\\s+\\d{4})?\\b",
    "\\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s+\\d{1,2}(?:,\\s*\\d{4})?\\b",
    "\\b\\d{4}-\\d{2}-\\d{2}\\b",
    "\\b\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}\\b",
    "\\b\\d{1,2}:\\d{2}\\s?(?:AM|PM|am|pm)?\\b",
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
  if (!text) return null;

  // Split by inline code first: `code`
  const codeTokens = text.split(/(`[^`]+`)/g);
  return codeTokens.flatMap((tok, cIdx) => {
    if (tok.startsWith("`") && tok.endsWith("`") && tok.length > 2) {
      return (
        <code
          key={`${keyPrefix}-code-${cIdx}`}
          style={{
            background: "rgba(255, 255, 255, 0.1)",
            padding: "1px 5px",
            borderRadius: 4,
            fontSize: "0.88em",
            fontFamily: "var(--font-mono, monospace)",
            color: "var(--accent-violet, #a78bfa)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          {tok.slice(1, -1)}
        </code>
      );
    }

    // Split by markdown links: [text](url)
    const linkTokens = tok.split(/(\[[^\]]+\]\([^)]+\))/g);
    return linkTokens.flatMap((lTok, lIdx) => {
      const linkMatch = lTok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return (
          <a
            key={`${keyPrefix}-link-${cIdx}-${lIdx}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            style={{ color: "var(--accent-blue, #60a5fa)", textDecoration: "underline" }}
          >
            {linkMatch[1]}
          </a>
        );
      }

      // Split by bold / italic
      const formatTokens = lTok.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter((t) => t !== "");
      return formatTokens.flatMap((fTok, fIdx) => {
        const k = `${keyPrefix}-${cIdx}-${lIdx}-${fIdx}`;
        if (fTok.startsWith("**") && fTok.endsWith("**") && fTok.length > 4) {
          return <strong key={k}>{fTok.slice(2, -2)}</strong>;
        }
        if (fTok.startsWith("*") && fTok.endsWith("*") && fTok.length > 2) {
          return <em key={k}>{fTok.slice(1, -1)}</em>;
        }

        // Split by @mentions: @username
        const mentionTokens = fTok.split(/(@[\w.-]+)/g);
        return mentionTokens.flatMap((mTok, mIdx) => {
          if (mTok.startsWith("@") && mTok.length > 1) {
            return (
              <span
                key={`${k}-m-${mIdx}`}
                style={{
                  color: "var(--accent-blue, #60a5fa)",
                  fontWeight: 600,
                  background: "rgba(59, 130, 246, 0.15)",
                  padding: "0 4px",
                  borderRadius: 4,
                }}
              >
                {mTok}
              </span>
            );
          }
          return highlightDates(mTok, `${k}-m-${mIdx}`);
        });
      });
    });
  });
}

function CodeBlock({ code, lang, blockKey }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      key={`codeblock-${blockKey}`}
      style={{
        margin: "8px 0",
        borderRadius: 8,
        background: "rgba(0, 0, 0, 0.4)",
        border: "1px solid var(--glass-border)",
        overflow: "hidden",
        fontSize: 12.5,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "4px 10px",
          background: "rgba(255, 255, 255, 0.04)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          color: "var(--text-lo)",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 11,
        }}
      >
        <span>{lang || "code"}</span>
        <button
          onClick={handleCopy}
          style={{
            background: "none",
            border: "none",
            color: copied ? "var(--accent-emerald)" : "inherit",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10.5,
            padding: "2px 4px",
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre style={{ margin: 0, padding: "8px 12px", overflowX: "auto", fontFamily: "var(--font-mono, monospace)", lineHeight: 1.45 }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function renderFormattedMessage(text) {
  if (!text) return null;
  const lines = text.split("\n");
  const blocks = [];

  let listBuffer = [];
  let isOrderedList = false;
  let codeBuffer = [];
  let inCodeBlock = false;
  let codeLang = "";

  const flushList = (key) => {
    if (!listBuffer.length) return;
    const ListTag = isOrderedList ? "ol" : "ul";
    blocks.push(
      <ListTag
        key={`list-${key}`}
        className="assistant-list"
        style={{
          margin: "4px 0 6px",
          paddingLeft: isOrderedList ? 22 : 18,
          lineHeight: 1.5,
        }}
      >
        {listBuffer.map((item, i) => (
          <li key={i} style={{ marginBottom: 3 }}>
            {inline(item, `li-${key}-${i}`)}
          </li>
        ))}
      </ListTag>
    );
    listBuffer = [];
    isOrderedList = false;
  };

  lines.forEach((raw, idx) => {
    const trimmed = raw.trim();

    // Fenced code blocks ```
    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        // End code block
        blocks.push(
          <CodeBlock
            key={`cb-${idx}`}
            code={codeBuffer.join("\n")}
            lang={codeLang}
            blockKey={idx}
          />
        );
        codeBuffer = [];
        inCodeBlock = false;
        codeLang = "";
      } else {
        // Start code block
        flushList(idx);
        inCodeBlock = true;
        codeLang = trimmed.slice(3).trim();
      }
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(raw);
      return;
    }

    // Markdown Headers
    if (trimmed.startsWith("### ")) {
      flushList(idx);
      blocks.push(
        <h5
          key={`h3-${idx}`}
          style={{ fontSize: 13.5, fontWeight: 700, margin: "8px 0 3px", color: "var(--text-hi)" }}
        >
          {inline(trimmed.slice(4), `h3-${idx}`)}
        </h5>
      );
      return;
    }
    if (trimmed.startsWith("## ")) {
      flushList(idx);
      blocks.push(
        <h4
          key={`h2-${idx}`}
          style={{ fontSize: 14.5, fontWeight: 700, margin: "10px 0 4px", color: "var(--text-hi)" }}
        >
          {inline(trimmed.slice(3), `h2-${idx}`)}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith("# ")) {
      flushList(idx);
      blocks.push(
        <h3
          key={`h1-${idx}`}
          style={{ fontSize: 15.5, fontWeight: 700, margin: "12px 0 5px", color: "var(--text-hi)" }}
        >
          {inline(trimmed.slice(2), `h1-${idx}`)}
        </h3>
      );
      return;
    }

    // Horizontal Rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      flushList(idx);
      blocks.push(
        <hr
          key={`hr-${idx}`}
          style={{ border: "none", borderTop: "1px solid var(--glass-border)", margin: "8px 0" }}
        />
      );
      return;
    }

    // Blockquote >
    if (trimmed.startsWith("> ")) {
      flushList(idx);
      blocks.push(
        <blockquote
          key={`bq-${idx}`}
          style={{
            borderLeft: "3px solid var(--accent-blue, #3b82f6)",
            margin: "4px 0 6px",
            paddingLeft: 10,
            color: "var(--text-mid)",
            fontStyle: "italic",
          }}
        >
          {inline(trimmed.slice(2), `bq-${idx}`)}
        </blockquote>
      );
      return;
    }

    // Unordered List (- item or * item)
    if (/^[-*]\s+/.test(trimmed)) {
      if (isOrderedList) flushList(idx);
      isOrderedList = false;
      listBuffer.push(trimmed.replace(/^[-*]\s+/, ""));
      return;
    }

    // Ordered List (1. item, 2. item)
    if (/^\d+\.\s+/.test(trimmed)) {
      if (!isOrderedList) flushList(idx);
      isOrderedList = true;
      listBuffer.push(trimmed.replace(/^\d+\.\s+/, ""));
      return;
    }

    // Plain line or paragraph
    flushList(idx);
    if (trimmed === "") {
      // Small spacing line
      return;
    }

    blocks.push(
      <p key={`p-${idx}`} style={{ margin: "3px 0 4px", lineHeight: 1.55 }}>
        {inline(trimmed, `p-${idx}`)}
      </p>
    );
  });

  if (inCodeBlock && codeBuffer.length) {
    blocks.push(
      <CodeBlock
        key="cb-end"
        code={codeBuffer.join("\n")}
        lang={codeLang}
        blockKey="end"
      />
    );
  }
  flushList("end");

  return blocks;
}

// Retain alias for existing callers
export const renderAssistantText = renderFormattedMessage;

// Component to render file attachments (Markdown files, PDFs, etc.)
export function MessageFileAttachment({ attachment }) {
  const [showPreview, setShowPreview] = useState(false);
  if (!attachment) return null;

  const isMarkdown =
    attachment.name?.endsWith(".md") ||
    attachment.name?.endsWith(".markdown") ||
    attachment.type === "markdown";

  const isText =
    isMarkdown ||
    attachment.name?.endsWith(".txt") ||
    attachment.name?.endsWith(".json");

  // If text is embedded directly or encoded in data URL
  let fileTextContent = "";
  if (attachment.content) {
    fileTextContent = attachment.content;
  } else if (typeof attachment.data === "string" && attachment.data.startsWith("data:text/")) {
    try {
      fileTextContent = decodeURIComponent(escape(atob(attachment.data.split(",")[1])));
    } catch {
      fileTextContent = "";
    }
  }

  const handleDownload = () => {
    const blob = new Blob([fileTextContent || attachment.data || ""], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = attachment.name || "file.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        margin: "6px 0",
        borderRadius: 10,
        background: "rgba(255, 255, 255, 0.06)",
        border: "1px solid var(--glass-border)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          {isMarkdown ? (
            <FileCode size={20} color="var(--accent-violet, #a78bfa)" />
          ) : (
            <FileText size={20} color="var(--accent-blue, #60a5fa)" />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-hi)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {attachment.name || "document.md"}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--text-lo)" }}>
              {isMarkdown ? "Markdown Document" : "Text Attachment"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {fileTextContent && (
            <button
              onClick={() => setShowPreview((p) => !p)}
              style={{
                background: showPreview ? "var(--accent-blue)" : "rgba(255,255,255,0.08)",
                border: "none",
                borderRadius: 6,
                padding: "4px 8px",
                color: "#fff",
                fontSize: 11,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontWeight: 600,
              }}
            >
              {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
              {showPreview ? "Hide" : "View"}
            </button>
          )}
          <button
            onClick={handleDownload}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "none",
              borderRadius: 6,
              padding: "4px 8px",
              color: "var(--text-lo)",
              fontSize: 11,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Download size={13} />
          </button>
        </div>
      </div>

      {showPreview && fileTextContent && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(0, 0, 0, 0.3)",
            borderTop: "1px solid var(--glass-border)",
            fontSize: 13,
            lineHeight: 1.55,
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {renderFormattedMessage(fileTextContent)}
        </div>
      )}
    </div>
  );
}
