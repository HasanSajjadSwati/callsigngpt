'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat, type ChatMessage, type ChatContentPart } from '@/lib/streamChat';
import { UIMsg, Attachment } from '@/lib/chat';
import { getApiBase } from '@/lib/apiBase';
import { modelCache } from '@/lib/modelCache';

type UseStreamingChatArgs = {
  accessToken?: string;
  model: string;
  msgs: UIMsg[];
  setMsgs: React.Dispatch<React.SetStateAction<UIMsg[]>>;
  ensureConversation: () => Promise<void> | void;
  appendMessages: (...m: UIMsg[]) => Promise<void> | void;
  conversationId?: string | null;
  /** Optional: if you want to refresh sidebar after first assistant token etc. */
  onSidebarDirty?: () => void;
  /** Optional: surface errors (e.g., quota exceeded) to the UI */
  onError?: (message: string) => void;
  /** Optional: called when backend falls back to a different model mid-call */
  onModelFallback?: (fallbackKey: string, reason?: string) => void;
};

type SendPayload = {
  text?: string;
  attachment?: Attachment;
  searchMode?: 'auto' | 'always' | 'off';
};

const formatBytes = (size: number) => {
  if (size < 1024) return `${size} B`;
  const units = ['KB', 'MB', 'GB'];
  let measured = size / 1024;
  let index = 0;
  while (measured >= 1024 && index < units.length - 1) {
    measured /= 1024;
    index += 1;
  }
  return `${measured.toFixed(1)} ${units[index]}`;
};

const describeAttachment = (attachment: Attachment) =>
  `${attachment.type === 'image' ? 'Image' : 'File'} attached: ${attachment.name} (${attachment.mime}, ${formatBytes(attachment.size)}).`;

const truncateData = (data: string, max = 1_000_000) =>
  data.length > max ? `${data.slice(0, max)}... [truncated]` : data;

const parseDataUrl = (src: string) => {
  const match = /^data:(.*?);base64,(.*)$/i.exec(src);
  if (!match) return null;
  return { mime: match[1] || 'application/octet-stream', base64: match[2] || '' };
};

const maybeDecodeText = (src: string) => {
  const parsed = parseDataUrl(src);
  if (!parsed) return null;
  const isTextLike = /^text\/|json$|xml$|csv$|markdown$/i.test(parsed.mime);
  if (!isTextLike) return null;
  try {
    const decoded = typeof atob === 'function' ? atob(parsed.base64) : Buffer.from(parsed.base64, 'base64').toString('utf-8');
    return truncateData(decoded, 200_000);
  } catch {
    return null;
  }
};

const readInt = (
  value: string | undefined,
  fallback: number,
  opts: { min?: number; max?: number } = {},
) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const int = Math.floor(n);
  const min = typeof opts.min === 'number' ? opts.min : 0;
  if (int < min) return fallback;
  if (typeof opts.max === 'number') return Math.min(int, opts.max);
  return int;
};

const readFloat = (
  value: string | undefined,
  fallback: number,
  opts: { min?: number; max?: number } = {},
) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (typeof opts.min === 'number' && n < opts.min) return fallback;
  if (typeof opts.max === 'number' && n > opts.max) return fallback;
  return n;
};

const MAX_HISTORY = readInt(process.env.NEXT_PUBLIC_CHAT_MAX_HISTORY, 60, { min: 1 });
const MAX_CONTEXT_CHARS = readInt(process.env.NEXT_PUBLIC_CHAT_MAX_CONTEXT_CHARS, 100_000, { min: 1 });
const MAX_RESPONSE_TOKENS = readInt(process.env.NEXT_PUBLIC_CHAT_MAX_RESPONSE_TOKENS, 20_000, { min: 1 });
const DEFAULT_RESPONSE_TOKENS = readInt(
  process.env.NEXT_PUBLIC_CHAT_DEFAULT_RESPONSE_TOKENS,
  4096,
  { min: 0 },
);
const DEFAULT_TEMPERATURE = readFloat(process.env.NEXT_PUBLIC_CHAT_TEMPERATURE, 0.7, {
  min: 0,
  max: 2,
});
const SYSTEM_PROMPT_TEMPLATE = (process.env.NEXT_PUBLIC_CHAT_SYSTEM_PROMPT || '').trim();
const SEARCH_STATUS_PREFIX = '[[[SEARCH_STATUS]]]';

const parseSearchStatus = (chunk: string): { state: string; query?: string } | null => {
  if (!chunk || !chunk.startsWith(SEARCH_STATUS_PREFIX)) return null;
  const payload = chunk.slice(SEARCH_STATUS_PREFIX.length);
  try {
    const parsed = JSON.parse(payload);
    if (parsed && typeof parsed === 'object' && typeof parsed.state === 'string') {
      return parsed;
    }
  } catch {
    // ignore parse errors
  }
  return { state: 'start' };
};

const estimateContentChars = (content: ChatMessage['content']) => {
  if (Array.isArray(content)) {
    return content.reduce((total, part) => {
      if (part.type === 'text') return total + (part.text?.length ?? 0);
      // Treat images as a fixed small cost so they don't evict all text context
      const urlLen = part.image_url?.url?.length ?? 0;
      return total + Math.min(urlLen || 0, 2_000);
    }, 0);
  }
  return (content || '').length;
};

const trimByCharBudget = (messages: ChatMessage[], budget: number) => {
  if (budget <= 0) return messages;
  let remaining = budget;
  const kept: ChatMessage[] = [];

  // Walk from newest to oldest to keep recent context
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    const cost = Math.max(estimateContentChars(msg.content), 0);
    const mustKeep = kept.length === 0 || msg.role === 'system';
    if (!mustKeep && remaining - cost < 0) continue;
    kept.push(msg);
    remaining -= cost;
  }

  const out = kept.reverse();

  // Ensure we keep at least one system prompt if it exists
  if (!out.some((m) => m.role === 'system')) {
    const latestSystem = [...messages].reverse().find((m) => m.role === 'system');
    if (latestSystem) out.unshift(latestSystem);
  }

  return out;
};

