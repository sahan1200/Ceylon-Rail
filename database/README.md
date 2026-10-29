# Ceylon Rail — SQLite Database & DB Browser Guide

This folder contains the persistent SQLite relational database, SQL schema, and migration files for **Ceylon Rail — Sri Lanka Railway Reservation System**.

## Folder Contents

```text
database/
├── ceylon_rail.db                   # Active persistent SQLite database used by the backend
├── schema.sql                       # Complete 42-table relational SQLite schema definition
├── migrations/
│   ├── 001_complete_schema.sql      # Forward schema migration applied idempotently on startup
│   └── 001_rollback.sql             # Rollback script
├── open_in_db_browser.bat           # Windows helper script to open ceylon_rail.db in DB Browser for SQLite
└── README.md                        # This documentation file
```

---

## How to Open the Database in DB Browser for SQLite

1. Open the extracted **Ceylon Rail** project folder in Windows **File Explorer**.
2. Open the **`database`** folder.
3. Locate **`ceylon_rail.db`**.
4. Open **DB Browser for SQLite** on your Windows computer (or double-click `database\open_in_db_browser.bat`).
5. Click **Open Database** in the top toolbar.
6. Browse to the project directory and select **`database\ceylon_rail.db`**.
7. Click the **Database Structure** tab to inspect all tables, columns, primary keys, foreign keys, and indexes.
8. Click the **Browse Data** tab and choose any table from the **Table** dropdown (such as `stations`, `trains`, `route_stops`, `carriages`, `seats`, `fare_rules`, `bookings`, `booking_passengers`, `seat_reservations`, `payments`, `refunds`, `staff_users`, `tourist_destinations`, `tourist_attractions`, `scenic_routes`, `complaints`, `operating_expenses`, or `audit_logs`) to inspect live application records.

---

## How to Confirm That the Backend Uses This Exact Database File

- **Configured Path**: In `backend/config/env.js` and `.env.example`, `DATABASE_PATH` defaults to `database/ceylon_rail.db` resolved relative to the project root (`path.resolve(__dirname, '..', '..')`).
- **Live Verification Endpoint**: While the backend is running (`http://localhost:5000`), open:
  `http://localhost:5000/api/system/status`
  The JSON response includes `"database_engine": "SQLite"` and the exact absolute `"database_path"` pointing to `.../database/ceylon_rail.db`.
- **Data Persistence**: All guest bookings, seat reservations, payments, refunds, complaints, travel planner updates, and financial records are written directly to `database/ceylon_rail.db` and persist across server restarts. The backend never recreates or wipes existing records on startup.
