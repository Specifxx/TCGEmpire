import { Jimp } from "jimp";
async function main() {
  const rc = await Jimp.read("public/logo-rc.png");
  const r = await Jimp.read("public/logo-r.png");
  const c = await Jimp.read("public/logo-c.png");
  const bg = new Jimp({ width: 760, height: 300, color: 0x0b0e14ff });
  // mark (RC) top-left
  const rcS = rc.clone(); rcS.resize({ w: 220 });
  bg.composite(rcS, 40, 30);
  // R and C glyphs separately on the right
  const rS = r.clone(); rS.resize({ h: 150 });
  const cS = c.clone(); cS.resize({ h: 150 });
  bg.composite(rS, 330, 70);
  bg.composite(cS, 520, 70);
  await bg.write("public/preview-mark.png" as `${string}.${string}`);
  console.log("wrote public/preview-mark.png");
}
main().catch((e)=>{console.error(e);process.exit(1)});
