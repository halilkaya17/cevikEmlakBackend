const slugify = require("slugify");

function toSlug(value) {
  return slugify(String(value || ""), {
    lower: true,
    strict: true,
    locale: "tr",
    trim: true,
  });
}

module.exports = { toSlug };
