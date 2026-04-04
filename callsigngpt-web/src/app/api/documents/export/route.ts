// /api/documents/export
// Converts plain text / markdown content into a downloadable Word (.docx) document.
import { NextResponse } from 'next/server';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} from 'docx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function detectOutputFormat(filename: string, explicitFormat?: string): 'docx' | 'pdf' {
  const fmt = (explicitFormat || '').toLowerCase();
  if (fmt === 'pdf') return 'pdf';
  if (/\.pdf$/i.test(filename)) return 'pdf';
  return 'docx';
}

async function textToPdfBuffer(content: string): Promise<Buffer> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 50;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const lineHeight = 16;
  const maxWidth = pageWidth - margin * 2;
  const lines = pdf.splitTextToSize(content || '', maxWidth) as string[];

  pdf.setFont('times', 'normal');
  pdf.setFontSize(11);

  let y = margin;
  for (const line of lines) {
    if (y > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(line, margin, y);
    y += lineHeight;
  }

  const out = pdf.output('arraybuffer');
  return Buffer.from(out);
}

/* ─── Inline markdown parser ──────────────────────────────────────────── */
// Converts a single line of text with **bold**, *italic*, `code` into TextRun[].
function parseInlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Matches **bold**, *italic*, `code`, or plain text chunks
  // Use non-greedy patterns without the /s flag (dotAll) for ES2017 compat
  const RE = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|([^*`]+)/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(text)) !== null) {
    if (m[2] !== undefined) {
      runs.push(new TextRun({ text: m[2], bold: true }));
    } else if (m[4] !== undefined) {
      runs.push(new TextRun({ text: m[4], italics: true }));
    } else if (m[6] !== undefined) {
      runs.push(new TextRun({ text: m[6], font: 'Courier New', size: 18 }));
    } else if (m[7] !== undefined) {
      runs.push(new TextRun({ text: m[7] }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text })];
}

/* ─── Heading level helper ────────────────────────────────────────────── */
const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

/* ─── Markdown → DOCX paragraphs ─────────────────────────────────────── */
function markdownToDocxParagraphs(text: string): Paragraph[] {
  const lines = text.split('\n');
  const paragraphs: Paragraph[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ──────────────────────────────────────
    if (line.trimStart().startsWith('```')) {
      i++; // skip opening fence line
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing fence
      if (codeLines.length === 0) continue;
      for (const codeLine of codeLines) {
        paragraphs.push(
          new Paragraph({
            children: [new TextRun({ text: codeLine, font: 'Courier New', size: 18 })],
            spacing: { line: 240, before: 0, after: 0 },
            border: {
              top:    { style: BorderStyle.NONE, size: 0, color: 'auto' },
              bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
              left:   { style: BorderStyle.THICK, size: 8, color: '4A5568' },
              right:  { style: BorderStyle.NONE, size: 0, color: 'auto' },
            },
          }),
        );
      }
      continue;
    }

    // ── ATX heading: # H1  ## H2  etc. ───────────────────────
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 6) - 1;
      paragraphs.push(
        new Paragraph({
          children: parseInlineRuns(headingMatch[2]),
          heading: HEADING_LEVELS[level],
        }),
      );
      i++;
      continue;
    }

    // ── Horizontal rule: --- or *** or ___ ────────────────────
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      paragraphs.push(
        new Paragraph({
          children: [],
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: '888888' },
            top:    { style: BorderStyle.NONE, size: 0, color: 'auto' },
            left:   { style: BorderStyle.NONE, size: 0, color: 'auto' },
            right:  { style: BorderStyle.NONE, size: 0, color: 'auto' },
          },
          spacing: { before: 120, after: 120 },
        }),
      );
      i++;
      continue;
    }

    // ── Bullet list: - item  * item  + item ───────────────────
    const bulletMatch = /^(\s*)[-*+]\s+(.+)$/.exec(line);
    if (bulletMatch) {
      const indent = Math.floor(bulletMatch[1].length / 2);
      paragraphs.push(
        new Paragraph({
          children: parseInlineRuns(bulletMatch[2]),
          bullet: { level: Math.min(indent, 8) },
        }),
      );
      i++;
      continue;
    }

    // ── Ordered list: 1. item ─────────────────────────────────
    const orderedMatch = /^(\s*)\d+\.\s+(.+)$/.exec(line);
    if (orderedMatch) {
      const indent = Math.floor(orderedMatch[1].length / 2);
      paragraphs.push(
        new Paragraph({
          children: parseInlineRuns(orderedMatch[2]),
          numbering: { reference: 'default-numbering', level: Math.min(indent, 8) },
        }),
      );
      i++;
      continue;
    }

    // ── Blockquote: > text ────────────────────────────────────
    const bqMatch = /^>\s?(.*)$/.exec(line);
    if (bqMatch) {
      paragraphs.push(
        new Paragraph({
          children: parseInlineRuns(bqMatch[1]),
          indent: { left: 720 },
          border: {
            left: { style: BorderStyle.THICK, size: 8, color: '4A90D9' },
            top:    { style: BorderStyle.NONE, size: 0, color: 'auto' },
            bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
            right:  { style: BorderStyle.NONE, size: 0, color: 'auto' },
          },
        }),
      );
      i++;
      continue;
    }

    // ── Blank line → empty paragraph ──────────────────────────
    if (!line.trim()) {
      paragraphs.push(new Paragraph({ children: [] }));
      i++;
      continue;
    }

    // ── Regular paragraph ─────────────────────────────────────
    paragraphs.push(
      new Paragraph({
        children: parseInlineRuns(line),
        spacing: { after: 120 },
      }),
    );
    i++;
  }

  return paragraphs;
}

/* ─── Route handler ──────────────────────────────────────────────────── */

export async function POST(req: Request) {
  let body: { content?: string; filename?: string; format?: 'docx' | 'pdf' | 'txt' };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const content = typeof body.content === 'string' ? body.content : '';
  const rawFilename = typeof body.filename === 'string' ? body.filename.trim() : 'document.docx';
  const base = rawFilename.replace(/\.[^.]+$/, '') || 'document';
  const outputFormat = detectOutputFormat(rawFilename, body.format);

  if (outputFormat === 'pdf') {
    const filename = `${base}.pdf`;
    const pdfBuffer = await textToPdfBuffer(content);
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  }

  const filename = `${base}.docx`;

  const children = markdownToDocxParagraphs(content);

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: Array.from({ length: 9 }, (_, i) => ({
            level: i,
            format: 'decimal' as const,
            text: `%${i + 1}.`,
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: 720 * (i + 1), hanging: 360 },
              },
            },
          })),
        },
      ],
    },
    sections: [
      {
        children,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  });
}
