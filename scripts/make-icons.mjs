/**
 * Builds the app's icons from the factory's own mark.
 *
 * The icons were a lettermark ("RDT") drawn in SVG; they are now the Rado
 * logo itself, so the browser tab, the installed app and the sign-in screen
 * all show the same thing. No image library: the mark is a small 8-bit RGBA
 * PNG, and node ships the deflate half of the format already, so the file is
 * decoded, scaled onto a square white ground and written back out here rather
 * than adding a dependency for four files generated once.
 *
 *   node scripts/make-icons.mjs
 *
 * Scaling is nearest-neighbour, which is exactly right for this mark: flat
 * areas of red, black and white with no gradients to band.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

const SOURCE = "public/rado-logo.png";

/** Icon files: path, pixel size, and how much of it the mark fills. */
const TARGETS = [
  { path: "public/icon-192.png", size: 192, fill: 0.82 },
  { path: "public/icon-512.png", size: 512, fill: 0.82 },
  // Maskable icons are cropped to a circle by the launcher, so the mark sits
  // inside the safe zone — a good deal smaller than the icon itself.
  { path: "public/icon-192-maskable.png", size: 192, fill: 0.6 },
  { path: "public/icon-512-maskable.png", size: 512, fill: 0.6 },
  { path: "public/apple-touch-icon.png", size: 180, fill: 0.78 },
  // Next serves this one as the favicon, from the app directory.
  { path: "src/app/icon.png", size: 256, fill: 0.84 },
];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** An 8-bit truecolour PNG as flat RGBA, which is all the mark ever is. */
function decodePng(file) {
  if (file.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");

  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];

  let at = 8;
  while (at < file.length) {
    const length = file.readUInt32BE(at);
    const type = file.toString("latin1", at + 4, at + 8);
    const body = file.subarray(at + 8, at + 8 + length);

    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      const colour = body[9];
      if (depth !== 8) throw new Error(`only 8-bit is handled, not ${depth}`);
      if (colour !== 2 && colour !== 6) throw new Error(`colour type ${colour} is not handled`);
      if (body[12] !== 0) throw new Error("interlaced PNGs are not handled");
      channels = colour === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }

    at += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));

    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? line[i - channels] : 0;
      const up = previous[i];
      const upLeft = i >= channels ? previous[i - channels] : 0;
      if (filter === 1) line[i] = (line[i] + left) & 0xff;
      else if (filter === 2) line[i] = (line[i] + up) & 0xff;
      else if (filter === 3) line[i] = (line[i] + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) line[i] = (line[i] + paeth(left, up, upLeft)) & 0xff;
      else if (filter !== 0) throw new Error(`unknown filter ${filter}`);
    }

    for (let x = 0; x < width; x++) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      pixels[to] = line[from];
      pixels[to + 1] = line[from + 1];
      pixels[to + 2] = line[from + 2];
      pixels[to + 3] = channels === 4 ? line[from + 3] : 255;
    }

    previous = line;
  }

  return { width, height, pixels };
}

/** Flat RGB (the icons are opaque) back into a PNG file. */
function encodePng(width, height, rgb) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // no filter: these are tiny and flat
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const chunk = (type, body) => {
    const out = Buffer.alloc(body.length + 12);
    out.writeUInt32BE(body.length, 0);
    out.write(type, 4, "latin1");
    body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The mark centred on white, at `size` square, filling `fill` of it. */
function square(source, size, fill) {
  const out = Buffer.alloc(size * size * 3, 0xff);

  const scale = Math.min(
    (size * fill) / source.width,
    (size * fill) / source.height,
  );
  const drawnW = Math.round(source.width * scale);
  const drawnH = Math.round(source.height * scale);
  const offsetX = Math.round((size - drawnW) / 2);
  const offsetY = Math.round((size - drawnH) / 2);

  for (let y = 0; y < drawnH; y++) {
    const sourceY = Math.min(source.height - 1, Math.floor((y * source.height) / drawnH));
    for (let x = 0; x < drawnW; x++) {
      const sourceX = Math.min(source.width - 1, Math.floor((x * source.width) / drawnW));
      const from = (sourceY * source.width + sourceX) * 4;
      const alpha = source.pixels[from + 3] / 255;
      if (alpha === 0) continue;

      const to = ((y + offsetY) * size + (x + offsetX)) * 3;
      // Composited onto white, because the icons are opaque.
      for (let c = 0; c < 3; c++) {
        out[to + c] = Math.round(source.pixels[from + c] * alpha + 255 * (1 - alpha));
      }
    }
  }

  return out;
}

const source = decodePng(readFileSync(SOURCE));
console.log(`${SOURCE}: ${source.width} x ${source.height}`);

for (const target of TARGETS) {
  const rgb = square(source, target.size, target.fill);
  const file = encodePng(target.size, target.size, rgb);
  writeFileSync(target.path, file);

  // Read it back, so a file that cannot be decoded never reaches the build.
  const check = decodePng(file);
  if (check.width !== target.size || check.height !== target.size) {
    throw new Error(`${target.path} came back as ${check.width} x ${check.height}`);
  }
  console.log(`${target.path}: ${target.size} x ${target.size}, ${file.length} bytes`);
}
