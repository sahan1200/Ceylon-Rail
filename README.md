# Ceylon Rail — Sri Lanka Railway Reservation, Smart Travel Planner & Staff Management System (v2.1)

Ceylon Rail is a full-stack railway reservation, guest ticketing, smart travel planning, passenger complaint resolution, and staff/financial management web application engineered for **Sri Lanka Railways**.

---

## 1. Project Structure

```text
Ceylon_Rail/
├── backend/
│   ├── config/env.js                   # Environment & DATABASE_PATH resolver
│   ├── controllers/                    # Express route controllers (booking, complaint, finance, operations, passenger, staff, travelPlanner)
│   ├── middleware/                     # Auth, RBAC, rate limiting, validation & centralized error handling
│   ├── migrations/                     # Mirror of SQL schema migrations
│   ├── repositories/                   # Parameterized SQL data access layer
│   ├── routes/api.js                   # Complete REST API router
│   ├── services/                       # Fare calculator, seat lock engine, payment verifier, QR signer, financial reports & GIS tracker
│   ├── tests/system.test.js            # 23-test automated integration & security suite
│   ├── utils/                          # Salted scrypt hashing, HMAC signing, HTTP app utilities
│   ├── database.js                     # SQLite engine, migration runner & idempotent reference data seeder
│   └── server.js                       # Backend API entrypoint (Port 5000)
├── frontend/
│   ├── public/images/                  # Supplied Sri Lankan railway, route, station & heritage images
│   ├── src/
│   │   ├── components/                 # Navbar, HeroSearch, CarriageSeatMap (7-step flow), ETicketModal, LiveMapTracker
│   │   ├── i18n/translations.js        # Trilingual UI strings (English, Sinhala, Tamil)
│   │   ├── pages/                      # TrainSchedules, TravelPlanner, ComplaintsPortal, PassengerDashboard, StaffPortal
│   │   ├── services/api.js             # Frontend API client
│   │   └── App.jsx                     # Main application router & state container
│   └── package.json                    # React 18 + Vite + Tailwind CSS configuration
├── database/
│   ├── ceylon_rail.db                  # Persistent SQLite database (ready for DB Browser for SQLite)
│   ├── schema.sql                      # Complete normalized SQLite schema
│   ├── migrations/                     # Versioned forward & rollback SQL migrations
│   ├── open_in_db_browser.bat          # Helper script to launch ceylon_rail.db in DB Browser for SQLite
│   └── README.md                       # Database structure & DB Browser documentation
├── .env.example                        # Environment variable template (safe placeholders only)
├── README.md                           # Project setup, testing & database inspection guide
└── run_website.bat                     # One-click Windows startup script
```

---

## 2. Key Features

1. **Passenger Portal — No Mandatory Login (Guest Booking Workflow)**:
   - Passengers can search trains, view schedules/fares, lock seats, enter passenger details, review complete fare breakdowns, complete payment verification, and download/print HMAC-signed QR e-tickets **without creating an account or signing in**.
   - **7-Step Booking Interface**: `1. Search Journey` → `2. Choose Train` → `3. Choose Seats` → `4. Passenger Details` → `5. Review Booking` → `6. Payment` → `7. Confirmation`.
   - **Secure Booking Lookup & Cancellation**: Guests retrieve or cancel eligible bookings using their non-guessable Booking Reference (`PNR`, e.g. `SLR-...`) together with their registered Contact Phone, Email, or NIC/Passport (`POST /api/bookings/lookup`).
2. **Separate Protected Railway Staff Portal & RBAC**:
   - Dedicated Staff Login screen with username, password, show/hide password toggle, validation messages, and railway-themed UI.
   - Enforces least-privilege Role-Based Access Control across `SUPER_ADMIN`, `ADMIN`, `FINANCE_STAFF`, `COMPLAINT_OFFICER`, and `STATION_STAFF` on every backend `/api/staff/*` endpoint.
   - Includes Dashboard Overview, Train & Schedule Management, Station Management, Route & Fare Rules Management, Booking Lookup & Cancellations, Complaint & Internal Note Management, Travel Planner Content Management, Operating Expenses, Financial Reports (with CSV/Print export), Staff Account Provisioning, and Audit Logs.
3. **Initial Administrator Credentials**:
   - **Username**: `admin`
   - **Initial Password**: `1234`
   - Provisioned idempotently on first startup using a salted `crypto.scryptSync` password hash (`scrypt$16384$8$1$...`). Never stored in plaintext, never exposed in API responses, and never reset on subsequent server restarts after the administrator changes it.
   - *(Note: The legacy `RDSD RATHNAYAKA` super-admin record is also preserved for backwards compatibility.)*
   - **Production Deployment Reminder**: Always change the default `admin` / `1234` password via the Staff Portal **Change Password** button before public production deployment.
