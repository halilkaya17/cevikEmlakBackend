const express = require("express");
const Agent = require("../models/Agent");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

/** Kayıtta tutarlılık: firstName/lastName varsa name'i de doldur */
function normalizeBody(body) {
  const out = { ...body };
  const first = (out.firstName || "").trim();
  const last  = (out.lastName  || "").trim();
  if (first || last) {
    out.name = [first, last].filter(Boolean).join(" ");
  }
  return out;
}

/** GET /api/v1/agents */
router.get("/", async (_req, res, next) => {
  try {
    const agents = await Agent.find().sort({ createdAt: -1 });
    res.json({ agents });
  } catch (error) {
    next(error);
  }
});

/** POST /api/v1/agents */
router.post("/", requireAuth, async (req, res, next) => {
  try {
    const agent = await Agent.create(normalizeBody(req.body));
    res.status(201).json({ agent });
  } catch (error) {
    next(error);
  }
});

/** PUT /api/v1/agents/:id */
router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      normalizeBody(req.body),
      { new: true, runValidators: true },
    );
    if (!agent) return res.status(404).json({ message: "Danışman bulunamadı" });
    return res.json({ agent });
  } catch (error) {
    return next(error);
  }
});

/** DELETE /api/v1/agents/:id */
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    await Agent.findByIdAndDelete(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
