const { dbAll, dbGet, dbRun, withTransaction } = require('../database');

function listDestinations({ category, region, search } = {}) {
  const conditions = ['1 = 1'];
  const params = [];

  if (category && category !== 'ALL') {
    conditions.push('lower(d.category) LIKE lower(?)');
    params.push(`%${category}%`);
  }
  if (region && region !== 'ALL') {
    conditions.push('lower(d.region) LIKE lower(?)');
    params.push(`%${region}%`);
  }
  if (search) {
    conditions.push('(lower(d.name) LIKE lower(?) OR lower(d.summary) LIKE lower(?) OR lower(d.description) LIKE lower(?))');
    const pat = `%${String(search).trim()}%`;
    params.push(pat, pat, pat);
  }

  const destinations = dbAll(
    `SELECT d.*
     FROM tourist_destinations d
     WHERE ${conditions.join(' AND ')}
     ORDER BY d.is_featured DESC, d.id ASC`,
    params
  );

  return destinations.map((d) => enrichDestination(d));
}

function enrichDestination(d) {
  if (!d) return null;
  const attractions = dbAll(
    'SELECT * FROM tourist_attractions WHERE destination_id = ? ORDER BY id ASC',
    [d.id]
  );
  const stationLinks = dbAll(
    `SELECT l.*, s.code AS station_code, s.name AS station_name,
            s.name_si AS station_name_si, s.name_ta AS station_name_ta,
            s.line_name, s.elevation_m
     FROM destination_station_links l
     JOIN stations s ON s.id = l.station_id
     WHERE l.destination_id = ?
     ORDER BY l.is_primary DESC, l.distance_km ASC`,
    [d.id]
  );

  const primaryStationId = stationLinks[0]?.station_id;
  let recommendedTrains = [];
  if (primaryStationId) {
    recommendedTrains = dbAll(
      `SELECT DISTINCT t.id, t.train_number, t.name, t.name_si, t.name_ta, t.type,
              t.departure_time, t.arrival_time, t.route_name,
              rs.arrival_time AS station_arrival_time, rs.departure_time AS station_departure_time
       FROM route_stops rs
       JOIN trains t ON t.id = rs.train_id
       WHERE rs.station_id = ? AND t.is_active = 1
       ORDER BY t.departure_time ASC`,
      [primaryStationId]
    );
  }

  let galleryImages = [];
  try {
    galleryImages = JSON.parse(d.gallery_images_json || '[]');
  } catch (_e) {
    galleryImages = d.hero_image_url ? [d.hero_image_url] : [];
  }

  let suggestedItinerary = [];
  try {
    suggestedItinerary = JSON.parse(d.suggested_itinerary_json || '[]');
  } catch (_e) {
    suggestedItinerary = [];
  }

  return {
    ...d,
    gallery_images: galleryImages,
    suggested_itinerary: suggestedItinerary,
    attractions,
    station_links: stationLinks,
    nearest_station: stationLinks[0] || null,
    recommended_trains: recommendedTrains
  };
}

function getDestinationBySlugOrId(slugOrId) {
  const isNum = /^\d+$/.test(String(slugOrId));
  const row = dbGet(
    `SELECT * FROM tourist_destinations WHERE ${isNum ? 'id = ?' : 'slug = ?'}`,
    [isNum ? Number(slugOrId) : String(slugOrId).trim()]
  );
  return enrichDestination(row);
}

