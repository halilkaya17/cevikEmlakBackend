/**
 * Migration: timestamp-tabanlı property key'lerini okunabilir slug'lara çevirir.
 *
 * Güncellenen koleksiyonlar:
 *   1. categories  → propertyGroups[].key, propertyGroups[].fields[].key
 *                    subcategories[].propertyGroups[].key, ...fields[].key
 *   2. listings    → propertyValues Map key'leri
 *
 * Kullanım: node src/migrate-keys.js
 */

require("dotenv").config();

const mongoose = require("mongoose");
const Category = require("./models/Category");
const Listing  = require("./models/Listing");

// ─── Key haritası ─────────────────────────────────────────────────────────────

const KEY_MAP = {
  // Grup key'leri
  "grup-yeni-1778585902390": "temel-ozellikler",

  // Field key'leri
  "alan-yeni-1778585903724": "brut-m2",
  "alan-yeni-1778585976942": "net-m2",
  "alan-yeni-1778585996716": "oda-sayisi",
  "alan-yeni-1778586013999": "bulundugu-kat",
  "alan-yeni-1778586028115": "kat-sayisi",
  "alan-yeni-1778586037453": "aidat",
  "alan-yeni-1778586058413": "bina-yasi",
  "alan-yeni-1778586070221": "kullanim-durumu",
  "alan-yeni-1778586082341": "tapu-durumu",
  "alan-yeni-1778586090488": "cephe",
  "alan-yeni-1778591889713": "konut-tipi",
};

function mapKey(key) {
  return KEY_MAP[key] ?? key;
}

// ─── Category migration ───────────────────────────────────────────────────────

function migrateGroups(groups) {
  return (groups || []).map((group) => ({
    ...group,
    key: mapKey(group.key),
    fields: (group.fields || []).map((field) => ({
      ...field,
      key: mapKey(field.key),
    })),
  }));
}

async function migrateCategories() {
  const categories = await Category.find({}).lean();
  let updatedCount = 0;
  let keyChanges   = 0;

  for (const cat of categories) {
    const newPropertyGroups = migrateGroups(cat.propertyGroups);
    const newSubcategories  = (cat.subcategories || []).map((sub) => ({
      ...sub,
      propertyGroups: migrateGroups(sub.propertyGroups),
    }));

    // Değişiklik var mı kontrol et
    const oldStr = JSON.stringify({ pg: cat.propertyGroups, sub: cat.subcategories });
    const newStr = JSON.stringify({ pg: newPropertyGroups,  sub: newSubcategories  });

    if (oldStr === newStr) continue;

    // Key değişim sayısını say
    const oldKeys = (oldStr.match(/"key":"alan-yeni-|"key":"grup-yeni-/g) || []).length;
    keyChanges += oldKeys;

    await Category.updateOne(
      { _id: cat._id },
      { $set: { propertyGroups: newPropertyGroups, subcategories: newSubcategories } },
    );

    updatedCount++;
    console.log(`  ✓ Category güncellendi: "${cat.name}" (${cat.slug})`);
  }

  return { updatedCount, keyChanges };
}

// ─── Listing migration ────────────────────────────────────────────────────────

async function migrateListings() {
  const listings = await Listing.find({}).lean();
  let updatedCount = 0;
  let keyChanges   = 0;

  for (const listing of listings) {
    const rawValues = listing.propertyValues instanceof Map
      ? Object.fromEntries(listing.propertyValues.entries())
      : listing.propertyValues || {};

    const oldKeys = Object.keys(rawValues);
    const hasChange = oldKeys.some((k) => KEY_MAP[k]);

    if (!hasChange) continue;

    const newValues = {};
    for (const [key, value] of Object.entries(rawValues)) {
      const newKey = mapKey(key);
      newValues[newKey] = value;
      if (newKey !== key) keyChanges++;
    }

    await Listing.updateOne(
      { _id: listing._id },
      { $set: { propertyValues: newValues } },
    );

    updatedCount++;
    console.log(`  ✓ Listing güncellendi: "${listing.title}" (${listing.listingNo})`);
  }

  return { updatedCount, keyChanges };
}

// ─── Ana akış ─────────────────────────────────────────────────────────────────

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI tanımlı değil");

  console.log("MongoDB'ye bağlanılıyor...");
  await mongoose.connect(uri);
  console.log("Bağlantı kuruldu.\n");

  // ── Categories ──
  console.log("=== CATEGORIES migrasyonu başlıyor ===");
  const catResult = await migrateCategories();
  console.log(`\nCategories: ${catResult.updatedCount} belge güncellendi, ${catResult.keyChanges} key değiştirildi.\n`);

  // ── Listings ──
  console.log("=== LISTINGS migrasyonu başlıyor ===");
  const listResult = await migrateListings();
  console.log(`\nListings: ${listResult.updatedCount} belge güncellendi, ${listResult.keyChanges} key değiştirildi.\n`);

  // ── Özet ──
  console.log("=== ÖZET ===");
  console.log(`Categories güncellenen: ${catResult.updatedCount}`);
  console.log(`Listings güncellenen:   ${listResult.updatedCount}`);
  console.log(`Toplam key değişimi:    ${catResult.keyChanges + listResult.keyChanges}`);
  console.log("\nMigrasyon tamamlandı.");

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Migrasyon hatası:", err.message);
  process.exit(1);
});
