const {
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
} = require('../repositories/travelPlannerRepository');
const { recordAuditLog } = require('../middleware/auth');

function getDestinations(req, res) {
  const destinations = listDestinations({
    category: req.query?.category,
    region: req.query?.region,
    search: req.query?.search
  });
  return res.json({
    success: true,
    destinations,
    scenic_routes: listScenicRoutes()
  });
}

function getSingleDestination(req, res) {
  const destination = getDestinationBySlugOrId(req.params.slugOrId);
  if (!destination) {
    return res.status(404).json({ success: false, error: 'Destination not found.' });
  }
  return res.json({
    success: true,
    destination
  });
}

function saveDestinationHandler(req, res) {
  if (!req.body?.name) {
    return res.status(400).json({
      success: false,
      error: 'Destination name is required.'
    });
  }
  const destination = upsertDestination(req.body);
  recordAuditLog({
    actorType: 'STAFF',
    actorId: req.staff.id,
    actorIdentifier: req.staff.username,
    action: 'DESTINATION_UPSERTED',
    entityType: 'tourist_destinations',
    entityId: destination.slug,
    ipAddress: req.ip
  });
  return res.status(201).json({
    success: true,
    destination
  });
}

function saveAttractionHandler(req, res) {
  if (!req.body?.destination_id || !req.body?.name) {
    return res.status(400).json({
      success: false,
      error: 'destination_id and attraction name are required.'
    });
  }
  const attraction = upsertAttraction(req.body);
  recordAuditLog({
    actorType: 'STAFF',
    actorId: req.staff.id,
    actorIdentifier: req.staff.username,
    action: 'ATTRACTION_UPSERTED',
    entityType: 'tourist_attractions',
    entityId: attraction.id,
    ipAddress: req.ip
  });
  return res.status(201).json({
    success: true,
    attraction
  });
}

function deleteAttractionHandler(req, res) {
  deleteAttraction(req.params.id);
  recordAuditLog({
    actorType: 'STAFF',
    actorId: req.staff.id,
    actorIdentifier: req.staff.username,
    action: 'ATTRACTION_DELETED',
    entityType: 'tourist_attractions',
    entityId: req.params.id,
    ipAddress: req.ip
  });
  return res.json({
    success: true,
    message: 'Attraction removed.'
  });
}

function saveScenicRouteHandler(req, res) {
  if (!req.body?.name || !req.body?.origin_station_id || !req.body?.destination_station_id) {
    return res.status(400).json({
      success: false,
      error: 'name, origin_station_id, and destination_station_id are required.'
    });
  }
  const route = upsertScenicRoute(req.body);
  recordAuditLog({
    actorType: 'STAFF',
    actorId: req.staff.id,
    actorIdentifier: req.staff.username,
    action: 'SCENIC_ROUTE_UPSERTED',
    entityType: 'scenic_routes',
    entityId: route.slug,
    ipAddress: req.ip
  });
  return res.status(201).json({
    success: true,
    scenic_route: route
  });
}

function getMyItineraries(req, res) {
  return res.json({
    success: true,
    itineraries: listUserItineraries(req.user.id)
  });
}

function getSingleItinerary(req, res) {
  const itinerary = getItineraryById(Number(req.params.id));
  if (!itinerary) {
    return res.status(404).json({ success: false, error: 'Itinerary not found.' });
  }
  if (itinerary.user_id !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: 'Access denied. You can only view your own saved itineraries.'
    });
  }
  return res.json({
    success: true,
    itinerary
  });
}

function createMyItinerary(req, res) {
  if (!req.body?.title) {
    return res.status(400).json({
      success: false,
      error: 'Itinerary title is required.'
    });
  }
  const itinerary = createItinerary(req.user.id, req.body);
  return res.status(201).json({
    success: true,
    itinerary
  });
}

function updateMyItinerary(req, res) {
  const existing = getItineraryById(Number(req.params.id));
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Itinerary not found.' });
  }
  if (existing.user_id !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: 'Access denied. You can only modify your own saved itineraries.'
    });
  }
  const updated = updateItinerary(Number(req.params.id), req.user.id, req.body || {});
  return res.json({
    success: true,
    itinerary: updated
  });
}

function deleteMyItinerary(req, res) {
  const existing = getItineraryById(Number(req.params.id));
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Itinerary not found.' });
  }
  if (existing.user_id !== req.user.id) {
    return res.status(403).json({
      success: false,
      error: 'Access denied. You can only delete your own saved itineraries.'
    });
  }
  deleteItinerary(Number(req.params.id), req.user.id);
  return res.json({
    success: true,
    message: 'Itinerary deleted.'
  });
}

module.exports = {
  getDestinations,
  getSingleDestination,
  saveDestinationHandler,
  saveAttractionHandler,
  deleteAttractionHandler,
  saveScenicRouteHandler,
  getMyItineraries,
  getSingleItinerary,
  createMyItinerary,
  updateMyItinerary,
  deleteMyItinerary
};
