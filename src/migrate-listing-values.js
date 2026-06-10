require("dotenv").config();
const mongoose = require("mongoose");
const Listing = require("./models/Listing");

function isNumericString(val) {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  return trimmed !== "" && !isNaN(Number(trimmed));
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const listings = await Listing.find({}).lean();
  let totalUpdated = 0;
  let totalKeys = 0;
  let totalConverted = 0;

  for (const listing of listings) {
    const raw =
      listing.propertyValues instanceof Map
        ? Object.fromEntries(listing.propertyValues)
        : listing.propertyValues || {};

    const newValues = {};
    let changed = false;

    for (const [key, value] of Object.entries(raw)) {
      const newKey = key.replace(/_/g, "-");
      let newValue = value;

      if (newKey !== key) {
        changed = true;
        totalKeys++;
      }

      if (isNumericString(value)) {
        newValue = Number(value.trim());
        if (newValue !== value) {
          changed = true;
          totalConverted++;
        }
      }

      newValues[newKey] = newValue;
    }

    if (changed) {
      await Listing.findByIdAndUpdate(listing._id, {
        $set: { propertyValues: newValues },
      });
      totalUpdated++;
    }
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  process.exit(1);
});