function upsertDestination(payload) {
  return withTransaction(() => {
    const slug = String(
      payload.slug ||
      String(payload.name || 'destination')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
    ).trim();

    const galleryJson = Array.isArray(payload.gallery_images)
      ? JSON.stringify(payload.gallery_images)
      : payload.gallery_images_json || null;
    const suggestedJson = Array.isArray(payload.suggested_itinerary)
      ? JSON.stringify(payload.suggested_itinerary)
      : payload.suggested_itinerary_json || null;

    dbRun(
      `INSERT INTO tourist_destinations (
        slug, name, name_si, name_ta, region, category, summary, description,
        best_season, recommended_days, hero_image_url, gallery_images_json,
        suggested_itinerary_json, lat, lng, is_featured, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(slug) DO UPDATE SET
        name = excluded.name,
        name_si = COALESCE(excluded.name_si, tourist_destinations.name_si),
        name_ta = COALESCE(excluded.name_ta, tourist_destinations.name_ta),
        region = excluded.region,
        category = excluded.category,
        summary = excluded.summary,
        description = excluded.description,
        best_season = COALESCE(excluded.best_season, tourist_destinations.best_season),
        recommended_days = excluded.recommended_days,
        hero_image_url = COALESCE(excluded.hero_image_url, tourist_destinations.hero_image_url),
        gallery_images_json = COALESCE(excluded.gallery_images_json, tourist_destinations.gallery_images_json),
        suggested_itinerary_json = COALESCE(excluded.suggested_itinerary_json, tourist_destinations.suggested_itinerary_json),
        lat = COALESCE(excluded.lat, tourist_destinations.lat),
        lng = COALESCE(excluded.lng, tourist_destinations.lng),
        updated_at = datetime('now')`,
      [
        slug,
        String(payload.name).trim(),
        payload.name_si || null,
        payload.name_ta || null,
        payload.region || 'Central Province',
        payload.category || 'Heritage & Nature',
        payload.summary || String(payload.description || '').slice(0, 160),
        payload.description || payload.summary || '',
        payload.best_season || 'Year-round',
        Number(payload.recommended_days) || 2,
        payload.hero_image_url || '/images/route_highland.jpg',
        galleryJson,
        suggestedJson,
        payload.lat !== undefined ? Number(payload.lat) : null,
        payload.lng !== undefined ? Number(payload.lng) : null,
        payload.is_featured !== undefined ? (payload.is_featured ? 1 : 0) : 1
      ]
    );

    const destRow = dbGet('SELECT id FROM tourist_destinations WHERE slug = ?', [slug]);

    // Link station if provided
    if (payload.station_id || payload.station_code) {
      const stRow = payload.station_id
        ? dbGet('SELECT id, code FROM stations WHERE id = ?', [Number(payload.station_id)])
        : dbGet('SELECT id, code FROM stations WHERE upper(code) = upper(?)', [String(payload.station_code).trim()]);
      if (stRow) {
        dbRun(
          `INSERT INTO destination_station_links (
            destination_id, station_id, distance_km, travel_time_mins,
            transport_mode, estimated_transfer_fare_lkr, notes, is_primary
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
          ON CONFLICT(destination_id, station_id) DO UPDATE SET
            distance_km = excluded.distance_km,
            travel_time_mins = excluded.travel_time_mins,
            transport_mode = excluded.transport_mode,
            estimated_transfer_fare_lkr = excluded.estimated_transfer_fare_lkr`,
          [
            destRow.id,
            stRow.id,
            Number(payload.distance_km) || 1.5,
            Number(payload.travel_time_mins) || 8,
            payload.transport_mode || 'Tuk-Tuk / Walk',
            Number(payload.estimated_transfer_fare_lkr) || 350,
            payload.station_notes || `Direct connection from ${stRow.code}`
          ]
        );
      }
    }

    return getDestinationBySlugOrId(destRow.id);
  });
}

