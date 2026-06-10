const mongoose = require("mongoose");
const neighborhoodGeometrySchema = new mongoose.Schema(
  {
    gid:        { type: Number },
    id:         { type: Number },
    parent_id:  { type: Number },
    baslik:     { type: String },
    baslik_ful: { type: String },
    baslik_f_1: { type: String },
    skor:       { type: Number },
    seviye:     { type: Number },
    alan:       { type: Number },
    geom:       { type: String },
  },
  {
    collection: "geo_locations",
    timestamps: false,
    versionKey: false,
  },
);

neighborhoodGeometrySchema.index({ baslik_ful: 1 });
neighborhoodGeometrySchema.index({ baslik_f_1: 1 });

module.exports = mongoose.model("NeighborhoodGeometry", neighborhoodGeometrySchema);
