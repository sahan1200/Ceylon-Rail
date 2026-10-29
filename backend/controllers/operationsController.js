const {
  listStations,
  createOrUpdateStation,
  getTrainById,
  searchTrains,
  listFareRules,
  upsertFareRule,
  createOrUpdateTrain
} = require('../repositories/railwayRepository');
const { computeTrainTelemetry, getAllActiveTrainTelemetry } = require('../services/trackingEngine');
const { recordAuditLog } = require('../middleware/auth');

function getStations(req, res) {
  const activeOnly = req.query?.include_inactive !== 'true';
  return res.json({
    success: true,
    stations: listStations({ activeOnly })
  });
}

function saveStation(req, res) {
  if (!req.body?.code || !req.body?.name) {
    return res.status(400).json({
      success: false,
      error: 'Station code and name are required.'
    });
  }
  const station = createOrUpdateStation(req.body);
  recordAuditLog({
    actorType: 'STAFF',
    actorId: req.staff.id,
    actorIdentifier: req.staff.username,
    action: 'STATION_UPSERTED',
    entityType: 'stations',
    entityId: station.code,
    ipAddress: req.ip
  });
  return res.status(201).json({
    success: true,
    station
  });
}

function getTrainsSearch(req, res) {
  const trains = searchTrains({
    fromStation: req.query?.from || req.query?.from_station,
    toStation: req.query?.to || req.query?.to_station,
    travelDate: req.query?.date || req.query?.travel_date,
    travelClass: req.query?.class || req.query?.travel_class,
    timeSlot: req.query?.time_slot || req.query?.timeSlot
  });
  return res.json({
    success: true,
    trains
  });
}

function getSingleTrain(req, res) {
  const train = getTrainById(Number(req.params.id));
  if (!train) {
    return res.status(404).json({ success: false, error: 'Train not found.' });
  }
  return res.json({
    success: true,
    train
  });
}

function saveTrain(req, res) {
  if (!req.body?.train_number || !req.body?.name || !req.body?.origin_station_id || !req.body?.destination_station_id) {
    return res.status(400).json({
      success: false,
      error: 'train_number, name, origin_station_id, and destination_station_id are required.'
    });
  }
  const train = createOrUpdateTrain(req.body);
  recordAuditLog({
    actorType: 'STAFF',
    actorId: req.staff.id,
    actorIdentifier: req.staff.username,
    action: 'TRAIN_UPSERTED',
    entityType: 'trains',
    entityId: train.train_number,
    ipAddress: req.ip
  });
  return res.status(201).json({
    success: true,
    train
  });
}

function getFareRules(req, res) {
  return res.json({
    success: true,
    fare_rules: listFareRules()
  });
}

function saveFareRule(req, res) {
  if (!req.body?.class_name || req.body?.base_fare_cents === undefined || req.body?.per_km_rate_cents === undefined) {
    return res.status(400).json({
      success: false,
      error: 'class_name, base_fare_cents, and per_km_rate_cents are required.'
    });
  }
  const rule = upsertFareRule(req.body);
  recordAuditLog({
    actorType: 'STAFF',
    actorId: req.staff.id,
    actorIdentifier: req.staff.username,
    action: 'FARE_RULE_UPDATED',
    entityType: 'fare_rules',
    entityId: rule.class_name,
    ipAddress: req.ip
  });
  return res.json({
    success: true,
    fare_rule: rule
  });
}

function getLiveTrackingAll(_req, res) {
  const fleet = getAllActiveTrainTelemetry();
  return res.json({
    success: true,
    fleet
  });
}

function getLiveTrackingByTrain(req, res) {
  const telemetry = computeTrainTelemetry(Number(req.params.trainId), req.query?.progress_ratio);
  if (!telemetry) {
    return res.status(404).json({ success: false, error: 'Train tracking data not found.' });
  }
  return res.json({
    success: true,
    telemetry
  });
}

module.exports = {
  getStations,
  saveStation,
  getTrainsSearch,
  getSingleTrain,
  saveTrain,
  getFareRules,
  saveFareRule,
  getLiveTrackingAll,
  getLiveTrackingByTrain
};
