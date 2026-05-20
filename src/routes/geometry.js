const express = require("express");

const router = express.Router();

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const OVERPASS_BASE  = "https://overpass-api.de/api/interpreter";

const HEADERS = {
  "User-Agent": "CevikEmlak/1.0 (cevik-emlak-backend)",
  "Accept-Language": "tr,en",
};

// ─── Nominatim ────────────────────────────────────────────────────────────────

async function nominatimSearch(q) {
  try {
    const url = new URL(NOMINATIM_BASE);
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("polygon_geojson", "1");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("extratags", "1");
    url.searchParams.set("limit", "10");
    url.searchParams.set("countrycodes", "tr");

    const res = await fetch(url.toString(), { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) { console.warn(`[geometry] Nominatim HTTP ${res.status}`); return []; }
    return await res.json();
  } catch (err) {
    console.warn("[geometry] Nominatim hatası:", err.message);
    return [];
  }
}

// ─── Overpass — sadece relation ID ile geometry çek (hızlı) ───────────────────

async function overpassById(osmType, osmId) {
  const type = osmType === "relation" ? "relation" : osmType === "way" ? "way" : "node";
  const query = `[out:json][timeout:20];\n${type}(${osmId});\nout geom;`;

  try {
    const res = await fetch(OVERPASS_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...HEADERS },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(22000),
    });
    if (!res.ok) { console.warn(`[geometry] Overpass HTTP ${res.status}`); return null; }
    const data = await res.json();
    return overpassToGeoJSON(data);
  } catch (err) {
    console.warn("[geometry] Overpass hatası:", err.message);
    return null;
  }
}

// ─── Overpass → GeoJSON dönüşümü ─────────────────────────────────────────────

function overpassToGeoJSON(data) {
  const elements = data.elements || [];

  // Relation
  const rel = elements.find((e) => e.type === "relation" && e.members);
  if (rel) {
    const rings = [];
    for (const m of rel.members) {
      if (m.type === "way" && m.geometry?.length > 1) {
        const coords = m.geometry.map((p) => [p.lon, p.lat]);
        const first = coords[0], last = coords[coords.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
        rings.push([coords]);
      }
    }
    if (rings.length > 0) return { type: "MultiPolygon", coordinates: rings };
  }

  // Way (basit poligon)
  const way = elements.find((e) => e.type === "way" && e.geometry?.length > 1);
  if (way) {
    const coords = way.geometry.map((p) => [p.lon, p.lat]);
    const first = coords[0], last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);
    return { type: "Polygon", coordinates: [coords] };
  }

  return null;
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

// Mahalle tiplerinin OSM'deki Nominatim type/class değerleri
const NEIGHBORHOOD_TYPES = new Set(["suburb", "quarter", "neighbourhood", "village", "hamlet", "residential", "administrative"]);

function normalizeTr(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/İ/g, "i").replace(/I/g, "ı")
    .replace(/Ğ/g, "ğ").replace(/Ü/g, "ü")
    .replace(/Ş/g, "ş").replace(/Ö/g, "ö").replace(/Ç/g, "ç")
    .replace(/\s+/g, " ").trim();
}

/** "Mah." → "Mahallesi", "Köy" → "Köyü" gibi kısaltmaları genişletir */
function expandNeighborhood(name) {
  if (!name) return name;
  return name
    .replace(/\bMah\.\s*$/i, "Mahallesi")
    .replace(/\bMh\.\s*$/i, "Mahallesi")
    .replace(/\bKöy\b(?!ü)/gi, "Köyü")
    .trim();
}

/**
 * Nominatim sonuçlarını strict biçimde filtreler.
 * desiredLevel="8" → sadece admin_level=8 veya mahalle/köy tipi sonuçlar
 * desiredLevel="6" → sadece admin_level=6
 * desiredLevel="4" → sadece admin_level=4
 */
