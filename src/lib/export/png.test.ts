import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { RADO_LOGO_PNG_BASE64 } from "./brand-logo";
import { decodePng } from "./png";
import { numberToWords, rupeesInWords } from "./words";

/** A PNG built by hand, so each filter type can be pinned to known pixels. */
function png(width: number, height: number, colourType: 2 | 6, scanlines: number[][]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "latin1");
    data.copy(out, 8);
    // The decoder does not check CRCs, so a zero is enough for a fixture.
    return out;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colourType;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from(scanlines.flat()))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("png decoder", () => {
  it("undoes the sub and up filters", () => {
    // Two RGB pixels per row. Row 1 uses Sub, row 2 uses Up.
    const decoded = decodePng(
      png(2, 2, 2, [
        [1, 10, 20, 30, 5, 5, 5],
        [2, 1, 1, 1, 1, 1, 1],
      ]),
    );

    expect([...decoded.rgb]).toEqual([10, 20, 30, 15, 25, 35, 11, 21, 31, 16, 26, 36]);
    expect(decoded.alpha).toBeNull();
  });

  it("splits alpha out of RGBA and keeps it when anything is transparent", () => {
    const decoded = decodePng(png(1, 1, 6, [[0, 200, 100, 50, 128]]));
    expect([...decoded.rgb]).toEqual([200, 100, 50]);
    expect([...decoded.alpha!]).toEqual([128]);
  });

  it("decodes the real logo to its stated size", () => {
    const logo = decodePng(Buffer.from(RADO_LOGO_PNG_BASE64, "base64"));
    expect(logo.width).toBe(150);
    expect(logo.height).toBe(147);
    expect(logo.rgb.length).toBe(150 * 147 * 3);
    // The mark sits on a solid white square — no transparency to carry.
    expect(logo.alpha).toBeNull();
    expect([...logo.rgb.subarray(0, 3)]).toEqual([255, 255, 255]);
  });

  it("refuses something that is not a PNG", () => {
    expect(() => decodePng(Buffer.from("GIF89a"))).toThrow(/Not a PNG/);
  });
});

describe("amount in words", () => {
  it("writes lakh and crore the way the office does", () => {
    expect(numberToWords(46585)).toBe("Forty-Six Thousand Five Hundred Eighty-Five");
    expect(numberToWords(110000)).toBe("One Lakh Ten Thousand");
    expect(numberToWords(18315192)).toBe(
      "One Crore Eighty-Three Lakh Fifteen Thousand One Hundred Ninety-Two",
    );
  });

  it("frames it as rupees, rounding away paisa", () => {
    expect(rupeesInWords(0)).toBe("Rupees Zero Only");
    expect(rupeesInWords(1000.4)).toBe("Rupees One Thousand Only");
  });
});