4. **Smart Travel Planner with Supplied Images**:
   - Database-driven Sri Lankan destinations (**Ella**, **Badulla**, **Nuwara Eliya / Nanu Oya**, **Kandy**, **Galle**, **Anuradhapura**, and **Polonnaruwa**) linked to real railway stations, transfer distances, connecting express trains, tourist attractions, scenic routes, and multi-day suggested itineraries.
   - Integrates all 9 supplied images located in `frontend/public/images/`:
     - `/images/hero_mountain_train.jpg`
     - `/images/route_highland.jpg`
     - `/images/route_coastal.jpg`
     - `/images/route_cultural.jpg`
     - `/images/route_northern.jpg`
     - `/images/image_441e3b.jpg`
     - `/images/image_4421da.jpg`
     - `/images/image_442524.jpg`
     - `/images/image_441e5f.jpg`
5. **Passenger Complaint & Feedback Portal**:
   - Passengers can submit complaints without logging in across categories (Train Delays, Cleanliness, Staff Service, Ticketing & Reservations, Payments, Seat Allocation, Railway Facilities, Other) and receive a unique `CMP-...` reference.
   - Passengers track status history and public responses securely via `CMP-...` + registered email/phone/PNR, while internal staff notes (`is_internal_note = 1`) remain strictly private to authorized staff.

---

## 3. How to Open the Database in DB Browser for SQLite

The backend reads and writes directly to the persistent SQLite database file at:
**`database/ceylon_rail.db`**

To inspect the live database on Windows:
1. Open the extracted **Ceylon Rail** project in **File Explorer**.
2. Open the **`database`** folder.
3. Locate **`ceylon_rail.db`**.
4. Open **DB Browser for SQLite** (or double-click `database\open_in_db_browser.bat`).
5. Click **Open Database**.
6. Select **`database\ceylon_rail.db`**.
7. Use **Database Structure** to inspect all tables (`stations`, `trains`, `train_schedules`, `route_stops`, `carriages`, `seats`, `fare_rules`, `bookings`, `booking_passengers`, `seat_reservations`, `payments`, `refunds`, `cancellations`, `staff_users`, `roles`, `tourist_destinations`, `tourist_attractions`, `scenic_routes`, `complaints`, `operating_expenses`, `financial_report_runs`, `audit_logs`, etc.).
8. Use **Browse Data** to inspect live records.

### How to Confirm the Backend Uses the Same Database File
- In `backend/config/env.js`, `DATABASE_PATH` resolves from the project root to `database/ceylon_rail.db`.
- Visit `http://localhost:5000/api/system/status` while the backend is running—the JSON payload reports `"database_path": ".../database/ceylon_rail.db"`.

---

## 4. Windows Setup, Running & Testing Instructions

### Option A: One-Click Windows Startup (`run_website.bat`)
Double-click **`run_website.bat`** in the project root. It verifies Node.js and project directories, creates `.env` from `.env.example` if needed, installs dependencies if missing, starts the backend on `http://localhost:5000`, starts the Vite frontend on `http://localhost:5173`, and preserves `database/ceylon_rail.db`.

### Option B: Manual Terminal Commands (Windows PowerShell / Command Prompt)

```powershell
# 1. Install Backend Dependencies & Initialize/Verify Database
cd backend
npm install

# 2. Run the 23-Test Automated Backend & Security Test Suite
npm test

# 3. Start the Backend Server (http://localhost:5000)
npm start

# 4. In a second terminal, Install & Start Frontend (http://localhost:5173)
cd ..\frontend
npm install
npm run dev

# 5. Build Frontend for Production
npm run build
```

---

## 5. External Configuration & Remaining Notes

- **Payment Gateway Mode (`PAYMENT_PROVIDER_MODE`)**: Defaults to `SANDBOX_TEST` in `.env.example` so guest and registered bookings can complete full server-side payment verification locally without external merchant keys. To use a live payment gateway in production, provide `STRIPE_SECRET_KEY` or `PAYHERE_MERCHANT_SECRET` and `PAYMENT_WEBHOOK_SECRET` in `.env`.
- **Google Maps API Key (`GOOGLE_MAPS_API_KEY`)**: Optional. The Live GIS Radar works out of the box with embedded satellite/hybrid/terrain layers and explicitly labels schedule-interpolated telemetry versus hardware GPS transponders.
