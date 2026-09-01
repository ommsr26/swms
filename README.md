# Solid Waste Management System (SWMS)

Comprehensive IoT Telemetry, Spatial Analytics, and Fleet Monitoring Platform for Municipal Solid Waste Management.

---

## 🏛️ System Overview

The **Solid Waste Management System (SWMS)** provides real-time telemetry processing, vehicle route tracking, spatial road snapping, visual evidence management, and administrative dashboards for municipal solid waste vehicles.

```
swms/
├── SWMS.sln                                     # Visual Studio / Rider solution
├── SWMS.slnx                                    # Modern XML Solution format (.NET 10)
├── .gitignore                                   # Monorepo ignore rules
├── README.md                                    # This onboarding guide
├── SITE_ARCHITECTURE_AND_FUNCTIONING.md        # Detailed technical architecture
├── DATA_PROVENANCE.md                           # Database schemas & data definitions
├── backend/
│   └── SWSTP.Telemetry.Backend/                 # ASP.NET Core 10 Web API + SignalR + EF Core
│       ├── Controllers/                         # REST API endpoints (Sessions, Spatial, Fleet)
│       ├── Data/                                # EF Core DbContext & SQL Server configurations
│       ├── Hubs/                                # SignalR real-time telemetry hubs
│       ├── Models/                              # Domain & operational entities
│       ├── Services/                            # Spatial road snapping, evidence, sessions
│       ├── appsettings.json                     # Environment configuration
│       ├── appsettings.Example.json             # Configuration template
│       └── migration_script.sql                 # SQL schema creation & migrations
├── swstp/                                       # Frontend Dashboard (React 19 + Vite)
│   ├── .env.example                             # Frontend environment template
│   ├── src/                                     # Components, 3D IMU, Leaflet map, telemetry stores
│   └── package.json                             # Dependencies and scripts
└── tests/
    └── SWSTP.Telemetry.Backend.Tests/           # xUnit test suite
```

---

## 🚀 Quickstart for Developers & Collaborators

### 1. Prerequisites
Ensure you have the following installed:
- **[.NET 10 SDK](https://dotnet.microsoft.com/download)** (or .NET 8+)
- **[Node.js 18+](https://nodejs.org/)** & npm
- **[Microsoft SQL Server](https://www.microsoft.com/sql-server)** (Express or Developer Edition)
- Recommended IDEs: Visual Studio 2022 / JetBrains Rider / VS Code (with C# Dev Kit)

---

### 2. Clone the Repository
```bash
git clone https://github.com/ommsr26/swms.git
cd swms
```

---

### 3. Backend Setup & Run

#### A. Database Configuration
1. In `backend/SWSTP.Telemetry.Backend/appsettings.json`, configure your SQL Server connection string under `ConnectionStrings:DefaultConnection`:
   ```json
   "ConnectionStrings": {
     "DefaultConnection": "Server=localhost;Database=Solid_Waste;Integrated Security=True;TrustServerCertificate=True;"
   }
   ```
2. Execute `backend/SWSTP.Telemetry.Backend/migration_script.sql` in SQL Server Management Studio (SSMS) or via sqlcmd:
   ```bash
   sqlcmd -S localhost -d master -i backend/SWSTP.Telemetry.Backend/migration_script.sql
   ```
   *(Alternatively, run `dotnet ef database update` inside the backend directory)*.

#### B. Run the API
You can open `SWMS.sln` in Visual Studio and press **F5**, or run from command line:
```bash
cd backend/SWSTP.Telemetry.Backend
dotnet run
```
- API will start on: **`http://localhost:5000`**
- Swagger documentation: **`http://localhost:5000/swagger`**
- SignalR Hub: **`http://localhost:5000/hubs/telemetry`**

---

### 4. Frontend Setup & Run

1. Navigate to the frontend directory:
   ```bash
   cd swstp
   ```
2. Configure environment:
   ```bash
   cp .env.example .env.development
   ```
   *(By default, `.env.development` points to `http://localhost:5000/api`)*.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
5. Open your browser at **`http://localhost:5173`**.

---

### 5. Running Automated Tests

Run the full xUnit test suite from the repository root:
```bash
dotnet test SWMS.sln
```

---

## 🛰️ Key Features

- **Real-Time Telemetry & Hardware**: SignalR telemetry streams, Web Serial API (baud rate 115200) for edge devices, 3D IMU orientation viewer.
- **GIS & Fleet Mapping**: Dynamic Leaflet maps, 3D satellite visualization, projected coordinates (UTM Zone 43N/44N via ProjNET & NetTopologySuite).
- **Session & Road Assignment**: Automated trip detection, buffer zone calculations, and road segment coverage audits.
- **Evidence Management**: Image capture storage and audit trail for waste collection confirmation.

---

## 👥 Collaboration & Permissions

If you are a team member and unable to clone or push:
1. Verify you have accepted the GitHub invitation under [GitHub Repo Collaborators](https://github.com/ommsr26/swms).
2. Configure your Git identity locally:
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "your.email@example.com"
   ```
