const crypto = require("crypto");
const express = require("express");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function cloudinaryConfig() {
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "dqsuchxee",
    apiKey: process.env.CLOUDINARY_API_KEY || "922416189361868",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "-hBd3q-NlhaV_f4FHGDETOkomxc",
  };
}

function signDestroy({ publicId, timestamp, invalidate }, apiSecret) {
  const base = `invalidate=${invalidate}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  return crypto.createHash("sha1").update(base).digest("hex");
}

router.post("/destroy", requireAuth, async (req, res, next) => {
  try {
    const publicId = String(req.body.publicId || "").trim();
    const resourceType = String(req.body.resourceType || "image").trim() || "image";
    if (!publicId) return res.status(400).json({ message: "publicId zorunludur" });

    const { cloudName, apiKey, apiSecret } = cloudinaryConfig();
    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({ message: "Cloudinary ayarlari eksik" });
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const invalidate = "true";
    const signature = signDestroy({ publicId, timestamp, invalidate }, apiSecret);
    const body = new URLSearchParams({
      public_id: publicId,
      api_key: apiKey,
      timestamp: String(timestamp),
      invalidate,
      signature,
    });

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ message: data.error?.message || "Cloudinary silme basarisiz" });
    }

    return res.json({ result: data.result || "ok" });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
