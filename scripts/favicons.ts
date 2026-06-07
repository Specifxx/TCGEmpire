// Generate the legacy favicon.ico (16/32/48 — Google-recommended multiples of 48)
// and an apple-touch-icon from the green-R tile, so the favicon is discoverable via
// every path Google/browsers check (/favicon.ico + <link rel=icon> + apple-icon).
import { Jimp } from "jimp";
import { writeFileSync } from "node:fs";

async function pngBuf(size: number): Promise<Buffer> {
  const img = await Jimp.read("public/icon-512.png");
  img.resize({ w: size, h: size });
  return (await img.getBuffer("image/png")) as Buffer;
}

async function main() {
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(sizes.map(pngBuf));
  const count = sizes.length;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(count, 4);

  const entries: Buffer[] = [];
  let offset = 6 + count * 16;
  for (let i = 0; i < count; i++) {
    const e = Buffer.alloc(16);
    e.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 0); // width
    e.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(pngs[i].length, 8); // image size
    e.writeUInt32LE(offset, 12); // image offset
    offset += pngs[i].length;
    entries.push(e);
  }
  const ico = Buffer.concat([header, ...entries, ...pngs]);
  writeFileSync("src/app/favicon.ico", ico);
  console.log(`wrote src/app/favicon.ico (${ico.length} bytes, sizes ${sizes.join("/")})`);

  // apple-touch-icon (Next serves app/apple-icon.png as rel="apple-touch-icon").
  const apple = await Jimp.read("public/icon-512.png");
  apple.resize({ w: 180, h: 180 });
  await apple.write("src/app/apple-icon.png" as `${string}.png`);
  console.log("wrote src/app/apple-icon.png (180x180)");
}
main().catch((e) => { console.error(e); process.exit(1); });
