using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using NetTopologySuite.Geometries;
using SWSTP.Telemetry.Backend.Models;

namespace SWSTP.Telemetry.Backend.Data
{
    public static class DbGisSeeder
    {
        private static readonly GeometryFactory _wgs84Factory = new(new PrecisionModel(), 4326);

        public static async Task SeedAsync(IServiceProvider services)
        {
            using var scope = services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();
            var logger = scope.ServiceProvider.GetRequiredService<ILogger<TelemetryDbContext>>();

            try
            {
                const string ulbId = "ULB_MH_AMRAVATI";

                // 1. Ensure Amravati ULB exists and has the requested 20m Safe Zone Depot
                var ulb = await db.UlbRegistry.FirstOrDefaultAsync(u => u.UlbId == ulbId);
                if (ulb == null)
                {
                    ulb = new UlbRegistry
                    {
                        UlbId = ulbId,
                        UlbName = "Amravati Municipal Corporation",
                        SafeZoneLatitude = 20.928816,
                        SafeZoneLongitude = 77.7514375,
                        SafeZoneRadiusMeters = 20,
                        CreatedAt = DateTime.UtcNow
                    };
                    db.UlbRegistry.Add(ulb);
                }
                else
                {
                    ulb.SafeZoneLatitude = 20.928816;
                    ulb.SafeZoneLongitude = 77.7514375;
                    ulb.SafeZoneRadiusMeters = 20;
                }
                await db.SaveChangesAsync();

                // Position idle vehicles inside this 20m Safe Zone Depot
                var vehicles = await db.VehicleRegistry.Where(v => v.UlbId == ulbId).ToListAsync();
                foreach (var v in vehicles)
                {
                    v.LastKnownLatitude = 20.928816;
                    v.LastKnownLongitude = 77.7514375;
                }
                await db.SaveChangesAsync();

                // 1b. Ensure SafeZones table exists in SQL database
                await db.Database.ExecuteSqlRawAsync(@"
                    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SafeZones')
                    BEGIN
                        CREATE TABLE [SafeZones] (
                            [SafeZoneId] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                            [UlbId] NVARCHAR(50) NOT NULL,
                            [Name] NVARCHAR(200) NOT NULL,
                            [Latitude] FLOAT NOT NULL,
                            [Longitude] FLOAT NOT NULL,
                            [RadiusMeters] FLOAT NOT NULL DEFAULT 1000.0,
                            [IsActive] BIT NOT NULL DEFAULT 1,
                            [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
                            [UpdatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
                        );
                    END

                    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('GnssSamples') AND name = 'RawLatitude')
                    BEGIN
                        ALTER TABLE [GnssSamples] ADD [RawLatitude] FLOAT NULL;
                        ALTER TABLE [GnssSamples] ADD [RawLongitude] FLOAT NULL;
                        ALTER TABLE [GnssSamples] ADD [DisplayLatitude] FLOAT NULL;
                        ALTER TABLE [GnssSamples] ADD [DisplayLongitude] FLOAT NULL;
                        ALTER TABLE [GnssSamples] ADD [IsInsideSafeZone] BIT NOT NULL DEFAULT 0;
                        ALTER TABLE [GnssSamples] ADD [IsSnapped] BIT NOT NULL DEFAULT 0;
                    END

                    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OperationalAlerts')
                    BEGIN
                        CREATE TABLE [OperationalAlerts] (
                            [AlertId] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
                            [UlbId] NVARCHAR(50) NOT NULL,
                            [VehicleId] BIGINT NULL,
                            [VehicleRegistrationNumber] NVARCHAR(50) NULL,
                            [OperationalSessionId] BIGINT NULL,
                            [AlertType] NVARCHAR(50) NOT NULL,
                            [Severity] NVARCHAR(20) NOT NULL DEFAULT 'WARNING',
                            [Status] NVARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
                            [Message] NVARCHAR(500) NOT NULL,
                            [ContextJson] NVARCHAR(MAX) NULL,
                            [DeduplicationKey] NVARCHAR(100) NOT NULL,
                            [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
                            [ResolvedAt] DATETIME2 NULL,
                            [LastEvaluatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
                            [IsAcknowledged] BIT NOT NULL DEFAULT 0,
                            [AcknowledgedAt] DATETIME2 NULL,
                            [AcknowledgedBy] NVARCHAR(100) NULL
                        );
                    END
                ");

                // Populate SafeZones table dynamically
                var amravatiSafeZone = await db.SafeZones.FirstOrDefaultAsync(s => s.UlbId == "ULB_MH_AMRAVATI");
                if (amravatiSafeZone == null)
                {
                    db.SafeZones.Add(new SafeZone
                    {
                        UlbId = "ULB_MH_AMRAVATI",
                        Name = "Amravati Central Municipal Depot / Garage",
                        Latitude = 20.928816,
                        Longitude = 77.7514375,
                        RadiusMeters = 1000.0,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    });
                }

                var nagpurSafeZone = await db.SafeZones.FirstOrDefaultAsync(s => s.UlbId == "ULB_MH_NAGPUR");
                if (nagpurSafeZone == null)
                {
                    db.SafeZones.Add(new SafeZone
                    {
                        UlbId = "ULB_MH_NAGPUR",
                        Name = "Nagpur NMC Central Fleet Yard",
                        Latitude = 21.145800,
                        Longitude = 79.088200,
                        RadiusMeters = 1000.0,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    });
                }
                await db.SaveChangesAsync();

                // Ensure SWSTP-EDGE-01 device exists and is assigned to the active vehicle
                var edgeDevice = await db.DeviceRegistry.FirstOrDefaultAsync(d => d.DeviceCode == "SWSTP-EDGE-01");
                if (edgeDevice == null)
                {
                    edgeDevice = new DeviceRegistry
                    {
                        DeviceCode = "SWSTP-EDGE-01",
                        HardwareVersion = "REV_2.1_AVR",
                        FirmwareVersion = "v2.4.0",
                        RegisteredAt = DateTime.UtcNow,
                        LastSeenAt = DateTime.UtcNow,
                        IsActive = true
                    };
                    db.DeviceRegistry.Add(edgeDevice);
                    await db.SaveChangesAsync();
                }

                // Ensure SWSTP-AMRMC-002 device exists in ULB Amravati
                var amrmc002 = await db.DeviceRegistry.FirstOrDefaultAsync(d => d.DeviceCode == "SWSTP-AMRMC-002");
                if (amrmc002 == null)
                {
                    amrmc002 = new DeviceRegistry
                    {
                        DeviceCode = "SWSTP-AMRMC-002",
                        HardwareVersion = "REV_2.1_ESP32_LTE",
                        FirmwareVersion = "v2.5.0",
                        RegisteredAt = DateTime.UtcNow,
                        LastSeenAt = DateTime.UtcNow,
                        IsActive = true
                    };
                    db.DeviceRegistry.Add(amrmc002);
                    await db.SaveChangesAsync();
                }

                // Ensure vehicle MH-27-AM-4002 exists in ULB Amravati
                var vehicleAmr02 = await db.VehicleRegistry.FirstOrDefaultAsync(v => v.VehicleRegistrationNumber == "MH-27-AM-4002");
                if (vehicleAmr02 == null)
                {
                    vehicleAmr02 = new VehicleRegistry
                    {
                        VehicleRegistrationNumber = "MH-27-AM-4002",
                        VehicleType = "TIPPER_TRUCK",
                        UlbId = "ULB_MH_AMRAVATI",
                        UlbName = "Amravati Municipal Corporation",
                        Status = "ACTIVE",
                        LastKnownLatitude = 20.955845,
                        LastKnownLongitude = 77.764415,
                        LastKnownSpeedKmh = 14.5,
                        LastKnownHeadingDeg = 68.0,
                        LastKnownTimestamp = DateTime.UtcNow,
                        RegisteredAt = DateTime.UtcNow
                    };
                    db.VehicleRegistry.Add(vehicleAmr02);
                    await db.SaveChangesAsync();
                }

                // Ensure vehicle MH-27-AM-4001 exists in ULB Amravati
                var vehicleAmr01 = await db.VehicleRegistry.FirstOrDefaultAsync(v => v.VehicleRegistrationNumber == "MH-27-AM-4001");
                if (vehicleAmr01 == null)
                {
                    vehicleAmr01 = new VehicleRegistry
                    {
                        VehicleRegistrationNumber = "MH-27-AM-4001",
                        VehicleType = "COMPACTOR",
                        UlbId = "ULB_MH_AMRAVATI",
                        UlbName = "Amravati Municipal Corporation",
                        Status = "ACTIVE",
                        LastKnownLatitude = 20.928816,
                        LastKnownLongitude = 77.7514375,
                        LastKnownSpeedKmh = 0.0,
                        LastKnownHeadingDeg = 0.0,
                        LastKnownTimestamp = DateTime.UtcNow,
                        RegisteredAt = DateTime.UtcNow
                    };
                    db.VehicleRegistry.Add(vehicleAmr01);
                    await db.SaveChangesAsync();
                }

                // Ensure active assignment for SWSTP-AMRMC-002 -> MH-27-AM-4002
                var assign02 = await db.DeviceVehicleAssignments.FirstOrDefaultAsync(a => a.DeviceId == amrmc002.DeviceId && a.IsActive);
                if (assign02 == null)
                {
                    assign02 = new DeviceVehicleAssignment
                    {
                        DeviceId = amrmc002.DeviceId,
                        VehicleId = vehicleAmr02.VehicleId,
                        AssignedAt = DateTime.UtcNow,
                        IsActive = true
                    };
                    db.DeviceVehicleAssignments.Add(assign02);
                    await db.SaveChangesAsync();
                }

                // Ensure active assignment for SWSTP-EDGE-01 -> MH-27-AM-4001
                var assign01 = await db.DeviceVehicleAssignments.FirstOrDefaultAsync(a => a.DeviceId == edgeDevice.DeviceId && a.IsActive);
                if (assign01 == null)
                {
                    assign01 = new DeviceVehicleAssignment
                    {
                        DeviceId = edgeDevice.DeviceId,
                        VehicleId = vehicleAmr01.VehicleId,
                        AssignedAt = DateTime.UtcNow,
                        IsActive = true
                    };
                    db.DeviceVehicleAssignments.Add(assign01);
                    await db.SaveChangesAsync();
                }

                // 2. Exact 2-coordinate straight road linestring
                const string roadCode = "RD-AMR-SDR-001";
                var roadCoords = new[]
                {
                    new Coordinate(77.764415, 20.955845), // Shegaon - Rahatgaon Rd Junction
                    new Coordinate(77.763289, 20.956396)  // Cul-de-sac West end
                };
                var roadLine = _wgs84Factory.CreateLineString(roadCoords);

                var allRoads = await db.Roads
                    .Include(r => r.GeometryVersions)
                    .Include(r => r.Segments)
                    .Where(r => r.UlbId == ulbId)
                    .ToListAsync();

                foreach (var road in allRoads)
                {
                    var geomVersion = road.GeometryVersions?.FirstOrDefault();
                    if (geomVersion == null)
                    {
                        geomVersion = new RoadGeometryVersion
                        {
                            RoadId = road.RoadId,
                            VersionNumber = 1,
                            Geometry = roadLine,
                            EffectiveFrom = DateTime.UtcNow,
                            CreatedAt = DateTime.UtcNow
                        };
                        db.RoadGeometryVersions.Add(geomVersion);
                        await db.SaveChangesAsync();
                    }
                    else
                    {
                        geomVersion.Geometry = roadLine;
                    }

                    var segment = road.Segments?.FirstOrDefault();
                    if (segment == null)
                    {
                        segment = new RoadSegment
                        {
                            RoadId = road.RoadId,
                            RoadGeometryVersionId = geomVersion.RoadGeometryVersionId,
                            SegmentCode = "RD-AMR-SDR-SEG-01",
                            SegmentName = "Siddhivinayak Straight Road Segment",
                            Geometry = roadLine,
                            LengthMeters = 132.0,
                            Sequence = 1,
                            IsActive = true,
                            CreatedAt = DateTime.UtcNow
                        };
                        db.RoadSegments.Add(segment);
                    }
                    else
                    {
                        segment.Geometry = roadLine;
                        segment.LengthMeters = 132.0;
                    }
                    await db.SaveChangesAsync();
                }

                var assignments = await db.SessionRoadAssignments
                    .Include(a => a.OperationalSession)
                    .Where(a => a.OperationalSession != null && a.OperationalSession.UlbId == ulbId)
                    .ToListAsync();
                foreach (var a in assignments)
                {
                    a.AssignedGeometry = roadLine;
                }
                await db.SaveChangesAsync();

                if (allRoads.Count == 0)
                {
                    var newRoad = new Road
                    {
                        UlbId = ulbId,
                        RoadCode = roadCode,
                        RoadName = "Siddhivinayak Nagar Internal Lane (Shegaon-Rahatgaon Branch)",
                        RoadType = "COLLECTOR",
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    };
                    db.Roads.Add(newRoad);
                    await db.SaveChangesAsync();

                    var geomVersion = new RoadGeometryVersion
                    {
                        RoadId = newRoad.RoadId,
                        VersionNumber = 1,
                        Geometry = roadLine,
                        EffectiveFrom = DateTime.UtcNow,
                        CreatedAt = DateTime.UtcNow
                    };
                    db.RoadGeometryVersions.Add(geomVersion);
                    await db.SaveChangesAsync();

                    db.RoadSegments.Add(new RoadSegment
                    {
                        RoadId = newRoad.RoadId,
                        RoadGeometryVersionId = geomVersion.RoadGeometryVersionId,
                        SegmentCode = "RD-AMR-SDR-SEG-01",
                        SegmentName = "Siddhivinayak Straight Road Segment",
                        Geometry = roadLine,
                        LengthMeters = 132.0,
                        Sequence = 1,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow
                    });
                    await db.SaveChangesAsync();
                }

                // 3. 14 Accurately Aligned Houses Matching Google Maps Street Map
                var houseDefinitions = new[]
                {
                    // North-East Side (Above the road)
                    ("H-AMR-01", "COSMO AESTHETIC / Vrushangi Modular", 20.9558016, 77.7642758),
                    ("H-AMR-02", "Ambika Provision / Godrej Interio", 20.9558842, 77.7641069),
                    ("H-AMR-03", "सुनील जयसिंगपुरे (Education center)", 20.9559889, 77.7638930),
                    ("H-AMR-04", "Dr. Kishorsingh Chungade Clinic", 20.9560605, 77.7637466),
                    ("H-AMR-05", "Khond's House", 20.9561282, 77.7635980),
                    ("H-AMR-06", "Residential House (Khond Adjacent)", 20.9561943, 77.7634629),
                    ("H-AMR-07", "Shree Ganesh Apartment", 20.9562564, 77.7633255),

                    // South-West Side (Below the road)
                    ("H-AMR-08", "Wellness MEDeal Generic Pharmacy / Dr DEEPAK KEDAR", 20.9559766, 77.7643740),
                    ("H-AMR-09", "Radhika Fashion / Indrashesh Medicals", 20.9560593, 77.7642051),
                    ("H-AMR-10", "Residential Plot 1", 20.9561419, 77.7640362),
                    ("H-AMR-11", "Residential Plot 2", 20.9562190, 77.7638786),
                    ("H-AMR-12", "Residential Plot 3", 20.9562962, 77.7637210),
                    ("H-AMR-13", "Sthapatya Consultants (I) Pvt.Ltd (XQ47+CF8)", 20.9563773, 77.7635655),
                    ("H-AMR-14", "AMF Project Consultant", 20.9564434, 77.7634304)
                };

                foreach (var (houseId, address, lat, lon) in houseDefinitions)
                {
                    var existingHouse = await db.Houses.FirstOrDefaultAsync(h => h.HouseId == houseId);
                    var point = _wgs84Factory.CreatePoint(new Coordinate(lon, lat));

                    if (existingHouse == null)
                    {
                        db.Houses.Add(new House
                        {
                            HouseId = houseId,
                            UlbId = ulbId,
                            Latitude = lat,
                            Longitude = lon,
                            Location = point,
                            Address = address,
                            IsActive = true,
                            CreatedAt = DateTime.UtcNow
                        });
                    }
                    else
                    {
                        existingHouse.Latitude = lat;
                        existingHouse.Longitude = lon;
                        existingHouse.Location = point;
                        existingHouse.Address = address;
                        existingHouse.IsActive = true;
                        existingHouse.UpdatedAt = DateTime.UtcNow;
                    }
                }

                await db.SaveChangesAsync();
                logger.LogInformation("Seeded straight road and 14 Google Maps aligned houses for Amravati.");
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error occurred during DbGisSeeder execution.");
            }
        }
    }
}
