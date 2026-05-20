/**
 * Migration: Tüm category ve subcategory propertyGroups içindeki
 * "oda-sayisi" field'larını referans tanıma göre günceller.
 *
 * Kullanım: node src/migrate-oda-sayisi.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("./models/Category");

const ODA_SAYISI_REF = {
  key: "oda-sayisi",
  label: "Oda Sayısı",
  type: "select",
  unit: "",
  icon: "room",
  options: [
    { label: "1+0",   value: "1-0",   icon: "" },
    { label: "1+1",   value: "1-1",   icon: "" },
    { label: "1.5+1", value: "1_5-1", icon: "" },
    { label: "2+0",   value: "2-0",   icon: "" },
    { label: "2+1",   value: "2-1",   icon: "" },
    { label: "2.5+1", value: "2_5-1", icon: "" },
    { label: "2+2",   value: "2-2",   icon: "" },
    { label: "3+0",   value: "3-0",   icon: "" },
    { label: "3+1",   value: "3-1",   icon: "" },
    { label: "3.5+1", value: "3_5-1", icon: "" },
    { label: "3+2",   value: "3-2",   icon: "" },
    { label: "3+3",   value: "3-3",   icon: "" },
    { label: "4+0",   value: "4-0",   icon: "" },
    { label: "4+1",   value: "4-1",   icon: "" },
    { label: "4.5+1", value: "4_5-1", icon: "" },
    { label: "4.5+2", value: "4_5-2", icon: "" },
    { label: "4+2",   value: "4-2",   icon: "" },
    { label: "4+3",   value: "4-3",   icon: "" },
    { label: "4+4",   value: "4-4",   icon: "" },
    { label: "5+1",   value: "5-1",   icon: "" },
    { label: "5.5+1", value: "5_5-1", icon: "" },
    { label: "5+2",   value: "5-2",   icon: "" },
    { label: "5+3",   value: "5-3",   icon: "" },
    { label: "5+4",   value: "5-4",   icon: "" },
    { label: "6+1",   value: "6-1",   icon: "" },
    { label: "6+2",   value: "6-2",   icon: "" },
    { label: "6.5+1", value: "6_5-1", icon: "" },
    { label: "6+3",   value: "6-3",   icon: "" },
    { label: "6+4",   value: "6-4",   icon: "" },
    { label: "7+1",   value: "7-1",   icon: "" },
    { label: "7+2",   value: "7-2",   icon: "" },
    { label: "7+3",   value: "7-3",   icon: "" },
    { label: "8+1",   value: "8-1",   icon: "" },
    { label: "8+2",   value: "8-2",   icon: "" },
    { label: "8+3",   value: "8-3",   icon: "" },
    { label: "8+4",   value: "8-4",   icon: "" },
    { label: "9+1",   value: "9-1",   icon: "" },
    { label: "9+2",   value: "9-2",   icon: "" },
    { label: "9+3",   value: "9-3",   icon: "" },
    { label: "9+4",   value: "9-4",   icon: "" },
    { label: "9+5",   value: "9-5",   icon: "" },
    { label: "9+6",   value: "9-6",   icon: "" },
  ],
  required: true,
  showOnCard: true,
  quickView: false,
};

/** "oda-sayisi" veya "oda_sayisi" key'lerini tanır */
function isOdaField(key) {
  return key === "oda-sayisi" || key === "oda_sayisi";
}

/** propertyGroups dizisindeki oda-sayisi / oda_sayisi field'larını referansla günceller.
 *  required / showOnCard / quickView mevcut değerleri korunur. */
function patchGroups(groups) {
  let changed = false;
  const patched = (groups || []).map((group) => {
    const fields = (group.fields || []).map((field) => {
      if (!isOdaField(field.key)) return field;

      const needsPatch =
        field.key !== ODA_SAYISI_REF.key ||
        field.type !== ODA_SAYISI_REF.type ||
        field.label !== ODA_SAYISI_REF.label ||
        JSON.stringify(field.options) !== JSON.stringify(ODA_SAYISI_REF.options);

      if (!needsPatch) return field;

      changed = true;
      return {
        ...field,
        key:     ODA_SAYISI_REF.key,
        label:   ODA_SAYISI_REF.label,
        type:    ODA_SAYISI_REF.type,
        unit:    ODA_SAYISI_REF.unit,
        icon:    ODA_SAYISI_REF.icon,
        options: ODA_SAYISI_REF.options,
        // required / showOnCard / quickView mevcut değerde kalır
      };
    });
    return { ...group, fields };
  });
  return { patched, changed };
}

async function run() {
  console.log("MongoDB'ye bağlanılıyor...");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Bağlantı kuruldu.\n");

  const categories = await Category.find({}).lean();
  let totalCats = 0;
  let totalFields = 0;

  for (const cat of categories) {
    let catChanged = false;
    const update = {};

    // Parent propertyGroups
    const pgResult = patchGroups(cat.propertyGroups);
    if (pgResult.changed) {
      update.propertyGroups = pgResult.patched;
      catChanged = true;
      totalFields += (cat.propertyGroups || [])
        .flatMap((g) => g.fields || [])
        .filter((f) => f.key === "oda-sayisi").length;
    }

    // Subcategories
    const patchedSubs = (cat.subcategories || []).map((sub) => {
      const subResult = patchGroups(sub.propertyGroups);
      if (subResult.changed) {
        catChanged = true;
        totalFields += (sub.propertyGroups || [])
          .flatMap((g) => g.fields || [])
          .filter((f) => f.key === "oda-sayisi").length;
        return { ...sub, propertyGroups: subResult.patched };
      }
      return sub;
    });

    if (catChanged) {
      update.subcategories = patchedSubs;
      await Category.findByIdAndUpdate(cat._id, update);
      totalCats++;
      console.log(`✓ Güncellendi: ${cat.name}`);
    } else {
      console.log(`  Atlandı:    ${cat.name} (zaten güncel)`);
    }
  }

  console.log(`\n=== ÖZET ===`);
  console.log(`Güncellenen kategori : ${totalCats}`);
  console.log(`Güncellenen oda-sayisi field : ${totalFields}`);

  await mongoose.disconnect();
  console.log("\nTamamlandı.");
}

run().catch((err) => {
  console.error("Hata:", err);
  process.exit(1);
});