function upsertAttraction(payload) {
  const destId = Number(payload.destination_id);
  if (payload.id) {
    dbRun(
      `UPDATE tourist_attractions
       SET name = COALESCE(?, name),
           category = COALESCE(?, category),
           description = COALESCE(?, description),
           image_url = COALESCE(?, image_url),
           distance_from_station_km = COALESCE(?, distance_from_station_km),
           estimated_visit_mins = COALESCE(?, estimated_visit_mins),
           entry_fee_lkr = COALESCE(?, entry_fee_lkr),
           opening_hours = COALESCE(?, opening_hours)
       WHERE id = ?`,
      [
        payload.name ?? null,
        payload.category ?? null,
        payload.description ?? null,
        payload.image_url ?? null,
        payload.distance_from_station_km !== undefined ? Number(payload.distance_from_station_km) : null,
        payload.estimated_visit_mins !== undefined ? Number(payload.estimated_visit_mins) : null,
        payload.entry_fee_lkr !== undefined ? Number(payload.entry_fee_lkr) : null,
        payload.opening_hours ?? null,
        Number(payload.id)
      ]
    );
    return dbGet('SELECT * FROM tourist_attractions WHERE id = ?', [Number(payload.id)]);
  }

  const res = dbRun(
    `INSERT INTO tourist_attractions (
      destination_id, name, category, description, image_url,
      distance_from_station_km, estimated_visit_mins, entry_fee_lkr, opening_hours
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      destId,
      String(payload.name).trim(),
      payload.category || 'Attraction',
      payload.description || '',
      payload.image_url || '/images/route_highland.jpg',
      Number(payload.distance_from_station_km) || 2.0,
      Number(payload.estimated_visit_mins) || 90,
      Number(payload.entry_fee_lkr) || 0,
      payload.opening_hours || '06:00 - 18:00'
    ]
  );
  return dbGet('SELECT * FROM tourist_attractions WHERE id = ?', [res.lastID]);
}

function deleteAttraction(attractionId) {
  const res = dbRun('DELETE FROM tourist_attractions WHERE id = ?', [Number(attractionId)]);
  return res.changes > 0;
}

function listScenicRoutes() {
  return dbAll(
    `SELECT sr.*,
            so.code AS origin_code, so.name AS origin_name,
            sd.code AS dest_code, sd.name AS dest_name
     FROM scenic_routes sr
     JOIN stations so ON so.id = sr.origin_station_id
     JOIN stations sd ON sd.id = sr.destination_station_id
     ORDER BY sr.id ASC`
  ).map((r) => ({
    ...r,
    highlights: (() => {
      try { return JSON.parse(r.highlights_json || '[]'); } catch (_e) { return []; }
    })()
  }));
}

function upsertScenicRoute(payload) {
  const slug = String(
    payload.slug ||
    String(payload.name || 'scenic-route')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  ).trim();

  const highlightsJson = Array.isArray(payload.highlights)
    ? JSON.stringify(payload.highlights)
    : payload.highlights_json || '[]';

  dbRun(
    `INSERT INTO scenic_routes (
      slug, name, origin_station_id, destination_station_id, distance_km,
      duration_mins, max_elevation_m, description, highlights_json, image_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      origin_station_id = excluded.origin_station_id,
      destination_station_id = excluded.destination_station_id,
      distance_km = excluded.distance_km,
      duration_mins = excluded.duration_mins,
      max_elevation_m = excluded.max_elevation_m,
      description = excluded.description,
      highlights_json = excluded.highlights_json,
      image_url = excluded.image_url`,
    [
      slug,
      String(payload.name).trim(),
      Number(payload.origin_station_id),
      Number(payload.destination_station_id),
      Number(payload.distance_km) || 100,
      Number(payload.duration_mins) || 180,
      Number(payload.max_elevation_m) || 500,
      payload.description || '',
      highlightsJson,
      payload.image_url || '/images/route_highland.jpg'
    ]
  );

  return dbGet('SELECT * FROM scenic_routes WHERE slug = ?', [slug]);
}

function listUserItineraries(userId) {
  const rows = dbAll(
    'SELECT * FROM saved_itineraries WHERE user_id = ? ORDER BY updated_at DESC, id DESC',
    [userId]
  );
  return rows.map((it) => getItineraryById(it.id, userId));
}

function getItineraryById(itineraryId, userId = null) {
  const query = userId
    ? 'SELECT * FROM saved_itineraries WHERE id = ? AND user_id = ?'
    : 'SELECT * FROM saved_itineraries WHERE id = ?';
  const params = userId ? [itineraryId, userId] : [itineraryId];
  const itinerary = dbGet(query, params);
  if (!itinerary) return null;

  const days = dbAll(
    `SELECT d.*, td.name AS destination_name, td.slug AS destination_slug
     FROM itinerary_days d
     LEFT JOIN tourist_destinations td ON td.id = d.destination_id
     WHERE d.itinerary_id = ?
     ORDER BY d.day_number ASC`,
    [itinerary.id]
  );

  for (const day of days) {
    day.items = dbAll(
      `SELECT i.*,
              t.train_number, t.name AS train_name,
              sf.code AS from_station_code, sf.name AS from_station_name,
              st.code AS to_station_code, st.name AS to_station_name,
              ta.name AS attraction_name
       FROM itinerary_items i
       LEFT JOIN trains t ON t.id = i.train_id
       LEFT JOIN stations sf ON sf.id = i.from_station_id
       LEFT JOIN stations st ON st.id = i.to_station_id
       LEFT JOIN tourist_attractions ta ON ta.id = i.attraction_id
       WHERE i.itinerary_day_id = ?
       ORDER BY i.item_order ASC, i.id ASC`,
      [day.id]
    );
  }

  return { ...itinerary, days };
}

function createItinerary(userId, payload) {
  return withTransaction(() => {
    const daysInput = Array.isArray(payload.days) && payload.days.length > 0
      ? payload.days
      : [{ day_number: 1, title: 'Day 1 — Railway Journey & Exploration', items: [] }];

    let totalEstimatedBudgetCents = 0;
    const res = dbRun(
      `INSERT INTO saved_itineraries (
        user_id, title, start_date, end_date, total_days, companion_type,
        estimated_budget_cents, notes, is_public
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        userId || null,
        String(payload.title || 'My Sri Lanka Rail Itinerary').trim(),
        payload.start_date || null,
        payload.end_date || null,
        daysInput.length,
        payload.companion_type || 'SOLO',
        payload.notes || null,
        payload.is_public ? 1 : 0
      ]
    );
    const itineraryId = res.lastID;

    daysInput.forEach((dayObj, dIdx) => {
      const dayNumber = Number(dayObj.day_number) || dIdx + 1;
      const dayRes = dbRun(
        `INSERT INTO itinerary_days (itinerary_id, day_number, travel_date, title, destination_id, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          itineraryId,
          dayNumber,
          dayObj.travel_date || null,
          dayObj.title || `Day ${dayNumber}`,
          dayObj.destination_id ? Number(dayObj.destination_id) : null,
          dayObj.notes || null
        ]
      );
      const dayId = dayRes.lastID;

      const items = Array.isArray(dayObj.items) ? dayObj.items : [];
      items.forEach((item, iIdx) => {
        const costCents = item.estimated_cost_cents !== undefined
          ? Number(item.estimated_cost_cents)
          : Math.round(Number(item.estimated_cost_lkr || 0) * 100);
        totalEstimatedBudgetCents += costCents;

        dbRun(
          `INSERT INTO itinerary_items (
            itinerary_day_id, item_order, item_type, title,
            train_id, from_station_id, to_station_id, attraction_id,
            start_time, end_time, estimated_cost_cents, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            dayId,
            iIdx + 1,
            item.item_type || 'ATTRACTION',
            item.title || 'Scheduled Activity',
            item.train_id ? Number(item.train_id) : null,
            item.from_station_id ? Number(item.from_station_id) : null,
            item.to_station_id ? Number(item.to_station_id) : null,
            item.attraction_id ? Number(item.attraction_id) : null,
            item.start_time || null,
            item.end_time || null,
            costCents,
            item.notes || null
          ]
        );
      });
    });

    if (payload.estimated_budget_cents !== undefined) {
      totalEstimatedBudgetCents = Number(payload.estimated_budget_cents);
    } else if (payload.estimated_budget_lkr !== undefined) {
      totalEstimatedBudgetCents = Math.round(Number(payload.estimated_budget_lkr) * 100);
    }

    dbRun(
      `UPDATE saved_itineraries SET estimated_budget_cents = ?, updated_at = datetime('now') WHERE id = ?`,
      [totalEstimatedBudgetCents, itineraryId]
    );

    return getItineraryById(itineraryId, userId);
  });
}

