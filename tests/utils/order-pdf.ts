import fs from 'fs';
import zlib from 'zlib';
import { expect } from '@playwright/test';

// Reads the "Download Order" PDF (iText 2.1.7, Helvetica, FlateDecode content streams; confirmed
// on Order_4608.pdf 2026-09-28) without a PDF library: each BT…ET text block becomes one line.
// Good enough for the text-presence checks the order-detail suite needs, not for layout.
export class OrderPdf {
  readonly raw: string;
  readonly lines: string[];

  private constructor(buffer: Buffer) {
    this.raw = buffer.toString('latin1');
    this.lines = OrderPdf.extractLines(buffer);
  }

  static fromFile(filePath: string): OrderPdf {
    return new OrderPdf(fs.readFileSync(filePath));
  }

  static fromBuffer(buffer: Buffer): OrderPdf {
    return new OrderPdf(buffer);
  }

  static isPdf(buffer: Buffer): boolean {
    return buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  }

  // All text on one line, whitespace collapsed; values are often split across blocks
  // (e.g. "CAD" and "80.00" are separate blocks in the Totals).
  get text(): string {
    return this.lines.join(' ').replace(/\s+/g, ' ').trim();
  }

  // The document-info /Title (the first /Title in the file is the header text, not the metadata).
  get title(): string | undefined {
    const info = this.raw.match(/<<[^<>]*\/Producer[^<>]*>>/)?.[0] ?? '';
    return info.match(/\/Title\s*\(((?:\\.|[^\\)])*)\)/)?.[1];
  }

  get pageCount(): number {
    return (this.raw.match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
  }

  get imageCount(): number {
    return (this.raw.match(/\/Subtype\s*\/Image/g) ?? []).length;
  }

  assertContains(expected: string | RegExp): void {
    if (typeof expected === 'string') expect(this.text).toContain(expected);
    else expect(this.text).toMatch(expected);
  }

  assertNotContains(unexpected: string): void {
    expect(this.text).not.toContain(unexpected);
  }

  private static extractLines(buffer: Buffer): string[] {
    const source = buffer.toString('latin1');
    const lines: string[] = [];
    const streamStart = /stream\r?\n/g;
    let match: RegExpExecArray | null;
    while ((match = streamStart.exec(source))) {
      const start = match.index + match[0].length;
      const end = source.indexOf('endstream', start);
      let content: string;
      try {
        content = zlib.inflateSync(buffer.subarray(start, end)).toString('latin1');
      } catch {
        continue; // not a Flate stream (e.g. font data)
      }
      for (const block of content.split(/\bBT\b/).slice(1)) {
        const body = block.split(/\bET\b/)[0];
        const parts = [...body.matchAll(/\((?:\\.|[^\\)])*\)/g)].map((m) => OrderPdf.unescape(m[0].slice(1, -1)));
        if (parts.length) lines.push(parts.join(''));
      }
    }
    return lines;
  }

  private static unescape(value: string): string {
    return value.replace(/\\([nrtbf()\\]|\d{1,3})/g, (_, c: string) => {
      if (/^\d/.test(c)) return String.fromCharCode(parseInt(c, 8));
      return ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' } as Record<string, string>)[c] ?? c;
    });
  }
}
