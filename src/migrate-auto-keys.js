/**
 * Migration: Veritabanındaki "grup-yeni-*" ve "alan-yeni-*" key'lerini
 * label/name'den üretilen slug+timestamp formatına çevirir.
 *
 * Kullanım: node src/migrate-auto-keys.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("./models/Category");
const { toSlug } = require("./utils/slug");

/** "grup-yeni-*", "alan-yeni-*" veya daha önce slug+timestamp olarak migrate edilmiş key'leri tanır */
function isAutoKey(key) {
  return /^(alan|grup)-yeni-\d+$/.test(key || "") || /^.+-\d{13}$/.test(key || "");
}

function generateKey(label) {
  return toSlug(label || "alan");
}

function patchFields(fields) {
  let changed = false;
  const patched = (fields || []).map((field) => {
    if (!isAutoKey(field.key)) return field;
    const newKey = generateKey(field.label);
    changed = true;
    return { ...field, key: newKey };
  });
  return { patched, changed };
}

function patchGroups(groups) {
  let changed = false;
  const patched = (groups || []).map((group) => {
    let groupChanged = false;
    let newGroupKey = group.key;

    if (isAutoKey(group.key)) {
      newGroupKey = generateKey(group.name);
      groupChanged = true;
    }

    const fieldResult = patchFields(group.fields);
    if (fieldResult.changed) groupChanged = true;

    if (groupChanged) changed = true;
    return groupChanged
      ? { ...group, key: newGroupKey, fields: fieldResult.patched }
      : group;
  });
  return { patched, changed };
}

async function run() {
  console.log("MongoDB'ye bağlanılıyor...");
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Bağlantı kuruldu.\n");

  const categories = await Category.find({}).lean();
  let totalCats = 0;
  let totalGroups = 0;
  let totalFields = 0;

  for (const cat of categories) {
    let catChanged = false;
    const update = {};

    const pgResult = patchGroups(cat.propertyGroups);
    if (pgResult.changed) {
      update.propertyGroups = pgResult.patched;
      catChanged = true;
      pgResult.patched.forEach((g, i) => {
        if (g.key !== (cat.propertyGroups[i] || {}).key) totalGroups++;
        (g.fields || []).forEach((f, j) => {
          if (f.key !== ((cat.propertyGroups[i] || {}).fields || [])[j]?.key) totalFields++;
        });
      });
    }

    const patchedSubs = (cat.subcategories || []).map((sub) => {
      const subResult = patchGroups(sub.propertyGroups);
      if (subResult.changed) {
        catChanged = true;
        subResult.patched.forEach((g, i) => {
          if (g.key !== (sub.propertyGroups[i] || {}).key) totalGroups++;
          (g.fields || []).forEach((f, j) => {
            if (f.key !== ((sub.propertyGroups[i] || {}).fields || [])[j]?.key) totalFields++;
          });
        });
        return { ...sub, propertyGroups: subResult.patched };
      }
      return sub;
    });

    if (catChanged) {
      update.subcategories = patchedSubs;
      await Category.findByIdAndUpdate(cat._id, update);
      totalCats++;
      console.log(`✓ Güncellendi: ${cat.name}`);

      // Hangi alt tipler güncellendi göster
      (cat.subcategories || []).forEach((sub, i) => {
        const pSub = patchedSubs[i];
        const subChanged = JSON.stringify(sub.propertyGroups) !== JSON.stringify(pSub.propertyGroups);
        if (subChanged) {
          console.log(`    └─ ${sub.name || sub.slug}`);
          (pSub.propertyGroups || []).forEach((g, gi) => {
            const origGroup = (sub.propertyGroups || [])[gi] || {};
            if (g.key !== origGroup.key) {
              console.log(`       Grup: "${origGroup.key}" → "${g.key}"`);
            }
            (g.fields || []).forEach((f, fi) => {
              const origField = (origGroup.fields || [])[fi] || {};
              if (f.key !== origField.key) {
                console.log(`         Alan: "${origField.key}" → "${f.key}"  (${f.label})`);
              }
            });
          });
        }
      });

      // Parent grup değişimleri
      (pgResult.patched || []).forEach((g, gi) => {
        const origGroup = (cat.propertyGroups || [])[gi] || {};
        if (g.key !== origGroup.key) {
          console.log(`   Parent grup: "${origGroup.key}" → "${g.key}"`);
        }
      });
    } else {
      console.log(`  Atlandı:    ${cat.name}`);
    }
  }

  console.log(`\n=== ÖZET ===`);
  console.log(`Güncellenen kategori : ${totalCats}`);
  console.log(`Güncellenen grup     : ${totalGroups}`);
  console.log(`Güncellenen alan     : ${totalFields}`);

  await mongoose.disconnect();
  console.log("\nTamamlandı.");
}

run().catch((err) => {
  console.error("Hata:", err);
  process.exit(1);
});
