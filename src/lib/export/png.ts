import { inflateSync } from "node:zlib";

/**
 * Just enough PNG decoding to put the company mark inside a PDF.
 *
 * A PDF cannot take a PNG file as it is: the colour samples and the
 * transparency have to arrive as two separate images, the second one the
 * "soft mask" of the first. So the file is inflated, its scanline filters are
 * undone, and the pixels are split into an RGB plane and an alpha plane.
 *
 * Deliberately narrow — eight-bit, non-interlaced truecolour with or without
 * alpha, which is what the logo is. Anything else is refused by name rather
 * than decoded wrongly, because a mangled logo on a payslip is worse than an
 * error in a test.
 */

export interface DecodedPng {
  width: number;
  height: number;
  /** Three bytes per pixel, row by row. */
  rgb: Buffer;
  /** One byte per pixel; null when the image is fully opaque. */
  alpha: Buffer | null;
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The Paeth predictor from the PNG specification, section 9.4. */
function paeth(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : upLeft;
}

export function decodePng(file: Buffer): DecodedPng {
  if (file.length < 8 || !file.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("Not a PNG file.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colourType = -1;
  let interlace = 0;
  const idat: Buffer[] = [];

  while (offset + 8 <= file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("latin1", offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colourType = data[9]!;
      interlace = data[12]!;
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }

    // length, type, data, CRC
    offset += 12 + length;
  }

  if (bitDepth !== 8 || interlace !== 0 || (colourType !== 2 && colourType !== 6)) {
    throw new Error(
      `Unsupported PNG (depth ${bitDepth}, colour type ${colourType}, interlace ${interlace}).`,
    );
  }

  const channels = colourType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));

  if (raw.length < height * (stride + 1)) {
    throw new Error("PNG image data is shorter than its header says.");
  }

  const pixels = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const source = y * (stride + 1) + 1;
    const target = y * stride;

    for (let x = 0; x < stride; x++) {
      const value = raw[source + x]!;
      const left = x >= channels ? pixels[target + x - channels]! : 0;
      const up = y > 0 ? pixels[target + x - stride]! : 0;
      const upLeft = y > 0 && x >= channels ? pixels[target + x - stride - channels]! : 0;

      let decoded: number;
      switch (filter) {
        case 0:
          decoded = value;
          break;
        case 1:
          decoded = value + left;
          break;
        case 2:
          decoded = value + up;
          break;
        case 3:
          decoded = value + ((left + up) >> 1);
          break;
        case 4:
          decoded = value + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`Unknown PNG filter type ${filter}.`);
      }
      pixels[target + x] = decoded & 0xff;
    }
  }

  if (channels === 3) return { width, height, rgb: pixels, alpha: null };

  const rgb = Buffer.alloc(width * height * 3);
  const alpha = Buffer.alloc(width * height);
  let opaque = true;

  for (let i = 0; i < width * height; i++) {
    rgb[i * 3] = pixels[i * 4]!;
    rgb[i * 3 + 1] = pixels[i * 4 + 1]!;
    rgb[i * 3 + 2] = pixels[i * 4 + 2]!;
    alpha[i] = pixels[i * 4 + 3]!;
    if (alpha[i] !== 255) opaque = false;
  }

  return { width, height, rgb, alpha: opaque ? null : alpha };
}
