import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function renderIconPng(size: number, maskable: boolean): Buffer {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cx = size / 2;
  const cy = size / 2;
  const scale = maskable ? 0.72 : 0.88;
  const radiusCorner = maskable ? 0 : size * 0.22;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter None
    for (let x = 0; x < size; x++) {
      const idx = rowStart + 1 + x * 4;
      let inside = true;
      if (!maskable && radiusCorner > 0) {
        const dx = Math.max(radiusCorner - x, x - (size - 1 - radiusCorner), 0);
        const dy = Math.max(radiusCorner - y, y - (size - 1 - radiusCorner), 0);
        if (dx * dx + dy * dy > radiusCorner * radiusCorner) {
          inside = false;
        }
      }

      if (!inside) {
        raw[idx] = 0;
        raw[idx + 1] = 0;
        raw[idx + 2] = 0;
        raw[idx + 3] = 0;
        continue;
      }

      // Base background #0F172A
      let r = 15;
      let g = 23;
      let b = 42;

      const nx = (x - cx) / (size * 0.5 * scale);
      const ny = (y - cy) / (size * 0.5 * scale);
      const dist = Math.hypot(nx, ny);

      // Outer subtle atmospheric ring
      if (Math.abs(dist - 0.68) < 0.065) {
        r = 28;
        g = 69;
        b = 104;
      }

      // Upper clean airflow wave (#38BDF8)
      if (Math.abs(nx) <= 0.54) {
        const wave1 = -0.10 - 0.14 * Math.sin(nx * Math.PI * 1.8);
        if (Math.abs(ny - wave1) < 0.065) {
          r = 56;
          g = 189;
          b = 248;
        }
      }

      // Lower clean airflow wave (#E2E8F0)
      if (Math.abs(nx) <= 0.44) {
        const wave2 = 0.19 - 0.11 * Math.sin(nx * Math.PI * 2.0);
        if (Math.abs(ny - wave2) < 0.055) {
          r = 226;
          g = 232;
          b = 240;
        }
      }

      // Emerald beacon dot inside safe zone (#10B981)
      if (Math.hypot(nx - 0.42, ny + 0.36) < 0.10) {
        r = 16;
        g = 185;
        b = 129;
      }

      raw[idx] = r;
      raw[idx + 1] = g;
      raw[idx + 2] = b;
      raw[idx + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const publicDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(publicDir, { recursive: true });
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), renderIconPng(192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), renderIconPng(512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), renderIconPng(512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), renderIconPng(180, false));
console.log('Generated PWA PNG icons in public/');
