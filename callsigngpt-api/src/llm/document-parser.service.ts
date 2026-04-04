import { Injectable, Logger } from '@nestjs/common';

/**
 * Extracts readable text from binary document formats (PDF, DOCX)
 * so LLMs receive actual content instead of useless base64 data.
 */
@Injectable()
export class DocumentParserService {
  private readonly logger = new Logger(DocumentParserService.name);
  private readonly MAX_TEXT = 200_000;

  /** Supported binary document MIME patterns */
  private readonly PDF_RE = /pdf/i;
  private readonly DOCX_RE = /officedocument\.wordprocessingml|msword/i;
  // Covers text/*, plus common application/* types for code, config, and data files
  private readonly TEXT_RE =
    /^text\/|json$|xml$|csv$|markdown$|yaml$|yml$|javascript$|x-javascript$|typescript$|x-typescript$|x-python$|x-ruby$|x-perl$|x-php$|x-sh$|x-shell$|x-shellscript$|x-sql$|x-c$|x-c\+\+$|x-java$|x-kotlin$|x-swift$|x-go$|x-rust$|x-lua$|x-scala$|x-r$|x-dart$|x-tex$|x-latex$|x-toml$|x-ini$|x-properties$|x-log$|x-diff$|x-patch$|graphql$|gql$|x-protobuf$|proto$|env$|x-env$|x-dotenv$|svelte$|vue$|astro$/i;
  /**
   * Infer the document type from magic bytes when the MIME type is missing,
   * empty, or is the generic 'application/octet-stream'.
   * Returns a more specific MIME type, or the original if not recognised.
   */
  private inferMimeFromBytes(buffer: Buffer, declaredMime: string): string {
    const generic = !declaredMime || declaredMime === 'application/octet-stream';
    if (!generic) return declaredMime;
    if (buffer.length < 4) return declaredMime;

    const b0 = buffer[0], b1 = buffer[1], b2 = buffer[2], b3 = buffer[3];

    // PDF: starts with %PDF (0x25 0x50 0x44 0x46)
    if (b0 === 0x25 && b1 === 0x50 && b2 === 0x44 && b3 === 0x46) {
      return 'application/pdf';
    }

    // ZIP-based formats (DOCX, XLSX, PPTX all start with PK\x03\x04)
    if (b0 === 0x50 && b1 === 0x4B && b2 === 0x03 && b3 === 0x04) {
      // Peek at the filename stored in the first local file header to distinguish Office formats
      // Offset 26 = filename length (2 bytes LE), offset 30 = filename string
      if (buffer.length > 34) {
        const fnLen = buffer.readUInt16LE(26);
        const fn = buffer.slice(30, 30 + Math.min(fnLen, 64)).toString('utf8');
        if (fn.startsWith('word/'))  return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (fn.startsWith('xl/'))    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (fn.startsWith('ppt/'))   return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      }
      // Fallback: treat any PK file as a DOCX attempt (better than nothing)
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    // RTF: starts with {\rtf
    if (b0 === 0x7B && b1 === 0x5C && b2 === 0x72 && b3 === 0x74) {
      return 'application/rtf';
    }

    // Likely plain text if all bytes in the first 512 are printable ASCII / UTF-8
    const sample = buffer.slice(0, Math.min(512, buffer.length));
    const looksLikeText = sample.every((byte) => byte >= 0x09 && byte <= 0x7E || byte >= 0x80);
    if (looksLikeText) return 'text/plain';

    return declaredMime;
  }
  /** Returns true if the mime type can be parsed into readable text */
  canParse(mime: string): boolean {
    return this.TEXT_RE.test(mime) || this.PDF_RE.test(mime) || this.DOCX_RE.test(mime);
  }

  /**
   * Parse a binary buffer into readable text.
   * Returns a human-readable string suitable for LLM consumption.
   */
  async parse(buffer: Buffer, mime: string): Promise<string> {
    // Resolve vague or missing MIME types using magic bytes before trying to parse
    const resolvedMime = this.inferMimeFromBytes(buffer, mime);
    try {
      if (this.TEXT_RE.test(resolvedMime)) return this.decodeText(buffer, resolvedMime);
      if (this.PDF_RE.test(resolvedMime)) return this.parsePdf(buffer);
      if (this.DOCX_RE.test(resolvedMime)) return this.parseDocx(buffer);
      return `(Unsupported document type: ${resolvedMime} — could not extract text content.)`;
    } catch (err: any) {
      this.logger.warn(`Document parsing failed for ${resolvedMime}: ${err?.message}`);
      return `(Failed to extract text from this ${resolvedMime} document.)`;
    }
  }

  private decodeText(buffer: Buffer, mime: string): string {
    const text = buffer.toString('utf-8');
    if (!text.trim()) return '(The file appears to be empty.)';
    return text.length > this.MAX_TEXT
      ? `${text.slice(0, this.MAX_TEXT)}\n... [truncated, ${text.length.toLocaleString()} chars total]`
      : text;
  }

  private async parsePdf(buffer: Buffer): Promise<string> {
    // pdf-parse v2 uses class-based API: new PDFParse({ data }) → getText()
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      const text = result.text?.trim() || '';
      const pages = result.total || 0;
      if (!text) return '(The PDF appears to contain no extractable text — it may be scanned or image-based.)';
      const header = `--- PDF content (${pages} page${pages === 1 ? '' : 's'}) ---`;
      return text.length > this.MAX_TEXT
        ? `${header}\n${text.slice(0, this.MAX_TEXT)}\n... [truncated, ${text.length.toLocaleString()} chars total]`
        : `${header}\n${text}`;
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  private async parseDocx(buffer: Buffer): Promise<string> {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value?.trim() || '';
    if (!text) return '(The document appears to be empty or contains only images/formatting with no extractable text.)';
    return text.length > this.MAX_TEXT
      ? `--- Document content ---\n${text.slice(0, this.MAX_TEXT)}\n... [truncated, ${text.length.toLocaleString()} chars total]`
      : `--- Document content ---\n${text}`;
  }
}
