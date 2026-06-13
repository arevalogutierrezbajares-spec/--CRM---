/**
 * Builds a real, fully valid PNG in-process (proper chunk CRCs, deflated
 * RGBA scanlines) so signature tests exercise the same payload shape a
 * browser canvas produces. Never hand-craft PNG base64 in tests — malformed
 * bodies send pdf-lib's decoder into an infinite loop, which is exactly the
 * bug class these tests guard against.
 */
import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  head.copy(out, 4);
  out.writeUInt32BE(crc32(head), 8 + data.length);
  return out;
}

/** Transparent RGBA PNG with a dark diagonal stroke — a stand-in signature. */
export function makeTestSignaturePng(width = 200, height = 80): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const row = y * (1 + width * 4);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      // Ink along the diagonal band so the image isn't fully transparent.
      if (Math.abs((x / width) * height - y) < 3) {
        const p = row + 1 + x * 4;
        raw[p] = 26;
        raw[p + 1] = 26;
        raw[p + 2] = 46;
        raw[p + 3] = 255;
      }
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
