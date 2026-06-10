const express = require("express");
const Agent = require("../models/Agent");
const { requireAuth } = require("../middleware/auth");
const { reconcileMediaOnUpdate, reconcileMediaOnDelete } = require("../services/mediaReconcile");

const router = express.Router();

function normalizeBody(body) {
  const out = { ...body };
  const first = (out.firstName || "").trim();
  const last  = (out.lastName  || "").trim();
  if (first || last) {
    out.name = [first, last].filter(Boolean).join(" ");
  }
  return out;
}

router.get("/", async (_req, res, next) => {
  try {
    const agents = await Agent.find().sort({ createdAt: -1 });
    res.json({ agents });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireAuth, async (req, res, next) => {
  try {
    const agent = await Agent.create(normalizeBody(req.body));
    res.status(201).json({ agent });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requireAuth, async (req, res, next) => {
  try {
    const old = await Agent.findById(req.params.id).lean();
    const agent = await Agent.findByIdAndUpdate(
      req.params.id,
      normalizeBody(req.body),
      { new: true, runValidators: true },
    );
    if (!agent) return res.status(404).json({ message: "Danışman bulunamadı" });
    await reconcileMediaOnUpdate(old, agent.toObject(), { excludeModel: "Agent", excludeId: agent._id });
    return res.json({ agent });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const old = await Agent.findById(req.params.id).lean();
    if (!old) return res.status(404).end();
    await reconcileMediaOnDelete(old, { excludeModel: "Agent", excludeId: old._id });
    await Agent.findByIdAndDelete(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
