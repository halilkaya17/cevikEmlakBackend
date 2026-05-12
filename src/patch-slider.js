require("dotenv").config();
const { connectDatabase } = require("./config/db");
const PageContent = require("./models/PageContent");

async function main() {
  await connectDatabase();

  const newSliderBlocks = [
    {
      key: "slides",
      label: "Slaytlar",
      type: "slider-list",
      value: [
        { id: "1", image: "/slider1.png", logo: "/logo.svg", title: "Dogru. Zaman. Dogru" },
        { id: "2", image: "/slider1.png", logo: "/logo.svg", title: "Dogru. Zaman. Dogru" },
      ],
    },
  ];

  const page = await PageContent.findOne({ pageKey: "home" });
  if (!page) {
    console.log("home sayfası bulunamadı");
    process.exit(1);
  }

  const sliderIdx = page.sections.findIndex((s) => s.key === "slider");
  if (sliderIdx === -1) {
    console.log("slider section bulunamadı");
    process.exit(1);
  }

  page.sections[sliderIdx].blocks = newSliderBlocks;
  page.markModified("sections");
  await page.save();

  console.log("Slider section guncellendi");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
