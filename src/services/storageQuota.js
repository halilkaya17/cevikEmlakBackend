const MediaAsset = require("../models/MediaAsset");

const DEFAULT_LIMIT_BYTES = 20 * 1024 * 1024 * 1024;

function storageLimitBytes() {
  const gb = Number(process.env.STORAGE_LIMIT_GB);
  if (Number.isFinite(gb) && gb > 0) return Math.floor(gb * 1024 ** 3);
  const bytes = Number(process.env.STORAGE_LIMIT_BYTES);
  if (Number.isFinite(bytes) && bytes > 0) return Math.floor(bytes);
  return DEFAULT_LIMIT_BYTES;
}

function formatGb(bytes) {
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

async function getTotalMediaBytes() {
  const rows = await MediaAsset.aggregate([{ $group: { _id: null, total: { $sum: "$size" } } }]);
  return rows[0]?.total || 0;
}

async function getStorageQuota() {
  const limit = storageLimitBytes();
  const used = await getTotalMediaBytes();
  const remaining = Math.max(0, limit - used);
  return {
    used,
    limit,
    remaining,
    full: used >= limit,
    percent: limit > 0 ? Math.min(100, (used / limit) * 100) : 0,
  };
}

/**
 * Yeni dosya yazılmadan önce çağrılır. Limit aşılırsa hata fırlatır.
 * @param {number} additionalBytes
 */
async function assertStorageAvailable(additionalBytes = 0) {
  const limit = storageLimitBytes();
  const used = await getTotalMediaBytes();
  const incoming = Math.max(0, Number(additionalBytes) || 0);

  if (used + incoming > limit) {
    const err = new Error(
      `Depolama limiti doldu (${formatGb(used)} / ${formatGb(limit)}). Yeni dosya yüklenemez.`,
    );
    err.statusCode = 507;
    err.code = "STORAGE_LIMIT_EXCEEDED";
    throw err;
  }

  return { used, limit, remaining: limit - used - incoming };
}

module.exports = {
  storageLimitBytes,
  getTotalMediaBytes,
  getStorageQuota,
  assertStorageAvailable,
};
