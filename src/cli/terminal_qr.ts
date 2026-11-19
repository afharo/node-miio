import { renderUnicodeCompact } from "uqr";

/**
 * Draws a QR code in the terminal (2 rows of modules per line), for dark terminal themes.
 *
 * @param text The text to encode
 * @returns The QR code, ready to print
 */
export function terminalQr(text: string): string {
  return renderUnicodeCompact(text, { border: 2 });
}
