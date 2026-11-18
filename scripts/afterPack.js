const path = require("path");
const rcedit = require("rcedit");

exports.default = async function (context) {
  const exePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`
  );
  const iconPath = path.join(__dirname, "..", "build", "app-logo.ico");

  console.log(`  • rcedit (afterPack)  exe=${exePath} icon=${iconPath}`);
  await rcedit.rcedit(exePath, { icon: iconPath });
  console.log(`  • rcedit done`);
};
