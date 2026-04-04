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

  /** Returns true if the mime type can be parsed into readable text */
  canParse(mime: string): boolean {
    return this.TEXT_RE.test(mime) || this.PDF_RE.test(mime) || this.DOCX_RE.test(mime);
  }

  /**
   * Parse a binary buffer into readable text.
   * Returns a human-readable string suitable for LLM consumption.
   */
  async parse(buffer: Buffer, mime: string): Promise<string> {
    try {
      if (this.TEXT_RE.test(mime)) return this.decodeText(buffer, mime);
      if (this.PDF_RE.test(mime)) return this.parsePdf(buffer);
      if (this.DOCX_RE.test(mime)) return this.parseDocx(buffer);
      return `[Unsupported document type: ${mime}]`;
    } catch (err: any) {
      this.logger.warn(`Document parsing failed for ${mime}: ${err?.message}`);
      return `[Failed to extract text from ${mime} document]`;
    }
  }

  private decodeText(buffer: Buffer, mime: string): string {
    const text = buffer.toString('utf-8');
    if (!text.trim()) return `[Empty ${mime} document]`;
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
      if (!text) return '[PDF document: no extractable text found — may be scanned/image-based]';
      const header = `[PDF document — ${pages} page${pages === 1 ? '' : 's'}]`;
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
    if (!text) return '[DOCX document: no extractable text found]';
    return text.length > this.MAX_TEXT
      ? `[DOCX document]\n${text.slice(0, this.MAX_TEXT)}\n... [truncated, ${text.length.toLocaleString()} chars total]`
      : `[DOCX document]\n${text}`;
  }
}
