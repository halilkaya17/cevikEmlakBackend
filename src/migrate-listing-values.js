/**
 * Migration: Listing propertyValues içindeki
 *  1) alt çizgili key'leri tireye çevirir  (net_m2 → net-m2)
 *  2) sayısal string değerleri number'a dönüştürür ("120" → 120)
 *
 * Kullanım: node src/migrate-listing-values.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Listing = require("./models/Listing");

/** Sayısal görünen string mi? */
function isNumericString(val) {
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  return trimmed !== "" && !isNaN(Number(trimmed));
}

async function run() {
  console.log("MongoDB'ye bağlanılıyor...");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Bağlantı kuruldu.\n");

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

      // Sayısal string → number
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
      console.log(`✓ ${listing.title?.slice(0, 60)}`);
    }
  }

  console.log(`\n=== ÖZET ===`);
  console.log(`Güncellenen ilan        : ${totalUpdated}`);
  console.log(`Düzeltilen key (_→-)    : ${totalKeys}`);
  console.log(`String→Number dönüşümü  : ${totalConverted}`);

  await mongoose.disconnect();
  console.log("\nTamamlandı.");
}

run().catch((err) => {
  console.error("Hata:", err);
  process.exit(1);
});
