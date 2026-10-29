const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const env = require('./config/env');
const { hashPassword } = require('./utils/cryptoUtils');

let activeDbPath = env.DATABASE_PATH;
let sqlJsDb = null;
let inTransaction = false;
let transactionDepth = 0;

function getDbPath() {
  return activeDbPath;
}

function setDbPath(customPath) {
  activeDbPath = customPath;
}

/**
 * Create a timestamped backup of the database file before applying migrations.
 */
function createDatabaseBackup(targetPath = activeDbPath) {
  if (!fs.existsSync(targetPath)) return null;
  const stat = fs.statSync(targetPath);
  if (stat.size === 0) return null;

  const backupDir = env.DB_BACKUP_DIR;
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `ceylon_rail_backup_${ts}.db`);
  fs.copyFileSync(targetPath, backupFile);
  return backupFile;
}

function saveSqlJsDatabase() {
  if (!sqlJsDb) return;
  const data = sqlJsDb.export();
  sqlJsDb.run("PRAGMA foreign_keys = ON;");
  const dir = path.dirname(activeDbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(activeDbPath, Buffer.from(data));
}

function execScript(sqlScript) {
  if (sqlJsDb) {
    sqlJsDb.run('PRAGMA foreign_keys = ON;');
    sqlJsDb.run(sqlScript);
    if (!inTransaction) saveSqlJsDatabase();
    return true;
  }
  throw new Error('Database not initialized.');
}

function dbAll(sql, params = []) {
  if (sqlJsDb) {
    const stmt = sqlJsDb.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }
  throw new Error('Database not initialized.');
}

function dbGet(sql, params = []) {
  if (sqlJsDb) {
    const rows = dbAll(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }
  throw new Error('Database not initialized.');
}

function dbRun(sql, params = []) {
  if (sqlJsDb) {
    sqlJsDb.run(sql, params);
    const lastIdRow = dbAll('SELECT last_insert_rowid() as id');
    const changesRow = dbAll('SELECT changes() as changes');
    if (!inTransaction) saveSqlJsDatabase();
    return {
      lastID: lastIdRow[0]?.id,
      changes: changesRow[0]?.changes || 0
    };
  }
  throw new Error('Database not initialized.');
}

function withTransaction(fn) {
  if (transactionDepth > 0) {
    const sp = `sp_${transactionDepth}`;
    transactionDepth++;
    dbRun(`SAVEPOINT ${sp}`);
    try {
      const result = fn();
      dbRun(`RELEASE SAVEPOINT ${sp}`);
      transactionDepth--;
      return result;
    } catch (err) {
      try { dbRun(`ROLLBACK TO SAVEPOINT ${sp}`); } catch (_e) {}
      transactionDepth--;
      throw err;
    }
  }

  inTransaction = true;
  transactionDepth = 1;
  dbRun('BEGIN IMMEDIATE TRANSACTION');
  try {
    const result = fn();
    dbRun('COMMIT');
    inTransaction = false;
    transactionDepth = 0;
    if (sqlJsDb) saveSqlJsDatabase();
    return result;
  } catch (err) {
    try { dbRun('ROLLBACK'); } catch (_e) {}
    inTransaction = false;
    transactionDepth = 0;
    throw err;
  }
}

function reconcileLegacyColumns() {
  const safeAddColumn = (table, colDef) => {
    try {
      dbRun(`ALTER TABLE ${table} ADD COLUMN ${colDef}`);
    } catch (_e) {
      // Column already exists
    }
  };

  safeAddColumn('stations', 'name_si TEXT');
  safeAddColumn('stations', 'name_ta TEXT');
  safeAddColumn('stations', 'facilities_json TEXT DEFAULT \'["Ticket Counter","Waiting Hall","Restrooms"]\'');
  safeAddColumn('stations', 'is_active INTEGER NOT NULL DEFAULT 1');

  safeAddColumn('trains', 'name_si TEXT');
  safeAddColumn('trains', 'name_ta TEXT');
  safeAddColumn('trains', 'has_gps_hardware INTEGER NOT NULL DEFAULT 0');
  safeAddColumn('trains', 'is_active INTEGER NOT NULL DEFAULT 1');

  safeAddColumn('carriages', 'total_rows INTEGER NOT NULL DEFAULT 10');
  safeAddColumn('carriages', 'seats_per_row INTEGER NOT NULL DEFAULT 4');
  safeAddColumn('carriages', 'has_air_conditioning INTEGER NOT NULL DEFAULT 0');
  safeAddColumn('carriages', 'has_observation_glass INTEGER NOT NULL DEFAULT 0');

  safeAddColumn('users', 'preferred_language TEXT NOT NULL DEFAULT \'EN\'');
  safeAddColumn('users', 'is_active INTEGER NOT NULL DEFAULT 1');
  safeAddColumn('users', 'updated_at TEXT NOT NULL DEFAULT (datetime(\'now\'))');

  safeAddColumn('bookings', 'is_guest_booking INTEGER NOT NULL DEFAULT 0');
  safeAddColumn('bookings', 'booking_lookup_token TEXT');
  safeAddColumn('bookings', 'schedule_id INTEGER');
  safeAddColumn('bookings', 'distance_km REAL NOT NULL DEFAULT 0');
  safeAddColumn('bookings', 'subtotal_cents INTEGER NOT NULL DEFAULT 0');
  safeAddColumn('bookings', 'reservation_fee_cents INTEGER NOT NULL DEFAULT 0');
  safeAddColumn('bookings', 'tax_cents INTEGER NOT NULL DEFAULT 0');
  safeAddColumn('bookings', 'total_amount_cents INTEGER NOT NULL DEFAULT 0');
  safeAddColumn('bookings', 'payment_status TEXT NOT NULL DEFAULT \'UNPAID\'');
  safeAddColumn('bookings', 'contact_phone TEXT');
  safeAddColumn('bookings', 'contact_email TEXT');
  safeAddColumn('bookings', 'updated_at TEXT NOT NULL DEFAULT (datetime(\'now\'))');

  safeAddColumn('seat_reservations', 'seat_id INTEGER');
  safeAddColumn('seat_reservations', 'from_stop_order INTEGER NOT NULL DEFAULT 1');
  safeAddColumn('seat_reservations', 'to_stop_order INTEGER NOT NULL DEFAULT 99');
  safeAddColumn('seat_reservations', 'updated_at TEXT NOT NULL DEFAULT (datetime(\'now\'))');

  safeAddColumn('tourist_destinations', 'gallery_images_json TEXT');
  safeAddColumn('tourist_destinations', 'suggested_itinerary_json TEXT');
  safeAddColumn('tourist_attractions', 'image_url TEXT');

  safeAddColumn('complaints', 'guest_name TEXT');
  safeAddColumn('complaints', 'guest_email TEXT');
  safeAddColumn('complaints', 'guest_phone TEXT');
  safeAddColumn('complaints', 'booking_pnr TEXT');
  safeAddColumn('feedback_submissions', 'guest_name TEXT');
}

function resolveMigrationFile(fileName) {
  const candidates = [
    path.join(env.PROJECT_ROOT, 'database', 'migrations', fileName),
    path.join(env.PROJECT_ROOT, 'database', fileName === '001_complete_schema.sql' ? 'schema.sql' : fileName),
    path.join(__dirname, 'migrations', fileName)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Migration file ${fileName} not found in database/migrations/ or backend/migrations/.`);
}

function runMigrations() {
  const migrationPath = resolveMigrationFile('001_complete_schema.sql');
  const sqlContent = fs.readFileSync(migrationPath, 'utf8');
  const checksum = crypto.createHash('sha256').update(sqlContent).digest('hex');

  execScript(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const existing = dbGet('SELECT * FROM schema_migrations WHERE version = ?', ['001_complete_schema']);
  if (!existing) {
    createDatabaseBackup(activeDbPath);
  }

  execScript(sqlContent);
  reconcileLegacyColumns();

  if (!existing) {
    dbRun(
      'INSERT INTO schema_migrations (version, description, checksum) VALUES (?, ?, ?)',
      ['001_complete_schema', 'Normalized 35-table Ceylon Rail relational schema (Guest + Staff + Planner)', checksum]
    );
  }
}

function rollbackMigration(version = '001') {
  const rollbackFile = resolveMigrationFile(`${version}_rollback.sql`);
  createDatabaseBackup(activeDbPath);
  const sql = fs.readFileSync(rollbackFile, 'utf8');
  execScript(sql);
}

/**
 * Seed required roles, permissions, initial SUPER_ADMIN account (admin / 1234),
 * legacy SUPER_ADMIN account (RDSD RATHNAYAKA), and verified Sri Lankan railway
 * operational & travel planner reference data using the user's supplied images.
 */
function seedReferenceData() {
  withTransaction(() => {
    // 1. Seed Roles & Permissions
    const rolesData = [
      ['SUPER_ADMIN', 'Super Administrator', 'Full unrestricted access to all railway, staff, financial, and system modules'],
      ['ADMIN', 'Railway Administrator', 'Manage railway operations, schedules, bookings, complaints, travel planner, and staff'],
      ['FINANCE_STAFF', 'Finance Officer', 'Record operating expenses, view payments/refunds, and generate financial reports'],
      ['COMPLAINT_OFFICER', 'Complaint Resolution Officer', 'Review, assign, investigate, and respond to passenger complaints and feedback'],
      ['STATION_STAFF', 'Station Operations Officer', 'Verify tickets/QR codes, view train schedules, and inspect station manifests']
    ];
    for (const [code, name, desc] of rolesData) {
      dbRun(
        `INSERT INTO roles (code, name, description) VALUES (?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET name = excluded.name, description = excluded.description`,
        [code, name, desc]
      );
    }

    const permissionsData = [
      ['manage_staff', 'Create, update, activate/deactivate staff accounts and assign roles'],
      ['manage_operations', 'Manage stations, trains, schedules, route stops, carriages, seats, and fare rules'],
      ['manage_bookings', 'Inspect bookings, verify QR tickets, and process administrative cancellations/refunds'],
      ['manage_complaints', 'Assign complaints, update statuses, and write internal or passenger-visible responses'],
      ['manage_finance', 'Create/update operating expenses and generate financial reports'],
      ['view_audit_logs', 'Inspect security and operational audit logs'],
      ['manage_travel_planner', 'Manage tourist destinations, attractions, scenic routes, and station links']
    ];
    for (const [code, desc] of permissionsData) {
      dbRun(
        `INSERT INTO permissions (code, description) VALUES (?, ?)
         ON CONFLICT(code) DO UPDATE SET description = excluded.description`,
        [code, desc]
      );
    }

    const rolePermMap = {
      SUPER_ADMIN: ['manage_staff', 'manage_operations', 'manage_bookings', 'manage_complaints', 'manage_finance', 'view_audit_logs', 'manage_travel_planner'],
      ADMIN: ['manage_operations', 'manage_bookings', 'manage_complaints', 'view_audit_logs', 'manage_travel_planner'],
      FINANCE_STAFF: ['manage_finance', 'manage_bookings'],
      COMPLAINT_OFFICER: ['manage_complaints', 'manage_bookings'],
      STATION_STAFF: ['manage_bookings']
    };

    for (const [roleCode, permCodes] of Object.entries(rolePermMap)) {
      const roleRow = dbGet('SELECT id FROM roles WHERE code = ?', [roleCode]);
      if (!roleRow) continue;
      for (const permCode of permCodes) {
        const permRow = dbGet('SELECT id FROM permissions WHERE code = ?', [permCode]);
        if (!permRow) continue;
        dbRun(
          'INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
          [roleRow.id, permRow.id]
        );
      }
    }

    // 2. Seed Initial Administrator Accounts Idempotently
    // Default administrator account
    // Never resets password once created.
    const superAdminRole = dbGet('SELECT id FROM roles WHERE code = ?', ['SUPER_ADMIN']);
    const primaryAdminUsername = env.INITIAL_ADMIN_USERNAME || 'admin';
    const existingPrimaryAdmin = dbGet('SELECT * FROM staff_users WHERE lower(username) = lower(?)', [primaryAdminUsername]);

    if (!existingPrimaryAdmin) {
      const initialHash = hashPassword(env.INITIAL_ADMIN_PASSWORD || '1234');
      const res = dbRun(
        `INSERT INTO staff_users (
          username, email, full_name, password_hash, role_id, employee_code,
          department, is_active, must_change_password
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
        [
          primaryAdminUsername,
          env.INITIAL_ADMIN_EMAIL || 'admin@railway.gov.lk',
          env.INITIAL_ADMIN_FULL_NAME || 'System Administrator',
          initialHash,
          superAdminRole.id,
          'SLR-ADM-0001',
          'Executive Railway Administration'
        ]
      );
      dbRun(
        `INSERT INTO audit_logs (actor_type, actor_id, actor_identifier, action, entity_type, entity_id, details_json)
         VALUES ('SYSTEM', ?, ?, 'INITIAL_ADMIN_PROVISIONED', 'staff_users', ?, ?)`,
        [
          res.lastID,
          primaryAdminUsername,
          String(res.lastID),
          JSON.stringify({ role: 'SUPER_ADMIN', username: primaryAdminUsername })
        ]
      );
    } else {
      dbRun(
        `UPDATE staff_users SET role_id = ?, is_active = 1, updated_at = datetime('now') WHERE id = ?`,
        [superAdminRole.id, existingPrimaryAdmin.id]
      );
    }

    // Also preserve legacy administrator account (RDSD RATHNAYAKA) if not yet present
    const legacyAdminUsername = env.LEGACY_ADMIN_USERNAME || 'RDSD RATHNAYAKA';
    if (legacyAdminUsername.toLowerCase() !== primaryAdminUsername.toLowerCase()) {
      const existingLegacyAdmin = dbGet('SELECT * FROM staff_users WHERE lower(username) = lower(?)', [legacyAdminUsername]);
      if (!existingLegacyAdmin) {
        const legacyHash = hashPassword(env.LEGACY_ADMIN_PASSWORD || 'Sahan1550@');
        dbRun(
          `INSERT INTO staff_users (
            username, email, full_name, password_hash, role_id, employee_code,
            department, is_active, must_change_password
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1)`,
          [
            legacyAdminUsername,
            env.LEGACY_ADMIN_EMAIL || 'rdsd.rathnayaka@railway.gov.lk',
            legacyAdminUsername,
            legacyHash,
            superAdminRole.id,
            'SLR-ADM-0002',
            'Executive Railway Administration'
          ]
        );
      }
    }

    // 3. Seed Sri Lankan Railway Stations (with Sinhala & Tamil translations)
    const stationsData = [
      ['FOT', 'Colombo Fort', 'කොළඹ කොටුව', 'கொழும்பு கோட்டை', 'Main Line', 'Western', 7.0, 0.0, 6.9344, 79.8501],
      ['MDA', 'Maradana', 'මරදාන', 'மருதானை', 'Main Line', 'Western', 8.0, 1.9, 6.9291, 79.8659],
      ['RAG', 'Ragama', 'රාගම', 'ராகமை', 'Main Line', 'Western', 11.0, 14.8, 7.0304, 79.9219],
      ['GQ', 'Gampaha', 'ගම්පහ', 'கம்பஹா', 'Main Line', 'Western', 18.0, 26.7, 7.0917, 79.9947],
      ['VEY', 'Veyangoda', 'වේයන්ගොඩ', 'வேயங்கொடை', 'Main Line', 'Western', 24.0, 36.8, 7.1559, 80.0575],
      ['PLG', 'Polgahawela', 'පොල්ගහවෙල', 'பொல்கஹவெல', 'Main Line', 'North Western', 74.0, 73.1, 7.3323, 80.3015],
      ['KDT', 'Peradeniya Junction', 'පේරාදෙණිය හන්දිය', 'பேராதனை சந்தி', 'Main Line', 'Central', 476.0, 114.8, 7.2625, 80.5922],
      ['KDY', 'Kandy', 'මහනුවර', 'கண்டி', 'Main Line', 'Central', 500.0, 120.9, 7.2896, 80.6327],
      ['NVP', 'Nawalapitiya', 'නාවලපිටිය', 'நாவலப்பிட்டி', 'Main Line', 'Central', 583.0, 140.2, 7.0543, 80.5338],
      ['HTN', 'Hatton', 'හැටන්', 'ஹட்டன்', 'Main Line', 'Central', 1262.0, 173.9, 6.8916, 80.5955],
      ['NNO', 'Nanu Oya (Nuwara Eliya)', 'නානුඔය (නුවරඑළිය)', 'நானுஓயா (நுவரெலியா)', 'Main Line', 'Central', 1613.0, 206.6, 6.9390, 80.7418],
      ['PTH', 'Pattipola', 'පට්ටිපොළ', 'பட்டிப்பொல', 'Main Line', 'Central', 1897.5, 223.9, 6.8511, 80.8312],
      ['HPT', 'Haputale', 'හපුතලේ', 'ஹப்புத்தளை', 'Main Line', 'Uva', 1479.0, 246.7, 6.7681, 80.9585],
      ['DLA', 'Demodara (Nine Arch)', 'දෙමෝදර (ආරුක්කු නවය)', 'தெமோதரை', 'Main Line', 'Uva', 912.0, 277.6, 6.8780, 81.0592],
      ['ELL', 'Ella', 'ඇල්ල', 'எல்ல', 'Main Line', 'Uva', 1041.0, 271.6, 6.8748, 81.0476],
      ['BAD', 'Badulla', 'බදුල්ල', 'பதுளை', 'Main Line', 'Uva', 652.0, 292.3, 6.9897, 81.0560],
      ['KLT', 'Kalutara South', 'කළුතර දකුණ', 'களுத்துறை தெற்கு', 'Coastal Line', 'Western', 5.0, 43.2, 6.5828, 79.9607],
      ['ALT', 'Aluthgama (Bentota)', 'අලුත්ගම (බෙන්තොට)', 'அளுத்கமை', 'Coastal Line', 'Western', 6.0, 61.3, 6.4328, 80.0012],
      ['HKD', 'Hikkaduwa', 'හික්කඩුව', 'ஹிக்கடுவை', 'Coastal Line', 'Southern', 6.0, 96.8, 6.1395, 80.1036],
      ['GLE', 'Galle', 'ගාල්ල', 'காலி', 'Coastal Line', 'Southern', 5.0, 115.6, 6.0328, 80.2149],
      ['MTR', 'Matara', 'මාතර', 'மாத்தறை', 'Coastal Line', 'Southern', 6.0, 158.8, 5.9515, 80.5484],
      ['BLT', 'Beliatta', 'බෙලිඅත්ත', 'பெலியத்தை', 'Coastal Line', 'Southern', 14.0, 185.5, 6.0431, 80.7356],
      ['KUR', 'Kurunegala', 'කුරුණෑගල', 'குருநாகல்', 'Northern Line', 'North Western', 116.0, 94.6, 7.4729, 80.3547],
      ['HBO', 'Habarana', 'හබරණ', 'ஹபரணை', 'Eastern Line', 'North Central', 173.0, 173.2, 8.0362, 80.7516],
      ['PLN', 'Polonnaruwa', 'පොළොන්නරුව', 'பொலன்னறுவை', 'Eastern Line', 'North Central', 53.0, 226.4, 7.9403, 81.0188],
      ['ANP', 'Anuradhapura', 'අනුරාධපුරය', 'அனுராதபுரம்', 'Northern Line', 'North Central', 89.0, 205.6, 8.3248, 80.4140],
      ['VNA', 'Vavuniya', 'වවුනියාව', 'வவுனியா', 'Northern Line', 'Northern', 98.0, 254.1, 8.7542, 80.4982],
      ['KKS', 'Jaffna', 'යාපනය', 'யாழ்ப்பாணம்', 'Northern Line', 'Northern', 5.0, 398.2, 9.6647, 80.0209]
    ];

    for (const [code, name, nameSi, nameTa, lineName, province, elev, dist, lat, lng] of stationsData) {
      dbRun(
        `INSERT INTO stations (
          code, name, name_si, name_ta, line_name, province, elevation_m, distance_from_fort_km, lat, lng, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(code) DO UPDATE SET
          name = excluded.name,
          name_si = excluded.name_si,
          name_ta = excluded.name_ta,
          line_name = excluded.line_name,
          province = excluded.province,
          elevation_m = excluded.elevation_m,
          distance_from_fort_km = excluded.distance_from_fort_km,
          lat = excluded.lat,
          lng = excluded.lng`,
        [code, name, nameSi, nameTa, lineName, province, elev, dist, lat, lng]
      );
    }

    const getStationId = (code) => {
      const row = dbGet('SELECT id FROM stations WHERE code = ?', [code]);
      return row ? row.id : null;
    };

    // 4. Seed Trains, Schedules, Operating Days, and Ordered Route Stops
    const trainsData = [
      {
        train_number: '1005',
        name: 'Podi Menike',
        name_si: 'පොඩි මැණිකේ',
        name_ta: 'பொடி மெனிக்கே',
        type: 'Intercity Express',
        route_name: 'Main Line (Colombo Fort - Badulla)',
        origin_code: 'FOT',
        dest_code: 'BAD',
        departure_time: '05:55',
        arrival_time: '16:10',
        duration_mins: 615,
        frequency: 'Daily',
        classes_available: '1st Class Observation,1st Class Air Conditioned,2nd Class Reserved,3rd Class Reserved',
        base_speed_kmh: 44,
        stops: [
          ['FOT', 1, '05:55', '05:55', 0, '01', 0.0, 0],
          ['RAG', 2, '06:18', '06:20', 2, '02', 14.8, 23],
          ['GQ', 3, '06:34', '06:36', 2, '01', 26.7, 39],
          ['VEY', 4, '06:49', '06:51', 2, '01', 36.8, 54],
          ['PLG', 5, '07:35', '07:40', 5, '01', 73.1, 100],
          ['KDT', 6, '08:52', '08:55', 3, '01', 114.8, 177],
          ['KDY', 7, '09:08', '09:18', 10, '01', 120.9, 193],
          ['NVP', 8, '10:05', '10:10', 5, '01', 140.2, 250],
          ['HTN', 9, '11:25', '11:30', 5, '01', 173.9, 330],
          ['NNO', 10, '12:40', '12:48', 8, '01', 206.6, 405],
          ['PTH', 11, '13:30', '13:32', 2, '01', 223.9, 455],
          ['HPT', 12, '14:15', '14:20', 5, '01', 246.7, 500],
          ['ELL', 13, '15:14', '15:18', 4, '01', 271.6, 559],
          ['DLA', 14, '15:32', '15:36', 4, '01', 277.6, 577],
          ['BAD', 15, '16:10', '16:10', 0, '01', 292.3, 615]
        ]
      },
      {
        train_number: '1015',
        name: 'Udarata Menike',
        name_si: 'උඩරට මැණිකේ',
        name_ta: 'உடரட்ட மெனிக்கே',
        type: 'Hill Country Express',
        route_name: 'Main Line (Colombo Fort - Badulla)',
        origin_code: 'FOT',
        dest_code: 'BAD',
        departure_time: '08:30',
        arrival_time: '18:25',
        duration_mins: 595,
        frequency: 'Daily',
        classes_available: '1st Class Observation,1st Class Air Conditioned,2nd Class Reserved,3rd Class Reserved',
        base_speed_kmh: 46,
        stops: [
          ['FOT', 1, '08:30', '08:30', 0, '02', 0.0, 0],
          ['RAG', 2, '08:52', '08:54', 2, '02', 14.8, 22],
          ['GQ', 3, '09:08', '09:10', 2, '02', 26.7, 38],
          ['PLG', 4, '10:02', '10:06', 4, '01', 73.1, 92],
          ['KDT', 5, '11:18', '11:22', 4, '01', 114.8, 168],
          ['KDY', 6, '11:34', '11:45', 11, '01', 120.9, 184],
          ['HTN', 7, '13:55', '14:00', 5, '01', 173.9, 325],
          ['NNO', 8, '15:10', '15:18', 8, '01', 206.6, 400],
          ['HPT', 9, '16:40', '16:44', 4, '01', 246.7, 490],
          ['ELL', 10, '17:35', '17:40', 5, '01', 271.6, 545],
          ['BAD', 11, '18:25', '18:25', 0, '01', 292.3, 595]
        ]
      },
      {
        train_number: '1045',
        name: 'Ella Odyssey',
        name_si: 'ඇල්ල ඔඩිසි',
        name_ta: 'எல்ல ஒடிசி',
        type: 'Luxury Tourist Express',
        route_name: 'Scenic Highland Line (Kandy - Ella - Badulla)',
        origin_code: 'KDY',
        dest_code: 'BAD',
        departure_time: '07:00',
        arrival_time: '14:20',
        duration_mins: 440,
        frequency: 'Daily',
        classes_available: '1st Class Observation,1st Class Air Conditioned,2nd Class Reserved,3rd Class Reserved',
        base_speed_kmh: 40,
        stops: [
          ['FOT', 1, '05:30', '05:30', 0, '03', 0.0, 0],
          ['KDT', 2, '06:45', '06:50', 5, '01', 114.8, 75],
          ['KDY', 3, '07:00', '07:10', 10, '01', 120.9, 90],
          ['NVP', 4, '08:05', '08:10', 5, '01', 140.2, 155],
          ['HTN', 5, '09:30', '09:38', 8, '01', 173.9, 240],
          ['NNO', 6, '10:55', '11:10', 15, '01', 206.6, 325],
          ['PTH', 7, '11:55', '12:05', 10, '01', 223.9, 385],
          ['HPT', 8, '12:45', '12:55', 10, '01', 246.7, 435],
          ['ELL', 9, '13:40', '13:50', 10, '01', 271.6, 490],
          ['DLA', 10, '14:00', '14:10', 10, '01', 277.6, 510],
          ['BAD', 11, '14:20', '14:20', 0, '01', 292.3, 530]
        ]
      },
      {
        train_number: '8058',
        name: 'Ruhunu Kumari',
        name_si: 'රුහුණු කුමාරි',
        name_ta: 'ருஹுனு குமாரி',
        type: 'Coastal Express',
        route_name: 'Coastal Line (Maradana - Colombo Fort - Matara - Beliatta)',
        origin_code: 'MDA',
        dest_code: 'BLT',
        departure_time: '15:40',
        arrival_time: '19:45',
        duration_mins: 245,
        frequency: 'Daily',
        classes_available: '1st Class Air Conditioned,2nd Class Reserved,3rd Class Reserved',
        base_speed_kmh: 65,
        stops: [
          ['MDA', 1, '15:40', '15:40', 0, '04', 0.0, 0],
          ['FOT', 2, '15:48', '15:50', 2, '05', 1.9, 8],
          ['KLT', 3, '16:32', '16:34', 2, '02', 43.2, 52],
          ['ALT', 4, '16:52', '16:54', 2, '01', 61.3, 72],
          ['HKD', 5, '17:30', '17:32', 2, '01', 96.8, 110],
          ['GLE', 6, '17:52', '18:02', 10, '01', 115.6, 132],
          ['MTR', 7, '18:55', '19:00', 5, '01', 158.8, 195],
          ['BLT', 8, '19:45', '19:45', 0, '01', 185.5, 245]
        ]
      },
      {
        train_number: '8050',
        name: 'Galu Kumari',
        name_si: 'ගාලු කුමාරි',
        name_ta: 'காலு குமாரி',
        type: 'Southern Intercity',
        route_name: 'Coastal Line (Maradana - Galle - Beliatta)',
        origin_code: 'MDA',
        dest_code: 'BLT',
        departure_time: '13:45',
        arrival_time: '18:25',
        duration_mins: 280,
        frequency: 'Daily',
        classes_available: '1st Class Observation,1st Class Air Conditioned,2nd Class Reserved,3rd Class Reserved',
        base_speed_kmh: 58,
        stops: [
          ['MDA', 1, '13:45', '13:45', 0, '04', 0.0, 0],
          ['FOT', 2, '13:52', '13:55', 3, '05', 1.9, 7],
          ['KLT', 3, '14:42', '14:45', 3, '02', 43.2, 57],
          ['ALT', 4, '15:08', '15:10', 2, '01', 61.3, 83],
          ['HKD', 5, '15:52', '15:55', 3, '01', 96.8, 127],
          ['GLE', 6, '16:20', '16:30', 10, '01', 115.6, 155],
          ['MTR', 7, '17:35', '17:40', 5, '01', 158.8, 230],
          ['BLT', 8, '18:25', '18:25', 0, '01', 185.5, 280]
        ]
      },
      {
        train_number: '4077',
        name: 'Yal Devi',
        name_si: 'යාල් දේවි',
        name_ta: 'யாழ் தேவி',
        type: 'Northern Intercity Express',
        route_name: 'Northern Line (Colombo Fort - Anuradhapura - Jaffna)',
        origin_code: 'FOT',
        dest_code: 'KKS',
        departure_time: '06:40',
        arrival_time: '13:55',
        duration_mins: 435,
        frequency: 'Daily',
        classes_available: '1st Class Air Conditioned,2nd Class Reserved,3rd Class Reserved',
        base_speed_kmh: 68,
        stops: [
          ['FOT', 1, '06:40', '06:40', 0, '03', 0.0, 0],
          ['RAG', 2, '07:00', '07:02', 2, '01', 14.8, 20],
          ['GQ', 3, '07:15', '07:17', 2, '01', 26.7, 35],
          ['PLG', 4, '08:05', '08:08', 3, '02', 73.1, 85],
          ['KUR', 5, '08:35', '08:38', 3, '01', 94.6, 115],
          ['ANP', 6, '10:25', '10:35', 10, '01', 205.6, 225],
          ['VNA', 7, '11:25', '11:28', 3, '01', 254.1, 285],
          ['KKS', 8, '13:55', '13:55', 0, '01', 398.2, 435]
        ]
      },
      {
        train_number: '6011',
        name: 'Udaya Devi',
        name_si: 'උදය දේවි',
        name_ta: 'உதய தேவி',
        type: 'Eastern Intercity Express',
        route_name: 'Eastern Line (Colombo Fort - Habarana - Polonnaruwa)',
        origin_code: 'FOT',
        dest_code: 'PLN',
        departure_time: '06:05',
        arrival_time: '11:40',
        duration_mins: 335,
        frequency: 'Daily',
        classes_available: '1st Class Air Conditioned,2nd Class Reserved,3rd Class Reserved',
        base_speed_kmh: 55,
        stops: [
          ['FOT', 1, '06:05', '06:05', 0, '02', 0.0, 0],
          ['RAG', 2, '06:28', '06:30', 2, '01', 14.8, 23],
          ['PLG', 3, '07:35', '07:40', 5, '02', 73.1, 90],
          ['KUR', 4, '08:10', '08:15', 5, '01', 94.6, 125],
          ['HBO', 5, '10:15', '10:20', 5, '01', 173.2, 250],
          ['PLN', 6, '11:40', '11:40', 0, '01', 226.4, 335]
        ]
      },
      {
        train_number: '6079',
        name: 'Night Mail Express',
        name_si: 'රාත්‍රී තැපැල් දුම්රිය',
        name_ta: 'இரவு தபால் ரயில்',
        type: 'Night Mail Sleeper',
        route_name: 'Main Line (Colombo Fort - Kandy - Badulla)',
        origin_code: 'FOT',
        dest_code: 'BAD',
        departure_time: '20:30',
        arrival_time: '05:45',
        duration_mins: 555,
        frequency: 'Daily',
        classes_available: '1st Class Air Conditioned,2nd Class Reserved,3rd Class Reserved',
        base_speed_kmh: 42,
        stops: [
          ['FOT', 1, '20:30', '20:30', 0, '02', 0.0, 0],
          ['RAG', 2, '20:55', '20:58', 3, '01', 14.8, 25],
          ['PLG', 3, '22:00', '22:05', 5, '01', 73.1, 90],
          ['KDY', 4, '23:30', '23:45', 15, '01', 120.9, 180],
          ['HTN', 5, '01:55', '02:00', 5, '01', 173.9, 325],
          ['NNO', 6, '03:10', '03:18', 8, '01', 206.6, 400],
          ['HPT', 7, '04:20', '04:25', 5, '01', 246.7, 470],
          ['ELL', 8, '05:05', '05:10', 5, '01', 271.6, 515],
          ['BAD', 9, '05:45', '05:45', 0, '01', 292.3, 555]
        ]
      }
    ];

    for (const t of trainsData) {
      const originId = getStationId(t.origin_code);
      const destId = getStationId(t.dest_code);

      dbRun(
        `INSERT INTO trains (
          train_number, name, name_si, name_ta, type, route_name,
          origin_station_id, destination_station_id, departure_time, arrival_time,
          duration_mins, frequency, classes_available, base_speed_kmh, has_gps_hardware, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)
        ON CONFLICT(train_number) DO UPDATE SET
          name = excluded.name,
          name_si = excluded.name_si,
          name_ta = excluded.name_ta,
          type = excluded.type,
          route_name = excluded.route_name,
          origin_station_id = excluded.origin_station_id,
          destination_station_id = excluded.destination_station_id,
          departure_time = excluded.departure_time,
          arrival_time = excluded.arrival_time,
          duration_mins = excluded.duration_mins,
          classes_available = excluded.classes_available`,
        [
          t.train_number, t.name, t.name_si, t.name_ta, t.type, t.route_name,
          originId, destId, t.departure_time, t.arrival_time,
          t.duration_mins, t.frequency, t.classes_available, t.base_speed_kmh
        ]
      );

      const trainRow = dbGet('SELECT id FROM trains WHERE train_number = ?', [t.train_number]);
      if (!trainRow) continue;

      const scheduleCode = `SCH-${t.train_number}-DAILY`;
      dbRun(
        `INSERT INTO train_schedules (
          train_id, schedule_code, direction, departure_time, arrival_time, duration_mins, effective_from, status
        ) VALUES (?, ?, 'OUTBOUND', ?, ?, ?, '2025-01-01', 'ACTIVE')
        ON CONFLICT(schedule_code) DO UPDATE SET
          departure_time = excluded.departure_time,
          arrival_time = excluded.arrival_time,
          duration_mins = excluded.duration_mins`,
        [trainRow.id, scheduleCode, t.departure_time, t.arrival_time, t.duration_mins]
      );

      const schedRow = dbGet('SELECT id FROM train_schedules WHERE schedule_code = ?', [scheduleCode]);
      if (schedRow) {
        dbRun(
          `INSERT INTO operating_days (schedule_id, mon, tue, wed, thu, fri, sat, sun)
           VALUES (?, 1, 1, 1, 1, 1, 1, 1)
           ON CONFLICT(schedule_id) DO NOTHING`,
          [schedRow.id]
        );
      }

      dbRun('DELETE FROM route_stops WHERE train_id = ?', [trainRow.id]);
      for (const [stCode, order, arr, dep, dwell, plat, distKm, offsetMin] of t.stops) {
        const stId = getStationId(stCode);
        if (!stId) continue;
        dbRun(
          `INSERT INTO route_stops (
            train_id, station_id, stop_order, arrival_time, departure_time,
            dwell_mins, platform, distance_from_origin_km, arrival_offset_mins
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [trainRow.id, stId, order, arr, dep, dwell, plat, distKm, offsetMin]
        );
      }

      const carriageSpecs = [
        ['C1', '1st Class Observation', 40, 10, 4, 3000, 0, 1],
        ['C2', '1st Class Air Conditioned', 44, 11, 4, 2500, 1, 0],
        ['C3', '2nd Class Reserved', 48, 12, 4, 1500, 0, 0],
        ['C4', '3rd Class Reserved', 56, 14, 4, 800, 0, 0]
      ];

      for (const [cCode, cName, totalSeats, rows, perRow, priceLkr, hasAc, hasObs] of carriageSpecs) {
        if (!t.classes_available.includes(cName)) continue;
        dbRun(
          `INSERT INTO carriages (
            train_id, carriage_code, class_name, total_seats, total_rows,
            seats_per_row, layout_type, price_lkr, has_air_conditioning, has_observation_glass
          ) VALUES (?, ?, ?, ?, ?, ?, '2+2', ?, ?, ?)
          ON CONFLICT(train_id, carriage_code) DO UPDATE SET
            class_name = excluded.class_name,
            total_seats = excluded.total_seats,
            total_rows = excluded.total_rows,
            price_lkr = excluded.price_lkr`,
          [trainRow.id, cCode, cName, totalSeats, rows, perRow, priceLkr, hasAc, hasObs]
        );

        const carriageRow = dbGet(
          'SELECT id FROM carriages WHERE train_id = ? AND carriage_code = ?',
          [trainRow.id, cCode]
        );
        if (!carriageRow) continue;

        const existingSeatsCount = dbGet(
          'SELECT COUNT(*) as cnt FROM seats WHERE carriage_id = ?',
          [carriageRow.id]
        );
        if (!existingSeatsCount || existingSeatsCount.cnt === 0) {
          const cols = ['A', 'B', 'C', 'D'];
          for (let r = 1; r <= rows; r++) {
            for (const col of cols) {
              const seatNum = `${r}${col}`;
              const isWin = col === 'A' || col === 'D' ? 1 : 0;
              const isAisle = col === 'B' || col === 'C' ? 1 : 0;
              dbRun(
                `INSERT OR IGNORE INTO seats (
                  carriage_id, seat_number, row_number, col_letter, is_window, is_aisle, is_accessible, is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
                [carriageRow.id, seatNum, r, col, isWin, isAisle, r === 1 ? 1 : 0]
              );
            }
          }
        }
      }
    }

    // 5. Seed Fare Rules
    const fareRulesData = [
      ['1st Class Observation', 120000, 1000, 1.8, 25000, 0.0, 25.0],
      ['1st Class Air Conditioned', 90000, 850, 1.5, 20000, 0.0, 25.0],
      ['2nd Class Reserved', 50000, 500, 1.2, 15000, 0.0, 20.0],
      ['3rd Class Reserved', 25000, 300, 1.0, 10000, 0.0, 15.0]
    ];
    for (const [cName, baseCents, perKmCents, mult, resFeeCents, taxPct, cancelPct] of fareRulesData) {
      dbRun(
        `INSERT INTO fare_rules (
          class_name, base_fare_cents, per_km_rate_cents, min_distance_km,
          class_multiplier, reservation_fee_cents, tax_rate_pct, cancellation_fee_pct, is_active
        ) VALUES (?, ?, ?, 10.0, ?, ?, ?, ?, 1)
        ON CONFLICT(class_name) DO UPDATE SET
          base_fare_cents = excluded.base_fare_cents,
          per_km_rate_cents = excluded.per_km_rate_cents,
          class_multiplier = excluded.class_multiplier,
          reservation_fee_cents = excluded.reservation_fee_cents,
          cancellation_fee_pct = excluded.cancellation_fee_pct`,
        [cName, baseCents, perKmCents, mult, resFeeCents, taxPct, cancelPct]
      );
    }

    // 6. Seed Smart Travel Planner Destinations, Attractions, Station Links & Scenic Routes
    // Strictly uses the user's real supplied images in /images/
    const destinationsData = [
      {
        slug: 'ella-highlands',
        name: 'Ella & Nine Arch Highlands',
        name_si: 'ඇල්ල සහ ආරුක්කු නවය කඳුකරය',
        name_ta: 'எல்ல மற்றும் ஒன்பது வளைவு மலைப்பகுதி',
        region: 'Uva Province',
        category: 'Hill Country & Nature',
        summary: 'Misty tea estates, colonial stone viaducts, Little Adam’s Peak, and Ravana Falls along the Main Line.',
        description: 'Ella sits at 1,041m elevation surrounded by cloud forests and organic tea plantations. Reachable directly via the Podi Menike, Udarata Menike, and Ella Odyssey trains.',
        best_season: 'December to May',
        recommended_days: 2,
        hero_image_url: '/images/route_highland.jpg',
        gallery_images_json: JSON.stringify(['/images/hero_mountain_train.jpg', '/images/route_highland.jpg', '/images/image_441e3b.jpg']),
        suggested_itinerary_json: JSON.stringify([
          { day: 1, title: 'Arrive at Ella Station & Nine Arch Viaduct Walk', activities: ['Board 1005 Podi Menike or 1045 Ella Odyssey to Ella Station (ELL)', 'Walk along the forest path to the Nine Arch Bridge viewpoint between Ella and Demodara'] },
          { day: 2, title: 'Little Adam’s Peak Sunrise & Demodara Rail Loop', activities: ['Morning ridge hike through tea estates at Little Adam’s Peak', 'Ride the short train hop to Demodara Station to inspect the 360-degree spiral loop'] }
        ]),
        lat: 6.8748,
        lng: 81.0476,
        station_code: 'ELL',
        distance_km: 1.2,
        travel_time_mins: 5,
        transport_mode: 'Walk / Tuk-Tuk',
        fare_lkr: 350,
        attractions: [
          ['Nine Arch Bridge Viewpoint', 'Heritage Railway Viaduct', 'Iconic 91-meter colonial stone viaduct between Ella and Demodara stations.', '/images/hero_mountain_train.jpg', 2.4, 90, 0, '06:00 - 18:30'],
          ['Little Adam’s Peak Trail', 'Hiking & Panorama', 'Gentle ridge hike through tea estates offering sweeping views of Ella Gap.', '/images/image_441e3b.jpg', 2.8, 120, 0, '05:30 - 18:00'],
          ['Demodara Spiral Rail Loop', 'Railway Engineering Marvel', 'World-famous 360-degree spiral railway loop passing under the station.', '/images/route_highland.jpg', 6.0, 60, 0, '06:00 - 18:00']
        ]
      },
      {
        slug: 'badulla-uva-terminus',
        name: 'Badulla & Demodara Terminus',
        name_si: 'බදුල්ල සහ දෙමෝදර',
        name_ta: 'பதுளை மலைநாட்டு முனையம்',
        region: 'Uva Province',
        category: 'Hill Country Terminus & Waterfalls',
        summary: 'Historic eastern terminus of the Main Line, Dunhinda Falls, Muthiyangana Raja Maha Viharaya, and Demodara loop.',
        description: 'Badulla (652m) is the historic final terminus of the Main Line railway through the Uva Highlands, served daily by Podi Menike, Udarata Menike, Ella Odyssey, and the Night Mail.',
        best_season: 'January to May',
        recommended_days: 2,
        hero_image_url: '/images/hero_mountain_train.jpg',
        gallery_images_json: JSON.stringify(['/images/hero_mountain_train.jpg', '/images/route_highland.jpg']),
        suggested_itinerary_json: JSON.stringify([
          { day: 1, title: 'Cross the Nine Arch Viaduct & Demodara Loop to Badulla', activities: ['Arrive at Badulla Railway Station (BAD) via the scenic Main Line', 'Visit ancient Muthiyangana Raja Maha Viharaya temple'] },
          { day: 2, title: 'Dunhinda Waterfall & Uva Tea Valleys', activities: ['Excursion to the 64-meter Dunhinda Waterfall trail', 'Return overnight sleeper or morning express from Badulla Station'] }
        ]),
        lat: 6.9897,
        lng: 81.0560,
        station_code: 'BAD',
        distance_km: 1.5,
        travel_time_mins: 6,
        transport_mode: 'Tuk-Tuk / Bus',
        fare_lkr: 300,
        attractions: [
          ['Muthiyangana Raja Maha Viharaya', 'Ancient Sacred Temple', 'One of the Solosmasthana sacred Buddhist shrines dating back over two millennia.', '/images/route_cultural.jpg', 1.8, 75, 0, '06:00 - 20:00'],
          ['Dunhinda Waterfall Trail', 'Waterfall & Nature', 'Spectacular 64-meter bridal-veil cascade surrounded by tropical forest near Badulla.', '/images/image_441e3b.jpg', 5.5, 120, 200, '07:00 - 17:30']
        ]
      },
      {
        slug: 'nuwara-eliya-tea-country',
        name: 'Nuwara Eliya & Misty Highlands (Nanu Oya)',
        name_si: 'නුවරඑළිය සහ නානුඔය තේ කඳුකරය',
        name_ta: 'நுவரெலியா தேயிலை மலை',
        region: 'Central Province',
        category: 'Tea Estates & Alpine Climate',
        summary: 'Cool mountain climate at 1,868m, misty Nanu Oya & Pattipola summit stations, Lake Gregory, and Ceylon tea estates.',
        description: 'Alight at Nanu Oya (1,613m) or Pattipola (1,897.5m, highest railway station in Sri Lanka) for misty pine forests, colonial bungalows, and high-grown Ceylon tea estates.',
        best_season: 'February to May',
        recommended_days: 2,
        hero_image_url: '/images/image_4421da.jpg',
        gallery_images_json: JSON.stringify(['/images/image_4421da.jpg', '/images/image_441e3b.jpg']),
        suggested_itinerary_json: JSON.stringify([
          { day: 1, title: 'Ascend to Nanu Oya Station & Tea Factory Tour', activities: ['Alight at misty Nanu Oya Station (NNO) from Colombo or Kandy', 'Tour Pedro Tea Estate & stroll around Lake Gregory'] },
          { day: 2, title: 'Pattipola Summit (1,897.5m) & Horton Plains', activities: ['Early morning visit to Horton Plains & World’s End escarpment', 'Continue rail journey from Nanu Oya or Pattipola toward Haputale and Ella'] }
        ]),
        lat: 6.9497,
        lng: 80.7891,
        station_code: 'NNO',
        distance_km: 8.5,
        travel_time_mins: 20,
        transport_mode: 'Station Taxi / Bus',
        fare_lkr: 1500,
        attractions: [
          ['Nanu Oya & Pattipola Misty Highland Stations', 'Heritage Mountain Railway', 'Historic colonial hill stations shrouded in mountain mist at 1,613m–1,897m.', '/images/image_4421da.jpg', 0.2, 45, 0, '05:30 - 19:00'],
          ['Pedro Tea Estate & High-Grown Plantation', 'Tea Heritage Tour', '19th-century high-grown Ceylon tea factory tour and emerald plantation trails.', '/images/image_441e3b.jpg', 11.0, 90, 1500, '08:00 - 16:30']
        ]
      },
      {
        slug: 'kandy-sacred-city',
        name: 'Kandy Royal & Sacred City',
        name_si: 'මහනුවර පූජා නගරය',
        name_ta: 'கண்டி புனித நகரம்',
        region: 'Central Province',
        category: 'UNESCO Heritage & Culture',
        summary: 'Temple of the Sacred Tooth Relic, Kandy Lake, historic 1867 Kandy Railway Terminus, and Peradeniya Royal Botanical Gardens.',
        description: 'The last royal capital of Sri Lanka and gateway to the central highlands. All Main Line express trains stop at Peradeniya Junction (KDT) and Kandy Station (KDY).',
        best_season: 'Year-round (Esala Perahera in July/August)',
        recommended_days: 2,
        hero_image_url: '/images/route_cultural.jpg',
        gallery_images_json: JSON.stringify(['/images/route_cultural.jpg', '/images/image_442524.jpg']),
        suggested_itinerary_json: JSON.stringify([
          { day: 1, title: 'Express Rail to Kandy & Temple of the Sacred Tooth Relic', activities: ['Morning Main Line express from Colombo Fort to Kandy Station (KDY)', 'Evening puja ceremony at Sri Dalada Maligawa beside Kandy Lake'] },
          { day: 2, title: 'Peradeniya Botanical Gardens & Historic Railway Heritage', activities: ['Explore the 147-acre Royal Botanical Gardens near Peradeniya Junction', 'Inspect historic Kandy railway architecture before boarding onward highland train'] }
        ]),
        lat: 7.2896,
        lng: 80.6327,
        station_code: 'KDY',
        distance_km: 1.5,
        travel_time_mins: 8,
        transport_mode: 'Tuk-Tuk / Bus',
        fare_lkr: 400,
        attractions: [
          ['Sri Dalada Maligawa (Temple of the Tooth) & Kandy Lake', 'UNESCO World Heritage', 'Sacred Buddhist temple complex and royal lake in the heart of Kandy.', '/images/route_cultural.jpg', 1.8, 120, 2000, '05:30 - 20:00'],
          ['Historic Kandy Railway Terminus (1867 Heritage)', 'Railway History', 'Site of the arrival of the first Ceylon Railway train into the hill capital in 1867.', '/images/image_442524.jpg', 0.1, 45, 0, 'Open Daily']
        ]
      },
      {
        slug: 'galle-dutch-fort',
        name: 'Galle UNESCO Dutch Fort & Southern Coast',
        name_si: 'ගාල්ල ලන්දේසි කොටුව',
        name_ta: 'காலி டச்சு கோட்டை',
        region: 'Southern Province',
        category: 'Coastal Heritage & Beaches',
        summary: '17th-century seafront ramparts, lighthouse, cobblestone streets, and Indian Ocean beaches right beside the Coastal Line.',
        description: 'Just 600 meters from Galle Railway Station (GLE) via the scenic Coastal Line express trains Ruhunu Kumari and Galu Kumari hugging the Indian Ocean.',
        best_season: 'November to April',
        recommended_days: 2,
        hero_image_url: '/images/route_coastal.jpg',
        gallery_images_json: JSON.stringify(['/images/route_coastal.jpg']),
        suggested_itinerary_json: JSON.stringify([
          { day: 1, title: 'Indian Ocean Coastal Line to Galle & Sunset Ramparts', activities: ['Ride Galu Kumari or Ruhunu Kumari along the seafront track from Colombo Fort to Galle (GLE)', 'Walk the 17th-century Dutch Fort ramparts and Point Utrecht Lighthouse at sunset'] },
          { day: 2, title: 'Maritime Museum & Hikkaduwa / Bentota Coast', activities: ['Explore Pedlar Street cafes and National Maritime Archaeology Museum', 'Return coastal train past Hikkaduwa and Bentota beaches'] }
        ]),
        lat: 6.0269,
        lng: 80.2170,
        station_code: 'GLE',
        distance_km: 0.6,
        travel_time_mins: 5,
        transport_mode: 'Walk / Tuk-Tuk',
        fare_lkr: 250,
        attractions: [
          ['Galle Fort Ramparts & Lighthouse', 'UNESCO World Heritage', 'Historic coral and granite seafront walls overlooking the Indian Ocean.', '/images/route_coastal.jpg', 0.8, 120, 0, 'Open 24 Hours'],
          ['National Maritime Archaeology Museum', 'Museum', 'Dutch warehouse housing marine artifacts and shipwreck discoveries.', '/images/route_coastal.jpg', 0.7, 75, 1000, '09:00 - 16:30']
        ]
      },
      {
        slug: 'anuradhapura-ancient-kingdom',
        name: 'Anuradhapura Sacred Ancient Kingdom',
        name_si: 'අනුරාධපුර පූජා නගරය',
        name_ta: 'அனுராதபுரம் புனித நகரம்',
        region: 'North Central Province',
        category: 'Ancient Civilization & Stupas',
        summary: 'Jaya Sri Maha Bodhi, Ruwanwelisaya Stupa, and 2,300-year-old hydraulic reservoirs along the Northern Line.',
        description: 'Accessible directly from Colombo Fort via the Yal Devi Northern Intercity Express stopping at Anuradhapura Railway Station (ANP).',
        best_season: 'May to September',
        recommended_days: 2,
        hero_image_url: '/images/route_northern.jpg',
        gallery_images_json: JSON.stringify(['/images/route_northern.jpg', '/images/route_cultural.jpg']),
        suggested_itinerary_json: JSON.stringify([
          { day: 1, title: 'Yal Devi Express to Anuradhapura & Sacred Bodhi Tree', activities: ['Board 4077 Yal Devi from Colombo Fort to Anuradhapura (ANP)', 'Visit Jaya Sri Maha Bodhi and Ruwanwelisaya Great Stupa'] },
          { day: 2, title: 'Jetavanaramaya & Abhayagiri Monastic Complex', activities: ['Cycle through the UNESCO Sacred City archaeological park', 'Continue north toward Jaffna (KKS) or return to Colombo Fort'] }
        ]),
        lat: 8.3450,
        lng: 80.3881,
        station_code: 'ANP',
        distance_km: 2.5,
        travel_time_mins: 8,
        transport_mode: 'Tuk-Tuk / Bicycle Rental',
        fare_lkr: 500,
        attractions: [
          ['Jaya Sri Maha Bodhi & Ruwanwelisaya', 'Sacred Heritage', 'The oldest historically documented tree in the world and the Great White Stupa.', '/images/route_northern.jpg', 3.0, 180, 0, '06:00 - 21:00']
        ]
      },
      {
        slug: 'polonnaruwa-medieval-capital',
        name: 'Polonnaruwa Medieval Royal Capital',
        name_si: 'පොළොන්නරුව පෞරාණික රාජධානිය',
        name_ta: 'பொலன்னறுவை புராதன நகரம்',
        region: 'North Central Province',
        category: 'UNESCO Archaeological Park',
        summary: 'Gal Vihara rock-cut Buddha statues, Parakrama Samudra reservoir, and Royal Palace complex on the Eastern Line.',
        description: 'Served daily by the 6011 Udaya Devi Intercity Express from Colombo Fort via Polgahawela, Kurunegala, and Habarana to Polonnaruwa Station (PLN).',
        best_season: 'May to October',
        recommended_days: 2,
        hero_image_url: '/images/route_northern.jpg',
        gallery_images_json: JSON.stringify(['/images/route_northern.jpg', '/images/image_441e5f.jpg']),
        suggested_itinerary_json: JSON.stringify([
          { day: 1, title: 'Udaya Devi Express to Polonnaruwa & Parakrama Samudra', activities: ['Morning 6011 Udaya Devi train from Colombo Fort to Polonnaruwa (PLN)', 'Sunset walk along the ancient Parakrama Samudra reservoir bund'] },
          { day: 2, title: 'Sacred Quadrangle & Gal Vihara Rock Sculptures', activities: ['Explore the Royal Palace, Vatadage, and Gal Vihara 12th-century granite sculptures', 'Afternoon return train from Polonnaruwa Station'] }
        ]),
        lat: 7.9403,
        lng: 81.0188,
        station_code: 'PLN',
        distance_km: 4.0,
        travel_time_mins: 10,
        transport_mode: 'Tuk-Tuk / Bicycle',
        fare_lkr: 500,
        attractions: [
          ['Gal Vihara & Sacred Quadrangle (Dalada Maluwa)', 'UNESCO World Heritage', 'Masterpiece 12th-century monolithic granite Buddha sculptures and royal shrines.', '/images/route_northern.jpg', 4.5, 180, 3000, '07:00 - 17:30']
        ]
      }
    ];

    for (const d of destinationsData) {
      dbRun(
        `INSERT INTO tourist_destinations (
          slug, name, name_si, name_ta, region, category, summary, description,
          best_season, recommended_days, hero_image_url, gallery_images_json,
          suggested_itinerary_json, lat, lng, is_featured
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(slug) DO UPDATE SET
          name = excluded.name,
          name_si = excluded.name_si,
          name_ta = excluded.name_ta,
          summary = excluded.summary,
          description = excluded.description,
          hero_image_url = excluded.hero_image_url,
          gallery_images_json = excluded.gallery_images_json,
          suggested_itinerary_json = excluded.suggested_itinerary_json`,
        [
          d.slug, d.name, d.name_si, d.name_ta, d.region, d.category,
          d.summary, d.description, d.best_season, d.recommended_days,
          d.hero_image_url, d.gallery_images_json, d.suggested_itinerary_json,
          d.lat, d.lng
        ]
      );

      const destRow = dbGet('SELECT id FROM tourist_destinations WHERE slug = ?', [d.slug]);
      if (!destRow) continue;

      const stId = getStationId(d.station_code);
      if (stId) {
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
            destRow.id, stId, d.distance_km, d.travel_time_mins,
            d.transport_mode, d.fare_lkr,
            `Direct connection from ${d.station_code} railway station`
          ]
        );
      }

      dbRun('DELETE FROM tourist_attractions WHERE destination_id = ?', [destRow.id]);
      for (const [aName, aCat, aDesc, aImg, distKm, visitMins, feeLkr, hours] of d.attractions) {
        dbRun(
          `INSERT INTO tourist_attractions (
            destination_id, name, category, description, image_url, distance_from_station_km,
            estimated_visit_mins, entry_fee_lkr, opening_hours
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [destRow.id, aName, aCat, aDesc, aImg, distKm, visitMins, feeLkr, hours]
        );
      }
    }

    // Seed Scenic Routes using supplied images
    const scenicData = [
      [
        'kandy-to-ella-odyssey',
        'The Highland Tea Country Odyssey (Kandy to Ella & Badulla)',
        'KDY',
        'ELL',
        150.7,
        395,
        1897.5,
        'Widely celebrated as one of the most scenic train journeys in the world, climbing through emerald tea plantations, cloud forests, Nanu Oya, Pattipola summit, and the Nine Arch Viaduct.',
        '["Nine Arch Bridge","Pattipola Summit (1,897.5m)","Misty Tea Estates","Demodara Spiral"]',
        '/images/route_highland.jpg'
      ],
      [
        'colombo-to-galle-coastal',
        'The Indian Ocean Coastal Express (Colombo Fort to Galle)',
        'FOT',
        'GLE',
        115.6,
        132,
        14.0,
        'Skirts the golden shores of the Indian Ocean just meters from breaking waves through Kalutara, Bentota, Hikkaduwa, and the UNESCO Dutch Fort at Galle.',
        '["Indian Ocean Seafront Track","Bentota Lagoon Bridge","Hikkaduwa Coral Coast","Galle Fort Arrival"]',
        '/images/route_coastal.jpg'
      ],
      [
        'colombo-to-kandy-heritage',
        'The Royal Kandyan Heritage Line (Colombo Fort to Kandy)',
        'FOT',
        'KDY',
        120.9,
        184,
        500.0,
        'Follows the historic 1867 railway alignment climbing through Kadugannawa Pass and Sensation Rock to Peradeniya and the sacred lakeside capital of Kandy.',
        '["Kadugannawa Pass","Peradeniya Botanical Gardens","Temple of the Tooth","1867 Heritage Terminus"]',
        '/images/route_cultural.jpg'
      ],
      [
        'colombo-to-jaffna-northern',
        'The Yal Devi Northern Palmyra Line (Colombo Fort to Anuradhapura & Jaffna)',
        'FOT',
        'KKS',
        398.2,
        435,
        116.0,
        'Crosses the North Central plains, ancient stupas of Anuradhapura, Elephant Pass lagoon causeway, and palmyra groves of the Northern Peninsula.',
        '["Anuradhapura Sacred City","Palmyra Groves & Lagoons","Elephant Pass Causeway","Jaffna Terminus"]',
        '/images/route_northern.jpg'
      ]
    ];

    for (const [slug, name, origCode, destCode, dist, dur, maxElev, desc, highlightsJson, img] of scenicData) {
      const oId = getStationId(origCode);
      const dId = getStationId(destCode);
      if (!oId || !dId) continue;
      dbRun(
        `INSERT INTO scenic_routes (
          slug, name, origin_station_id, destination_station_id, distance_km,
          duration_mins, max_elevation_m, description, highlights_json, image_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          image_url = excluded.image_url,
          highlights_json = excluded.highlights_json`,
        [slug, name, oId, dId, dist, dur, maxElev, desc, highlightsJson, img]
      );
    }
  });
}

async function initDatabase(customDbPath = null) {
  if (customDbPath) {
    activeDbPath = path.isAbsolute(customDbPath)
      ? customDbPath
      : path.resolve(env.PROJECT_ROOT, customDbPath);
  } else {
    activeDbPath = env.DATABASE_PATH;
  }

  const dbDir = path.dirname(activeDbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  let useSqlJs = false;
  try {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    if (fs.existsSync(activeDbPath)) {
      const fileBuffer = fs.readFileSync(activeDbPath);
      sqlJsDb = new SQL.Database(fileBuffer);
    } else {
      sqlJsDb = new SQL.Database();
    }
    sqlJsDb.run('PRAGMA foreign_keys = ON;');
    useSqlJs = true;
  } catch (err) {
    throw new Error('Failed to initialize SQLite database: ' + err.message);
  }

  runMigrations();
  seedReferenceData();

  if (useSqlJs) {
    saveSqlJsDatabase();
  }
  return true;
}

function closeDatabase() {
  if (sqlJsDb) {
    saveSqlJsDatabase();
    sqlJsDb.close();
    sqlJsDb = null;
  }
}

module.exports = {
  initDatabase,
  closeDatabase,
  getDbPath,
  setDbPath,
  createDatabaseBackup,
  rollbackMigration,
  dbAll,
  dbGet,
  dbRun,
  withTransaction
};
