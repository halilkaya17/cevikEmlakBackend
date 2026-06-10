require("dotenv").config();
const mongoose = require("mongoose");
const Category = require("./models/Category");

function fixKey(key) {
  return (key || "").replace(/_/g, "-");
}

function patchGroups(groups) {
  let changed = false;
  const patched = (groups || []).map((group) => {
    let groupChanged = false;
    const newGroupKey = fixKey(group.key);
    if (newGroupKey !== group.key) groupChanged = true;

    const fields = (group.fields || []).map((field) => {
      const newFieldKey = fixKey(field.key);
      if (newFieldKey !== field.key) {
        groupChanged = true;
        return { ...field, key: newFieldKey };
      }
      return field;
    });

    if (groupChanged) {
      changed = true;
      return { ...group, key: newGroupKey, fields };
    }
    return group;
  });
  return { patched, changed };
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const categories = await Category.find({}).lean();
  let totalCats = 0;
  let totalKeys = 0;

  for (const cat of categories) {
    let catChanged = false;
    const update = {};

    const pgResult = patchGroups(cat.propertyGroups);
    if (pgResult.changed) {
      update.propertyGroups = pgResult.patched;
      catChanged = true;
    }

    const patchedSubs = (cat.subcategories || []).map((sub) => {
      const subResult = patchGroups(sub.propertyGroups);
      if (subResult.changed) {
        catChanged = true;
        return { ...sub, propertyGroups: subResult.patched };
      }
      return sub;
    });

    if (catChanged) {
      update.subcategories = patchedSubs;
      await Category.findByIdAndUpdate(cat._id, update);
      totalCats++;

      const allOld = [
        ...(cat.propertyGroups || []),
        ...(cat.subcategories || []).flatMap((s) => s.propertyGroups || []),
      ];
      const allNew = [
        ...(pgResult.patched || []),
        ...patchedSubs.flatMap((s) => s.propertyGroups || []),
      ];
      allOld.forEach((g, i) => {
        const ng = allNew[i];
        if (!ng) return;
        if (g.key !== ng.key) {
          totalKeys++;
        }
        (g.fields || []).forEach((f, j) => {
          const nf = (ng.fields || [])[j];
          if (nf && f.key !== nf.key) {
            totalKeys++;
          }
        });
      });

    } else {
    }
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  process.exit(1);
});