function pickBest(results, cityVal, districtVal, desiredLevel) {
  if (!results?.length) return null;

  const city = normalizeTr(cityVal);
  const dist = normalizeTr(districtVal);

  const candidates = results.filter((r) => {
    const adminLevel = r.extratags?.admin_level ?? "";
    const type       = r.type ?? "";
    if (desiredLevel === "8") {
      return adminLevel === "8" || NEIGHBORHOOD_TYPES.has(type);
    }
    if (desiredLevel === "6") return adminLevel === "6";
    if (desiredLevel === "4") return adminLevel === "4";
    return true;
  });

  if (!candidates.length) return null;

  const scored = candidates.map((r) => {
    const adminLevel = r.extratags?.admin_level ?? "";
    const addrVals   = Object.values(r.address || {}).map(normalizeTr);
    const dispNorm   = normalizeTr(r.display_name || "");

    let score = 0;
    if (adminLevel === desiredLevel)                                                    score += 20;
    if (city && (addrVals.some((v) => v.includes(city)) || dispNorm.includes(city)))   score += 8;
    if (dist && (addrVals.some((v) => v.includes(dist)) || dispNorm.includes(dist)))   score += 5;

    return { r, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.score > 0 ? scored[0].r : null;
}

// ─── Route ────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/geometry?city=Mardin&district=Kızıltepe&neighborhood=Soğanlı Mh.
 * GET /api/v1/geometry?baslik_ful=Mardin, Kızıltepe, Soğanlı Mh.
 */
router.get("/", async (req, res, next) => {
  try {
    const { baslik_ful, city, district, neighborhood } = req.query;

    let cityVal, districtVal, neighborhoodVal, fullName;

    if (baslik_ful) {
      fullName = String(baslik_ful).trim();
      const parts = fullName.split(",").map((s) => s.trim());
      [cityVal, districtVal, neighborhoodVal] = parts;
    } else if (city || district || neighborhood) {
      cityVal         = city         ? String(city).trim()         : null;
      districtVal     = district     ? String(district).trim()     : null;
      neighborhoodVal = neighborhood ? String(neighborhood).trim() : null;
      fullName = [cityVal, districtVal, neighborhoodVal].filter(Boolean).join(", ");
    } else {
      return res.status(400).json({
        message: "Parametre eksik. Kullanım: ?baslik_ful=... veya ?city=...&district=...&neighborhood=...",
      });
    }

    const desiredLevel = neighborhoodVal ? "8" : districtVal ? "6" : "4";
    const targetName   = neighborhoodVal ?? districtVal ?? cityVal;

    // 1) Nominatim ara — önce orijinal isimle, bulamazsa genişletilmiş isimle dene
    const q = [neighborhoodVal, districtVal, cityVal].filter(Boolean).join(", ") + ", Türkiye";
    console.log("[geometry] Nominatim sorgusu:", q);
    let results = await nominatimSearch(q);
    let best = pickBest(results, cityVal, districtVal, desiredLevel);

    if (!best && neighborhoodVal) {
      const expanded = expandNeighborhood(neighborhoodVal);
      if (expanded !== neighborhoodVal) {
        const q2 = [expanded, districtVal, cityVal].filter(Boolean).join(", ") + ", Türkiye";
        console.log("[geometry] Nominatim genişletilmiş sorgu:", q2);
        const results2 = await nominatimSearch(q2);
        best = pickBest(results2, cityVal, districtVal, desiredLevel);
      }
    }

    if (best) {
      console.log(`[geometry] Nominatim buldu: admin_level=${best.extratags?.admin_level} → ${best.display_name}`);

      // Nominatim zaten poligon döndürdüyse direkt kullan
      if (best.geojson) {
        return res.json({
          source: "nominatim",
          baslik: targetName,
          baslik_ful: fullName,
          admin_level: best.extratags?.admin_level ?? null,
          display_name: best.display_name,
          geojson: best.geojson,
          boundingbox: best.boundingbox,
        });
      }

      // Poligon yoksa Overpass'tan ID ile çek (çok hızlı)
      if (best.osm_type && best.osm_id) {
        console.log(`[geometry] Overpass ID sorgusu: ${best.osm_type}(${best.osm_id})`);
        const geojson = await overpassById(best.osm_type, best.osm_id);
        if (geojson) {
          return res.json({
            source: "overpass",
            baslik: targetName,
            baslik_ful: fullName,
            admin_level: best.extratags?.admin_level ?? null,
            display_name: best.display_name,
            geojson,
            boundingbox: best.boundingbox,
          });
        }
      }
    }

    // 2) Nominatim bulamadıysa ilçe bazında fallback
    if (neighborhoodVal && (districtVal || cityVal)) {
      const fallbackQ = [districtVal, cityVal].filter(Boolean).join(", ") + ", Türkiye";
      console.log("[geometry] Fallback sorgusu:", fallbackQ);
      const fbResults = await nominatimSearch(fallbackQ);
      const fbBest = pickBest(fbResults, cityVal, districtVal, "6");
      if (fbBest?.geojson) {
        return res.json({
          source: "nominatim_fallback",
          baslik: districtVal ?? cityVal,
          baslik_ful: fullName,
          admin_level: fbBest.extratags?.admin_level ?? null,
          display_name: fbBest.display_name,
          geojson: fbBest.geojson,
          boundingbox: fbBest.boundingbox,
          note: "Mahalle sınırı bulunamadı, ilçe sınırı döndürüldü",
        });
      }
    }

    return res.status(404).json({ message: "Konum bulunamadı", query: q });
  } catch (error) {
    console.error("[geometry] beklenmeyen hata:", error.message);
    next(error);
  }
});

module.exports = router;
