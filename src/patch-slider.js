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
  if (!page) {process.exit(1);
  }

  const sliderIdx = page.sections.findIndex((s) => s.key === "slider");
  if (sliderIdx === -1) {process.exit(1);
  }

  page.sections[sliderIdx].blocks = newSliderBlocks;
  page.markModified("sections");
  await page.save();process.exit(0);
}

main().catch((err) => {process.exit(1);
});
