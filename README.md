# Apex CRM - Simple Client Lead Manager

Apex CRM is a lightweight, responsive, and secure admin dashboard built to manage client leads generated from website contact forms. It supports dynamic pipeline stages, drag-and-drop Kanban tracking, activity notes timeline, scheduled follow-ups, and real-time form intake.

## Features

- **Lead Listing & Directory**: Sortable, filterable, and searchable table listing all leads.
- **Kanban Board**: Drag-and-drop board to transition leads across stages (`New` ➔ `Contacted` ➔ `Converted` ➔ `Lost`).
- **Interaction Timeline**: Detail panel displaying contact details, scheduling follow-up reminders, and writing timestamped logs.
- **Charts & Reports**: HTML5 Canvas rendering for Lead Sources (Donut Chart) and Lead Growth Trend (Line Chart).
- **Public Contact Intake Form**: A mock landing page (`contact.html`) to demonstrate how a site forwards leads to the CRM database.
- **Secure Admin Panel**: JWT-based session authorization shielding CRUD routes.
- **Multi-Database Support**: A unified database adapter matching **SQLite**, **MongoDB**, and **MySQL** through environment flags.

---

## Quick Start (SQLite Fallback)

By default, Apex CRM uses **SQLite** saving data to a local file (`crm.sqlite`). This allows you to run the application immediately without installing, configuring, or running separate database servers.

### 1. Install Dependencies
Make sure you have Node.js installed. Open your terminal in the project directory and install the packages:
```bash
npm install
```

### 2. Start the Server
Run the Express application server:
```bash
npm start
```
*For development hot-reloading (using nodemon):*
```bash
npm run dev
```

### 3. Open in Browser
- **Admin Dashboard**: Open [http://localhost:5000/index.html](http://localhost:5000/index.html)
  - *Default Credentials*:
    - **Username**: `admin`
    - **Password**: `admin123`
- **Customer Contact Form (Lead Intake Demo)**: Open [http://localhost:5000/contact.html](http://localhost:5000/contact.html)
  - Fill out the form, click submit, and watch the lead appear instantly in the CRM admin panel!

---

## Configuration (`.env`)

Configure databases or port flags inside the `.env` file at the root of the project:

```env
# Server Port
PORT=5000

# Session Cryptography Secret
JWT_SECRET=crm_super_secret_session_token_key_2026

# Database Type: sqlite | mongodb | mysql
DB_TYPE=sqlite

# Default admin seeding credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# MongoDB Connection String (Required if DB_TYPE=mongodb)
MONGODB_URI=mongodb://localhost:27017/crm_leads

# MySQL Connection Details (Required if DB_TYPE=mysql)
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=password
MYSQL_DATABASE=crm_leads
```

### Changing Database Engine
1. Set `DB_TYPE` to your desired option (`sqlite`, `mongodb`, or `mysql`).
2. Provide the corresponding connection details in `.env`.
3. Restart the server (`npm start`). The database adapter will connect, synchronize schemas, and seed the default admin account.

---

## Automated Verification Suite

To run the automated backend adapter checks:
```bash
node test-api.js
```
This tests:
1. Database initialization and sync.
2. Credentials cryptography verification.
3. Client lead creation.
4. Search, filters, and query indexes.
5. timeline logs appending.
6. Pipeline stage transitions.
7. KPI aggregations and dashboard stats.
8. Deletion sanitization.

---

## Connecting Your Website Forms

To forward client leads to this CRM:
1. Ensure your form matches the schema: `name`, `email`, `phone`, `company`, `source`, `message`.
2. Issue an asynchronous `POST` request to `http://localhost:5000/api/public/leads` with a JSON payload.
3. Review the complete code structure in the **Integrations** tab inside the Admin Dashboard.