const pickMaxTokens = (messages: ChatMessage[]) => {
  const promptTokens = messages.reduce(
    (sum, msg) => sum + Math.ceil(estimateContentChars(msg.content) / 4),
    0,
  );
  if (!promptTokens) return DEFAULT_RESPONSE_TOKENS || 4096;

  const approxPromptChars = promptTokens * 4;

  // For normal-length conversations, use the default cap (4096)
  // which gives the model plenty of room for detailed answers.
  const defaultCap =
    DEFAULT_RESPONSE_TOKENS > 0
      ? Math.min(DEFAULT_RESPONSE_TOKENS, MAX_RESPONSE_TOKENS)
      : 4096;
  if (approxPromptChars < MAX_CONTEXT_CHARS * 0.8) {
    return defaultCap;
  }

  // When the prompt is very large, cap response tokens but still allow generous output.
  return Math.min(MAX_RESPONSE_TOKENS, Math.max(4096, Math.floor(promptTokens * 0.5)));
};

/* ─── Auto-fix: rewrite LLM refusals into downloadable file cards ──── */

/** Patterns that indicate the user wants a file delivered. */
const FILE_REQUEST_RE =
  /\b(write|save|update|edit|rewrite|send|create|make|generate|give|produce|export|download|convert).{0,40}(file|document|doc|docx|pdf|word|it|this|the .{1,20})\b|\b(send|give).{0,20}(me|us|back)\b|\b(as|in)\s+(a\s+)?(doc|docx|pdf|word\s+doc(?:ument)?)\b|\bdo it yourself\b|\bdo it\b/i;