function updateItinerary(itineraryId, userId, payload) {
  return withTransaction(() => {
    const existing = getItineraryById(itineraryId, userId);
    if (!existing) return null;

    dbRun(
      `UPDATE saved_itineraries
       SET title = COALESCE(?, title),
           start_date = COALESCE(?, start_date),
           end_date = COALESCE(?, end_date),
           companion_type = COALESCE(?, companion_type),
           notes = COALESCE(?, notes),
           updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      [
        payload.title ?? null,
        payload.start_date ?? null,
        payload.end_date ?? null,
        payload.companion_type ?? null,
        payload.notes ?? null,
        itineraryId,
        userId
      ]
    );

    if (Array.isArray(payload.days)) {
      dbRun('DELETE FROM itinerary_days WHERE itinerary_id = ?', [itineraryId]);
      let totalCostCents = 0;
      payload.days.forEach((dayObj, dIdx) => {
        const dayNum = Number(dayObj.day_number) || dIdx + 1;
        const dRes = dbRun(
          `INSERT INTO itinerary_days (itinerary_id, day_number, travel_date, title, destination_id, notes)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            itineraryId,
            dayNum,
            dayObj.travel_date || null,
            dayObj.title || `Day ${dayNum}`,
            dayObj.destination_id ? Number(dayObj.destination_id) : null,
            dayObj.notes || null
          ]
        );
        const items = Array.isArray(dayObj.items) ? dayObj.items : [];
        items.forEach((item, iIdx) => {
          const costCents = item.estimated_cost_cents !== undefined
            ? Number(item.estimated_cost_cents)
            : Math.round(Number(item.estimated_cost_lkr || 0) * 100);
          totalCostCents += costCents;
          dbRun(
            `INSERT INTO itinerary_items (
              itinerary_day_id, item_order, item_type, title,
              train_id, from_station_id, to_station_id, attraction_id,
              start_time, end_time, estimated_cost_cents, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              dRes.lastID,
              iIdx + 1,
              item.item_type || 'ATTRACTION',
              item.title || 'Activity',
              item.train_id ? Number(item.train_id) : null,
              item.from_station_id ? Number(item.from_station_id) : null,
              item.to_station_id ? Number(item.to_station_id) : null,
              item.attraction_id ? Number(item.attraction_id) : null,
              item.start_time || null,
              item.end_time || null,
              costCents,
              item.notes || null
            ]
          );
        });
      });
      dbRun(
        `UPDATE saved_itineraries SET total_days = ?, estimated_budget_cents = ?, updated_at = datetime('now') WHERE id = ?`,
        [payload.days.length, totalCostCents, itineraryId]
      );
    }

    return getItineraryById(itineraryId, userId);
  });
}

function deleteItinerary(itineraryId, userId) {
  const res = dbRun(
    'DELETE FROM saved_itineraries WHERE id = ? AND user_id = ?',
    [itineraryId, userId]
  );
  return res.changes > 0;
}

module.exports = {
  listDestinations,
  getDestinationBySlugOrId,
  upsertDestination,
  upsertAttraction,
  deleteAttraction,
  listScenicRoutes,
  upsertScenicRoute,
  listUserItineraries,
  getItineraryById,
  createItinerary,
  updateItinerary,
  deleteItinerary
};
