// PNG에서 다중 사이즈 ICO 생성 스크립트
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SIZES = [16, 24, 32, 48, 64, 128, 256];

async function pngToIco(pngPath, icoPath) {
  const buffers = [];

  for (const size of SIZES) {
    const buf = await sharp(pngPath)
      .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    buffers.push(buf);
  }

  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = ICO
  header.writeUInt16LE(SIZES.length, 4); // image count

  // Directory entries: 16 bytes each
  const dirSize = SIZES.length * 16;
  let dataOffset = 6 + dirSize;

  const entries = [];
  for (let i = 0; i < SIZES.length; i++) {
    const entry = Buffer.alloc(16);
    entry[0] = SIZES[i] < 256 ? SIZES[i] : 0; // width (0 = 256)
    entry[1] = SIZES[i] < 256 ? SIZES[i] : 0; // height
    entry[2] = 0; // color palette
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buffers[i].length, 8); // image size
    entry.writeUInt32LE(dataOffset, 12); // image offset
    dataOffset += buffers[i].length;
    entries.push(entry);
  }

  const ico = Buffer.concat([header, ...entries, ...buffers]);
  fs.writeFileSync(icoPath, ico);
  console.log(`Created: ${icoPath} (${SIZES.join(", ")}px, ${ico.length} bytes)`);
}

async function main() {
  const buildDir = path.join(__dirname, "..", "build");
  await pngToIco(path.join(buildDir, "AppLogo.png"), path.join(buildDir, "app-logo.ico"));
  await pngToIco(path.join(buildDir, "SetupLogo.png"), path.join(buildDir, "setup-logo.ico"));
  console.log("Done.");
}

main().catch(console.error);