/** Patterns that indicate the LLM refused to deliver a file. */
const FILE_REFUSAL_RE =
  /can(?:'?t|’t| ?not)\b.{0,60}(?:attach|modify|edit|create|write|send|generate|produce|make|download|update|save).{0,30}(?:file|document|doc|docx|pdf)|don'?t have.{0,30}(?:capability|ability|access)|open.{0,25}(?:text editor|notepad|textedit|word|google docs)|Here'?s.{0,20}(?:step-by-step|simple) (?:guide|process)|(?:copy|paste).{0,20}(?:following|content|text)/i;

/** Map MIME types to fenced code block language tags. */
const MIME_TO_LANG: Record<string, string> = {
  'text/plain': 'text', 'text/markdown': 'markdown', 'text/csv': 'csv',
  'text/html': 'html', 'text/css': 'css', 'text/javascript': 'javascript',
  'text/x-typescript': 'typescript', 'text/x-python': 'python',
  'application/json': 'json', 'application/xml': 'xml',
  'application/x-yaml': 'yaml', 'text/x-sql': 'sql',
  'application/pdf': 'text', // extracted text
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'text',
  'application/msword': 'text',
};

function getLangForMime(mime: string): string {
  if (MIME_TO_LANG[mime]) return MIME_TO_LANG[mime];
  if (mime.startsWith('text/')) return 'text';
  return 'text';
}

/**
 * Extract the substantive content from an LLM response that refused to create a file.
 * Looks for: blockquotes, code blocks, or the longest paragraph of actual content.
 */
function extractContentFromRefusal(text: string): string | null {
  // 1. Try to find a fenced code block
  const codeMatch = /```(?:\w+)?\n([\s\S]*?)```/.exec(text);
  if (codeMatch?.[1]?.trim()) return codeMatch[1].trim();

  // 2. Try to find a blockquote (markdown > lines or indented block)
  const bqLines: string[] = [];
  for (const line of text.split('\n')) {
    const stripped = line.replace(/^\s*>\s?/, '');
    if (line.match(/^\s*>/)) bqLines.push(stripped);
  }
  if (bqLines.length > 0) {
    const bqText = bqLines.join('\n').trim();
    if (bqText.length > 20) return bqText;
  }

  // 3. Try to find indented/highlighted content (lines starting with spaces after a numbered list item)
  const indentedMatch = /(?:(?:^|\n)\s{2,}.+){2,}/m.exec(text);
  if (indentedMatch) {
    const indented = indentedMatch[0].split('\n').map(l => l.trim()).filter(Boolean).join('\n');
    if (indented.length > 20) return indented;
  }

  // 4. Find the longest contiguous paragraph that isn't instructional
  const paragraphs = text.split(/\n{2,}/).filter(p => {
    const t = p.trim();
    if (!t || t.length < 30) return false;
    // Skip instruction lines
    if (/^(\d+\.|[-*])\s/.test(t)) return false;
    if (/open|notepad|text editor|save the|follow these/i.test(t)) return false;
    return true;
  });

  if (paragraphs.length > 0) {
    const best = paragraphs.sort((a, b) => b.length - a.length)[0];
    if (best.length > 30) return best.trim();
  }

  return null;
}

function preferredExtensionFromRequest(userText: string): string {
  const t = (userText || '').toLowerCase();
  const specs: Array<{ re: RegExp; ext: string }> = [
    { re: /\bdocx?\b|\bword\s+doc(?:ument)?\b/i, ext: 'docx' },
    { re: /\bpdf\b/i, ext: 'pdf' },
    { re: /\bjson\b|\.json\b/i, ext: 'json' },
    { re: /\btypescript\b|\bts\b|\.ts\b/i, ext: 'ts' },
    { re: /\btsx\b|\.tsx\b/i, ext: 'tsx' },
    { re: /\bjavascript\b|\bjs\b|\.js\b/i, ext: 'js' },
    { re: /\bjsx\b|\.jsx\b/i, ext: 'jsx' },
    { re: /\bpython\b|\bpy\b|\.py\b/i, ext: 'py' },
    { re: /\byaml\b|\byml\b|\.ya?ml\b/i, ext: 'yaml' },
    { re: /\bxml\b|\.xml\b/i, ext: 'xml' },
    { re: /\bcsv\b|\.csv\b/i, ext: 'csv' },
    { re: /\bmarkdown\b|\.md\b/i, ext: 'md' },
    { re: /\bsql\b|\.sql\b/i, ext: 'sql' },
    { re: /\bhtml\b|\.html?\b/i, ext: 'html' },
    { re: /\bcss\b|\.css\b/i, ext: 'css' },
    { re: /\bshell\b|\bbash\b|\.sh\b/i, ext: 'sh' },
    { re: /\btext\b|\btxt\b|\.txt\b/i, ext: 'txt' },
  ];
  const hit = specs.find((s) => s.re.test(t));
  return hit?.ext || 'txt';
}

function languageForExtension(ext: string): string {
  const e = (ext || 'txt').toLowerCase();
  if (e === 'json') return 'json';
  if (e === 'ts' || e === 'tsx') return 'typescript';
  if (e === 'js' || e === 'jsx') return 'javascript';
  if (e === 'py') return 'python';
  if (e === 'md') return 'markdown';
  if (e === 'yaml' || e === 'yml') return 'yaml';
  if (e === 'xml') return 'xml';
  if (e === 'csv') return 'csv';
  if (e === 'sql') return 'sql';
  if (e === 'html') return 'html';
  if (e === 'css') return 'css';
  if (e === 'sh') return 'bash';
  return 'text';
}

function buildDeliveryFilename(sourceName: string, preferredExt: string) {
  const base = (sourceName || 'document').replace(/\.[^.]+$/, '') || 'document';
  return `${base}.${preferredExt || 'txt'}`;
}

function unwrapNestedCodeFences(text: string): string {
  let out = (text || '').trim();

  for (let i = 0; i < 3; i++) {
    const wrapped = out.match(/^```(?:[\w+-]+(?::[^\n]+)?)\n([\s\S]*?)\n?```$/);
    if (!wrapped) break;
    out = wrapped[1].trim();
  }

  out = out.replace(/^(?:text|plaintext|markdown)\s*\n/i, '').trim();
  return out;
}

function repairMalformedFileDeliveryBlock(text: string): string {
  if (!text) return text;

  // Repair a nested shape like:
  // ```text:file.pdf
  // ```text
  // body
  // ```
  // ```
  return text.replace(
    /```(\w+):([^\n]+)\n```(?:[\w+-]+)?\n([\s\S]*?)\n```\s*```/g,
    (_match, outerLang, filename, body) => `\`\`\`${outerLang}:${String(filename).trim()}\n${unwrapNestedCodeFences(String(body))}\n\`\`\``,
  );
}

function normalizeAssistantContentForFile(text: string): string {
  if (!text) return '';
  let out = text.trim();

  // Remove common refusal preamble line
  out = out.replace(/^I can(?:'?t|’t| ?not)[^\n]*\n?/i, '').trim();

  // Remove boilerplate lead-in lines (repeat until stable to handle multi-line preambles)
  for (let i = 0; i < 5; i++) {
    const prev = out;
    out = out.replace(/^Below is[^\n]*\n?/i, '').trim();
    out = out.replace(/^To create a? (?:DOCX|PDF|Word)[^\n]*\n?/i, '').trim();
    out = out.replace(/^I will (?:summarize|convert|create|generate|provide|format|now)[^\n]*\n?/i, '').trim();
    out = out.replace(/^Here(?:'s| is)[^\n]*(?:DOCX|document|content|information|structured|PDF)[^\n]*\n?/i, '').trim();
    out = out.replace(/^(?:Sure[,!]?|Certainly[,!]?|Of course[,!]?)\s*(?:here[^\n]*)?\n?/i, '').trim();
    out = out.replace(/^(?:The\s+)?following\s+is\s+the[^\n]*\n?/i, '').trim();
    out = out.replace(/^I (?:currently )?(?:don'?t|do not) have (?:the )?(?:capability|ability|access)[^\n]*\n?/i, '').trim();
    out = out.replace(/^However,\s+I can (?:guide|help|show|walk)[^\n]*\n?/i, '').trim();
    if (out === prev) break;
  }

  // Drop procedural instruction sections often appended after content.
  // Keep the actual document body and strip "how to save/create" tails.
  const instructionMarkers = [
    /(^|\n)\s*(?:\*{0,2}|#{1,3}\s*)How\s+to\s+(?:turn|create|make|save|format|generate)\b/i,
    /(^|\n)\s*(?:\*{0,2}|#{1,3}\s*)Instructions?\s+(?:to|for)\s+(?:create|creating|make|making|generate|generating)\b/i,
    /(^|\n)\s*(?:\*{0,2}|#{1,3}\s*)Steps?\s+(?:to|for)\s+(?:create|creating|make|making|generate|generating|build|building)\b/i,
    /(^|\n)\s*(?:\*{0,2}|#{1,3}\s*)Open\s+(?:Microsoft\s+Word|a\s+Word\s+Processing)\b/i,
    /(^|\n)\s*(?:\d+\.|[-*○●])\s*(?:\*{0,2})Open\s+Microsoft\s+Word\b/i,
    /(^|\n)\s*(?:\d+\.|[-*○●])\s*(?:\*{0,2})Create\s+a\s+New\s+(?:Document|File)\b/i,
    /(^|\n)\s*(?:\d+\.|[-*○●])\s*(?:\*{0,2})Insert\s+(?:the\s+)?Content\b/i,
    /(^|\n)\s*(?:\d+\.|[-*○●])\s*(?:\*{0,2})Format\s+the\s+Document\b/i,
    /(^|\n)\s*(?:\d+\.|[-*○●])\s*(?:\*{0,2})Copy\s+(?:everything|the\s+content|and\s+paste)\b/i,
    /(^|\n)\s*(?:\d+\.|[-*○●])\s*(?:\*{0,2})Paste\s+it\s+into\b/i,
    /(^|\n)\s*(?:\d+\.|[-*○●])\s*(?:\*{0,2})In\s+Word\s*[:\-]\s*(?:go\s+to\s+)?File\b/i,
    /(^|\n)\s*(?:\d+\.|[-*○●])\s*In\s+Google\s+Docs\b/i,
    /(^|\n)\s*(?:\*{0,2}|#{1,3}\s*)(?:Insert\s+Title|Save\s+the\s+Document|Insert\s+Title\s+and\s+Content)\b/i,
    /(^|\n)\s*(?:\*{0,2}|#{1,3}\s*)Example\s+Formatting\b/i,
    /(^|\n)\s*(?:\*{0,2}|#{1,3}\s*)Example\s+Document\s+Structure\b/i,
    /(^|\n)\s*(?:\*{0,2}|#{1,3}\s*)Download\s+(?:the\s+)?(?:DOCX|PDF|Word|document|file)\b/i,
    /(^|\n)\s*(?:\*{0,2}|#{1,3}\s*)Using\s+(?:Microsoft\s+Word|Google\s+Docs|Online\s+Converters?|Libre\s+Office|Open\s+Office)\b/i,
    /(^|\n)\s*(?:\*{0,2}|#{1,3}\s*)(?:Method|Option|Step)\s+\d+\s*[:–—]/i,
    /(^|\n)\s*(?:\d+\.|-|\*)\s*(?:\*{0,2})(?:Open|Upload|Download)\s+(?:the|your|a)\s+(?:document|file|DOCX|PDF|Word)\b/i,
    /(^|\n)\s*I\s+will\s+create\s+the\s+(?:DOCX|PDF|Word|document)\s+(?:document\s+)?for\s+you\b/i,
    /(^|\n)\s*Please\s+click\s+(?:the\s+)?(?:link|button|here)\b/i,
    /(^|\n)\s*\(Note:\s/i,
    /(^|\n)\s*\[Download\b/i,
    /(^|\n)\s*sandbox:\//i,
    /(^|\n)\s*If\s+you\s+tell\s+me\s+what\s+exact\s+layout\b/i,
    /(^|\n)\s*If\s+you\s+want,?\s+I\s+can\s+also\b/i,
    /(^|\n)\s*If\s+you\s+tell\s+me\s+whether\s+you\s+want\b/i,
    /(^|\n)\s*If\s+you\s+need\s+(?:any\s+)?(?:further\s+)?(?:changes|assistance|help|information)\b/i,
    /(^|\n)\s*If\s+you\s+have\s+(?:any\s+)?(?:specific\s+)?questions?\b/i,
    /(^|\n)\s*(?:Feel|Please)\s+free\s+to\s+(?:ask|reach\s+out|let\s+me\s+know)\b/i,
    /(^|\n)\s*Let\s+me\s+know\s+if\s+you\s+(?:need|have|want)\b/i,
    /(^|\n)\s*By\s+following\s+these\s+steps\b/i,
    /(^|\n)\s*You\s+can\s+now\b/i,
    /(^|\n)\s*programmatically\b/i,
    /(^|\n)\s*using\s+a\s+word\s+processor\b/i,
  ];

  let cutAt = -1;
  for (const markerRe of instructionMarkers) {
    const idx = out.search(markerRe);
    if (idx >= 0 && (cutAt === -1 || idx < cutAt)) {
      cutAt = idx;
    }
  }
  if (cutAt >= 0) {
    out = out.slice(0, cutAt).trim();
  }

  // Trim repeated separators at ends
  out = out.replace(/^[\s\-_*]{3,}\s*/g, '').replace(/[\s\-_*]{3,}\s*$/g, '').trim();
  return out;
}

function isBadGeneratedFileContent(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return true;
  return /python-docx|from\s+docx\s+import\s+Document|make_docx\.py|option\s+a|option\s+b|how\s+to\s+run|upload\s+the\s+pdf|i\s+don['']t\s+have\s+the\s+actual\s+pdf|copy-?paste|open\s+microsoft\s+word|google\s+docs|using\s+microsoft\s+word|using\s+google\s+docs|using\s+online\s+converter|don['']t\s+have\s+the\s+capability|do\s+not\s+have\s+the\s+capability|cannot\s+directly\s+create|save\s+as\s+type.*dropdown|smallpdf|ilovepdf/i.test(t);
}

function findPreviousUsefulAssistantContent(allMessages: UIMsg[]): string | null {
  const previousAssistant = [...allMessages]
    .reverse()
    .find((m) => m.role === 'assistant' && typeof m.content === 'string' && m.content.trim().length > 120);
  if (!previousAssistant) return null;
  const cleaned = normalizeAssistantContentForFile(previousAssistant.content);
  if (!cleaned || isBadGeneratedFileContent(cleaned)) return null;
  return cleaned;
}

/**
 * Post-process the assistant's final response.
 * If the user asked for a file and the LLM refused, rewrite the response
 * to include a proper downloadable file card.
 */
function autoFixFileDelivery(
  assistantText: string,
  userText: string,
  allMessages: UIMsg[],
): string {
  assistantText = repairMalformedFileDeliveryBlock(assistantText);

  // Already has a non-empty file delivery block — nothing to fix
  if (/```\w+:[^\n]+\n[\s\S]*?\S[\s\S]*?```/.test(assistantText)) return assistantText;

  // Check if the user asked for a file
  if (!FILE_REQUEST_RE.test(userText)) return assistantText;
  const assistantLooksLikeRefusal = FILE_REFUSAL_RE.test(assistantText);

  // Find the most recent file attachment in the conversation
  const recentFile = [...allMessages].reverse().find(m => m.attachment?.type === 'file');
  const preferredExt = preferredExtensionFromRequest(userText);
  const filename = buildDeliveryFilename(recentFile?.attachment?.name || 'document', preferredExt);
  const mime = recentFile?.attachment?.mime || 'text/plain';
  const lang = getLangForMime(mime);

  // Extract the actual content the LLM wanted to deliver.
  // If it's not a refusal but user explicitly requested a document format,
  // still wrap rich content into a downloadable file card.
  const cleanedFull = normalizeAssistantContentForFile(assistantText);
  const extracted = extractContentFromRefusal(assistantText);
  let content = unwrapNestedCodeFences(extracted || cleanedFull || assistantText.trim());

  // If extracted content is suspiciously short, use the cleaned full response instead.
  if (cleanedFull && content.length < Math.max(220, Math.floor(cleanedFull.length * 0.5))) {
    content = unwrapNestedCodeFences(cleanedFull);
  }

  if (!content) return assistantText;

  const previousGoodAssistant = findPreviousUsefulAssistantContent(allMessages);
  if (isBadGeneratedFileContent(content) && previousGoodAssistant) {
    content = previousGoodAssistant;
  } else if (isBadGeneratedFileContent(content) && !previousGoodAssistant) {
    // Content is entirely a refusal/instruction block with no real document data to fall back on.
    // Return the original assistant text so the refusal shows in chat rather than inside a file.
    return assistantText;
  }

  if (isBadGeneratedFileContent(content) && !previousGoodAssistant) {
    // Nothing useful to put in a file — show the refusal in chat as-is so the
    // user sees what happened rather than getting a file full of instructions.
    return assistantText;
  }

  const explicitFileFormatRequest = preferredExt !== 'txt';

  // For small documents (for example, a short shareholder list), still force file
  // delivery when the user explicitly requested DOCX/PDF. Otherwise the model's
  // plain ```text fenced block renders as a normal code block with a .txt save action.
  if (!assistantLooksLikeRefusal && content.length < 80 && !explicitFileFormatRequest) {
    return assistantText;
  }

  // For binary doc formats (DOCX, PDF, etc.), the extracted content is plain text.
  // Keep the original extension for DOCX so the FileCard generates a real Word file.
  // For PDF, deliver as .docx (Word users can save as PDF).
  const PDF_RE = /pdf$/i;
  let deliveryFilename = filename;
  if (PDF_RE.test(mime)) {
    const baseName = filename.replace(/\.[^.]+$/, '');
    deliveryFilename = `${baseName}.docx`;
  }
  // For other binary formats (PPT, XLS, etc.) fall back to .txt
  const OTHER_BINARY_RE = /vnd\.(ms-powerpoint|ms-excel|oasis)|rtf/i;
  if (OTHER_BINARY_RE.test(mime)) {
    const baseName = filename.replace(/\.[^.]+$/, '');
    deliveryFilename = `${baseName}.txt`;
  }
  // Respect explicit user preference for any supported extension.
  deliveryFilename = buildDeliveryFilename(deliveryFilename, preferredExt);
  const deliveryLang = languageForExtension(preferredExt);

  return `Here's your file:\n\n\`\`\`${deliveryLang}:${deliveryFilename}\n${content}\n\`\`\``;
}

const buildMessageContent = (message: UIMsg): ChatMessage['content'] => {
  const trimmed = message.content?.trim();

  // If the message has an image attachment, return multimodal content for OpenAI vision-capable models
  if (message.attachment?.type === 'image' && message.attachment.src) {
    const content: ChatContentPart[] = [];
    if (trimmed) content.push({ type: 'text', text: trimmed });
    content.push({ type: 'image_url', image_url: { url: message.attachment.src } });
    return content;
  }

  // File attachments: send the data URL with correct MIME so the server-side
  // document parser can extract the actual content (PDF text, DOCX text, etc.).
  // Keep the message clean — avoid noisy metadata that confuses the LLM.
  if (message.attachment?.type === 'file') {
    const parts: string[] = [];
    if (trimmed) parts.push(trimmed);

    // Reconstruct the data URL with the correct MIME (from attachment.mime) in case
    // FileReader embedded a wrong/empty MIME in the src (e.g. "application/octet-stream"
    // for DOCX on a machine without Office, or empty string on some browsers).
    // The server-side document parser uses the MIME from the data URL to decide how
    // to extract text, so getting it right here is critical.
    const rawSrc = message.attachment.src || '';
    let fixedSrc = rawSrc;
    if (rawSrc.startsWith('data:') && message.attachment.mime) {
      const semi = rawSrc.indexOf(';base64,');
      if (semi !== -1) {
        const embeddedMime = rawSrc.slice(5, semi);
        if (!embeddedMime || embeddedMime === 'application/octet-stream') {
          fixedSrc = `data:${message.attachment.mime};base64,${rawSrc.slice(semi + 8)}`;
        }
      } else if (rawSrc.startsWith('data:;base64,')) {
        fixedSrc = `data:${message.attachment.mime};base64,${rawSrc.slice(13)}`;
      }
    }

    // For text-like files, decode client-side so the LLM sees content directly
    // (the server will also extract, but this gives immediate readable context).
    const decoded = fixedSrc ? maybeDecodeText(fixedSrc) : null;
    if (decoded) {
      parts.push(`[File: ${message.attachment.name}]\n${decoded}`);
    } else if (fixedSrc) {
      // Binary files (PDF, DOCX, etc.): send the data URL as-is.
      // The server-side document parser will extract the text content
      // and replace this data URL before it reaches the LLM.
      parts.push(`[File: ${message.attachment.name}]\n${fixedSrc}`);
    }

    return parts.join('\n\n');
  }

  const parts: string[] = [];
  if (trimmed) parts.push(trimmed);
  if (message.attachment) parts.push(describeAttachment(message.attachment));
  return parts.join('\n\n');
};

export function useStreamingChat({
  accessToken,
  model,
  msgs,
  setMsgs,
  ensureConversation,
  appendMessages,
  conversationId,
  onSidebarDirty,
  onError,
  onModelFallback,
}: UseStreamingChatArgs) {
  const [loading, setLoading] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState<string | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);

  const msgsRef = useRef<UIMsg[]>(msgs);
  useEffect(() => {
    msgsRef.current = msgs;
  }, [msgs]);

  const typingBufferRef = useRef<string>('');
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const modelRef = useRef<string>(model);
  modelRef.current = model;

  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  /** Fire-and-forget: ask the server to generate an LLM-based title for this conversation. */
  const generateTitle = useCallback(
    async (cid: string) => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
        const res = await fetch(`/api/conversations/${cid}/generate-title`, {
          method: 'POST',
          headers,
          credentials: 'include',
        });
        if (res.ok) {
          // Small delay so DB commit is visible before sidebar refetches
          await new Promise((r) => setTimeout(r, 300));
          onSidebarDirty?.();
        }
      } catch {
        // title generation is best-effort; don't block the user
      }
    },
    [accessToken, onSidebarDirty],
  );

  // Load model labels from API for nicer system identity
  const [modelLabels, setModelLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await modelCache.list();
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const m of data || []) {
          map[m.modelKey] = m.displayName || m.modelKey;
        }
        setModelLabels(map);
      } catch (err) {
        console.warn('useStreamingChat: failed to load model labels', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const genId = () =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const stop = useCallback(() => {
    try {
      ctrlRef.current?.abort();
    } catch {
      // swallow
    }
    ctrlRef.current = null;
    setInterrupted(true);
    setLoading(false);
    setSearching(false);
    setSearchQuery(null);
  }, []);

  useEffect(() => {
    return () => {
      try {
        ctrlRef.current?.abort();
      } catch {
        // ignore
      }
      ctrlRef.current = null;
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      typingBufferRef.current = '';
    };
  }, []);

  useEffect(() => {
    if (loading && ctrlRef.current) {
      try {
        ctrlRef.current.abort();
      } catch {
        // ignore
      }
      ctrlRef.current = null;
      setLoading(false);
      setSearching(false);
      setSearchQuery(null);
    }
  }, [model]);

  const startTypingFlush = useCallback(
    (assistantId: string) => {
      if (typingTimerRef.current) return;
      typingTimerRef.current = setInterval(() => {
        const buffer = typingBufferRef.current;
        if (!buffer.length) {
          clearInterval(typingTimerRef.current as NodeJS.Timeout);
          typingTimerRef.current = null;
          return;
        }
        const takeLen = Math.min(buffer.length, 12);
        const take = buffer.slice(0, takeLen);
        typingBufferRef.current = buffer.slice(takeLen);
        setMsgs((prev) => {
          if (!prev.length) return prev;
          const out = prev.slice();
          const last = out[out.length - 1];
          if (last?.id === assistantId) {
            out[out.length - 1] = { ...last, content: last.content + take };
          }
          return out;
        });
      }, 30);
    },
    [setMsgs],
  );

  const drainTypingBuffer = useCallback(
    (assistantId: string) => {
      const remaining = typingBufferRef.current;
      typingBufferRef.current = '';
      if (typingTimerRef.current) {
        clearInterval(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      if (!remaining) return;
      setMsgs((prev) => {
        if (!prev.length) return prev;
        const out = prev.slice();
        const last = out[out.length - 1];
        if (last?.id === assistantId) {
          out[out.length - 1] = { ...last, content: last.content + remaining };
        }
        return out;
      });
    },
    [setMsgs],
  );

  const send = useCallback(
    async ({ text, attachment, searchMode }: SendPayload) => {
      const userText = (text ?? '').trim();
      if (!userText && !attachment) return;
      if (loading) return;
      const shouldBufferFileResponse = FILE_REQUEST_RE.test(userText);
      const shouldDisableSearch =
        searchMode === 'auto' &&
        (
          attachment?.type === 'file' ||
          attachment?.type === 'image' ||
          shouldBufferFileResponse ||
          /\b(this|attached)\s+(doc|document|pdf|file|image|photo|picture|screenshot)\b/i.test(userText)
        );

      const now = Date.now();

      const userMsg: UIMsg = {
        id: genId(),
        role: 'user',
        content: userText,
        attachment,
        createdAt: now,
      };
      const assistantMsg: UIMsg = {
        id: genId(),
        role: 'assistant',
        content: shouldBufferFileResponse ? 'Preparing file...' : '',
        createdAt: now,
      };
      const useTypewriter = /nano/i.test(modelRef.current);

      // Capture history snapshot BEFORE setMsgs adds the placeholder messages.
      // After `await ensureConversation()` React may have committed the state update
      // and synchronized msgsRef — causing userMsg to appear in both historyWindow and
      // the explicit append below, which produces consecutive same-role turns that
      // Gemini (and some other providers) reject with a 400 error.
      const historySnapshot = msgsRef.current;

      setMsgs((prev) => {
        const lastMsg = prev[prev.length - 1];
        if (lastMsg?.id === userMsg.id) {
          return prev;
        }
        return [...prev, userMsg, assistantMsg];
      });

      await ensureConversation?.();

      const controller = new AbortController();
      ctrlRef.current = controller;
      setLoading(true);
      setInterrupted(false);
      setSearching(false);
      setSearchQuery(null);

      try {
        const apiUrl = getApiBase();
        if (!apiUrl) throw new Error('API base URL not configured');
        const endpointPath = '/chat';

        const baseHistory = (() => {
          const identityName = modelLabels[modelRef.current] ?? modelRef.current;
          const defaultIdentity = `You are ${identityName}, a highly capable AI assistant.

Response guidelines:
- Provide comprehensive, detailed, and well-structured answers. Use headings, bullet points, numbered lists, and code blocks where appropriate.
- Give thorough explanations with examples, context, and nuance. Do not give one-liner answers unless the question is truly trivial.
- When explaining concepts, cover the "what", "why", and "how". Anticipate follow-up questions and address them proactively.
- For technical questions, include working code examples, explain trade-offs, and mention best practices.
- For factual questions, provide depth: background context, key details, and relevant implications.
- Use markdown formatting liberally: **bold** for emphasis, headings (##) for sections, \`code\` for technical terms, and tables when comparing items.
- If a question is ambiguous, address the most likely interpretation thoroughly, then briefly mention alternative interpretations.
- Be direct and substantive. Avoid filler phrases like "Great question!" or "Sure, I'd be happy to help!". Get straight to the answer.
- Only be brief when the user explicitly asks for brevity or the answer is genuinely simple (yes/no, a single fact, etc.).
- Do not mention your model name, version, or architecture unless explicitly asked.
- When citing sources from web search, always use inline markdown links: [Source Title](url). Group related citations together at the end of each paragraph.
- For multi-part questions, use numbered sections or headings to address each part clearly.
- When information may be outdated or uncertain, say so explicitly rather than presenting it as fact.

File and document capabilities:
- Users can attach files and images directly in this chat. When a file is attached, its text content has already been extracted and is included in the conversation — you can see and work with the full content.
- When a user asks "what is inside this file?" or similar, respond with the actual content of the file. Do NOT describe file metadata, encoding, format internals, or give instructions on how to open it. Simply show or summarize the content.
- You CAN read, analyze, summarize, edit, rewrite, translate, and answer questions about any attached file content. The content is already available to you in the conversation.
- When a user asks you to create, edit, update, rewrite, or send a file, you MUST deliver it as a downloadable file. To do this, use a special code fence format with the filename: \`\`\`lang:filename.ext (e.g. \`\`\`text:Hello.txt, \`\`\`python:script.py, \`\`\`json:config.json). This renders as a downloadable file card — NOT a code block.
- IMPORTANT: When the user asks for a FILE (e.g. "send me the file", "create a file", "write it to the file", "update the file"), ALWAYS use the \`\`\`lang:filename.ext format. Only use regular code blocks (\`\`\`lang without :filename) when showing code for explanation purposes, not for file delivery.
- For Word/Office documents (.docx, .doc): use \`\`\`text:filename.docx — the platform will convert the text content into a real Word document the user can download and open in Microsoft Word.
- For PDF files: use \`\`\`text:filename.pdf — the platform will convert to a Word document format for download.
- Examples of file delivery format:
  \`\`\`text:Hello.txt
  File content here
  \`\`\`
  \`\`\`python:script.py
  print("hello")
  \`\`\`
  \`\`\`json:data.json
  {"key": "value"}
  \`\`\`
  \`\`\`text:report.docx
  # Report Title

  ## Section 1
  Content of section 1...
  \`\`\`
- Use the correct language identifier before the colon: text for .txt/.docx/.pdf, python for .py, typescript for .ts, json for .json, bash for .sh, yaml for .yaml, sql for .sql, markdown for .md, xml for .xml, csv for .csv, html for .html, css for .css, etc.
- NEVER claim you cannot read, edit, or create files. NEVER give instructions to "open the file in a text editor" or "copy and paste". Just deliver the file using the format above.
- CRITICAL: When writing file content inside a \`\`\`lang:filename.ext block, deliver ONLY the actual document content. DO NOT include any of the following inside or after the file block:
  - How-to instructions ("Steps to create a .docx", "Open Microsoft Word", "Create a New Document", "Copy and paste the content", "Format the Document", "Save the Document")
  - Post-file instructions or commentary ("By following these steps...", "You can now open this in Microsoft Word...")
  - Conversational tails ("If you have any questions, feel free to ask!", "Let me know if you need help!", "If you need further assistance...")
  - Preamble filler ("Here is the document content:", "Below is the formatted version:", "I will now create the file:")
- The file content should be clean, formatted document text only. The platform handles all file saving and opening automatically.
- Never truncate or abbreviate file content when editing — always return the complete file.
- When editing a document, preserve ALL original content and only apply the requested changes. Include every section, paragraph, and line of the original unless you are specifically asked to remove something.`;
          const identity = SYSTEM_PROMPT_TEMPLATE
            ? SYSTEM_PROMPT_TEMPLATE.split('{model}').join(identityName)
            : defaultIdentity;
          const history = [...historySnapshot];
          const systemIndex = history.findIndex((m) => m.role === 'system');
          if (systemIndex >= 0) {
            history[systemIndex] = { ...history[systemIndex], content: identity };
          } else {
            history.unshift({ id: genId(), role: 'system', content: identity });
          }
          return history;
        })();

        const historyWindow = baseHistory.length > MAX_HISTORY ? baseHistory.slice(-MAX_HISTORY) : baseHistory;

        // When the user is uploading a file and asking for a format conversion in the same
        // message, inject a strong instruction so the model outputs CONTENT not how-to steps.
        const effectiveUserMsg: UIMsg = (() => {
          if (!userMsg.attachment || userMsg.attachment.type !== 'file') return userMsg;
          if (!FILE_REQUEST_RE.test(userText)) return userMsg;
          const preferredExt = preferredExtensionFromRequest(userText);
          const fname = buildDeliveryFilename(userMsg.attachment.name || 'document', preferredExt);
          const extLabel = preferredExt.toUpperCase();
          const extra = `\n\n[IMPORTANT: The full text of the attached file has already been extracted and is available to you in this conversation. You MUST output its complete content inside a \`\`\`text:${fname} code fence. Do NOT explain how to create a ${extLabel} file. Do NOT give steps or instructions. Output ONLY the document content inside the fence.]`;
          return { ...userMsg, content: (userMsg.content || '') + extra };
        })();

        const normalizedHistory: ChatMessage[] = [...historyWindow, effectiveUserMsg]
          .map((msg) => {
            const content = buildMessageContent(msg);
            if (Array.isArray(content) && !content.length) return null;
            if (!content) return null;
            return { role: msg.role, content };
          })
          .filter((entry): entry is ChatMessage => Boolean(entry));

        const boundedHistory = trimByCharBudget(normalizedHistory, MAX_CONTEXT_CHARS);
        const responseMaxTokens = pickMaxTokens(boundedHistory);

        const effectiveSearchMode = shouldDisableSearch ? 'off' : searchMode;

        const payload = {
          model: modelRef.current,
          conversationId: conversationId ?? undefined,
          messages: boundedHistory,
          temperature: DEFAULT_TEMPERATURE,
          ...(responseMaxTokens ? { max_tokens: responseMaxTokens } : {}),
          ...(effectiveSearchMode && effectiveSearchMode !== 'auto' ? { search: { mode: effectiveSearchMode } } : {}),
        };

        let finalAssistantText = '';
        let fallbackNotified = false;
        let searchCleared = false;

        for await (const chunk of streamChat({
          apiUrl,
          token: accessToken,
          payload,
          signal: controller.signal,
          path: endpointPath,
        })) {
          const status = parseSearchStatus(chunk);
          if (status) {
            if (status.state === 'start') {
              setSearching(true);
              setSearchQuery(typeof status.query === 'string' ? status.query : null);
            } else if (status.state === 'done') {
              setSearching(false);
              setSearchQuery(null);
              searchCleared = true;
            }
            continue;
          }
          if (chunk) {
            // Safety net: clear searching state on first real chunk if backend didn't send 'done'
            if (!searchCleared) {
              setSearching(false);
              setSearchQuery(null);
              searchCleared = true;
            }
            finalAssistantText += chunk;
            // Detect server-side fallback notice for GPT-5 quota and notify UI to switch picker
            if (!fallbackNotified && /gpt-5 daily limit reached/i.test(chunk)) {
              fallbackNotified = true;
              onModelFallback?.('basic:gpt-4o-mini', 'quota-exceeded-gpt5');
            }
            if (shouldBufferFileResponse) {
              continue;
            }
            if (useTypewriter) {
              typingBufferRef.current += chunk;
              startTypingFlush(assistantMsg.id);
            } else {
              setMsgs((prev) => {
                if (!prev.length) return prev;
                const out = prev.slice();
                const last = out[out.length - 1];
                if (last?.id === assistantMsg.id) {
                  out[out.length - 1] = { ...last, content: last.content + chunk };
                }
                return out;
              });
            }
          }
        }

        if (useTypewriter && !shouldBufferFileResponse) {
          drainTypingBuffer(assistantMsg.id);
        }

        // Strip any leaked search status markers from the final text
        finalAssistantText = finalAssistantText.replace(/\[{3}SEARCH_STATUS\]{3}[^\n]*/g, '').trim();

        // ── Auto-fix: when the LLM refuses to deliver a file, extract the ──
        // ── content and reformat it as a downloadable file card.           ──
        finalAssistantText = autoFixFileDelivery(
          finalAssistantText,
          userText,
          [...historySnapshot, userMsg],
        );

        // Update the displayed message with the (possibly rewritten) final text
        setMsgs((prev) => {
          const out = prev.slice();
          const idx = out.findIndex((m) => m.id === assistantMsg.id);
          if (idx >= 0) out[idx] = { ...out[idx], content: finalAssistantText };
          return out;
        });

        await appendMessages?.(
          userMsg,
          { ...assistantMsg, content: finalAssistantText },
        );

        // Generate a smart title on the first exchange (only 1 user message in history)
        const userMsgCount = msgsRef.current.filter((m) => m.role === 'user').length;
        if (userMsgCount <= 1) {
          // Get conversationId from ref or from URL search params (ref may lag behind state)
          const cid =
            conversationIdRef.current ||
            (typeof window !== 'undefined'
              ? new URLSearchParams(window.location.search).get('c')
              : null);
          if (cid) {
            // Fire-and-forget — don't block the user
            void generateTitle(cid);
          }
        }
      } catch (err: any) {
        if (/nano/i.test(modelRef.current)) {
          drainTypingBuffer(assistantMsg.id);
        }
        const msg = typeof err?.message === 'string' ? err.message : 'Request failed';
        setInterrupted(true);
        onError?.(msg);
        setSearching(false);
        setSearchQuery(null);
        // Keep chat clean: errors are surfaced via popup only.
      } finally {
        if (ctrlRef.current === controller) ctrlRef.current = null;
        setLoading(false);
        setSearching(false);
        setSearchQuery(null);
      }
    },
    [
      accessToken,
      appendMessages,
      ensureConversation,
      conversationId,
      onError,
      setMsgs,
      loading,
      modelLabels,
      generateTitle,
    ],
  );

  return { send, stop, loading, interrupted, searching, searchQuery };
}
