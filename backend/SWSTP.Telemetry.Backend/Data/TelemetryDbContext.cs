using System;
using Microsoft.EntityFrameworkCore;
using SWSTP.Telemetry.Backend.Models;

namespace SWSTP.Telemetry.Backend.Data
{
    public class TelemetryDbContext : DbContext
    {
        public TelemetryDbContext(DbContextOptions<TelemetryDbContext> options)
            : base(options)
        {
        }

        // Master & Registry Entities
        public DbSet<UlbRegistry> UlbRegistry => Set<UlbRegistry>();
        public DbSet<DeviceRegistry> DeviceRegistry => Set<DeviceRegistry>();
        public DbSet<VehicleRegistry> VehicleRegistry => Set<VehicleRegistry>();
        public DbSet<DeviceVehicleAssignment> DeviceVehicleAssignments => Set<DeviceVehicleAssignment>();

        // Domain State & Audit Entities
        public DbSet<StateDefinition> StateDefinitions => Set<StateDefinition>();
        public DbSet<EntityStateTransition> EntityStateTransitions => Set<EntityStateTransition>();
        public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

        // GIS Master & Versioned Road Entities
        public DbSet<Road> Roads => Set<Road>();
        public DbSet<RoadGeometryVersion> RoadGeometryVersions => Set<RoadGeometryVersion>();
        public DbSet<RoadSegment> RoadSegments => Set<RoadSegment>();
        public DbSet<House> Houses => Set<House>();
        public DbSet<SafeZone> SafeZones => Set<SafeZone>();

        // Operational Mission & Evidence Entities
        public DbSet<OperationalSession> OperationalSessions => Set<OperationalSession>();
        public DbSet<SessionRoadAssignment> SessionRoadAssignments => Set<SessionRoadAssignment>();
        public DbSet<CollectionEvent> CollectionEvents => Set<CollectionEvent>();
        public DbSet<EvidenceImage> EvidenceImages => Set<EvidenceImage>();
        public DbSet<CollectionEventHouse> CollectionEventHouses => Set<CollectionEventHouse>();

        // Continuous Raw Telemetry Entities
        public DbSet<TelemetrySession> TelemetrySessions => Set<TelemetrySession>();
        public DbSet<TelemetryPacket> TelemetryPackets => Set<TelemetryPacket>();
        public DbSet<ImuSample> ImuSamples => Set<ImuSample>();
        public DbSet<GnssSample> GnssSamples => Set<GnssSample>();
        public DbSet<GnssSatelliteObservation> GnssSatelliteObservations => Set<GnssSatelliteObservation>();
        public DbSet<GnssEvent> GnssEvents => Set<GnssEvent>();
        public DbSet<SystemEvent> SystemEvents => Set<SystemEvent>();
        public DbSet<OperationalAlert> OperationalAlerts => Set<OperationalAlert>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // =========================================================================
            // 1. STATE DEFINITIONS & TRANSITIONS
            // =========================================================================
            modelBuilder.Entity<StateDefinition>()
                .HasIndex(s => new { s.EntityType, s.StateCode })
                .IsUnique()
                .HasDatabaseName("UQ_StateDefinitions_EntityType_StateCode");

            modelBuilder.Entity<EntityStateTransition>()
                .HasIndex(t => new { t.EntityType, t.EntityId, t.ChangedAt })
                .HasDatabaseName("IX_EntityStateTransitions_Entity_ChangedAt");

            modelBuilder.Entity<EntityStateTransition>()
                .HasOne(t => t.PreviousStateDefinition)
                .WithMany()
                .HasForeignKey(t => t.PreviousStateDefinitionId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<EntityStateTransition>()
                .HasOne(t => t.NewStateDefinition)
                .WithMany()
                .HasForeignKey(t => t.NewStateDefinitionId)
                .OnDelete(DeleteBehavior.Restrict);

            // =========================================================================
            // 2. AUDIT LOGS
            // =========================================================================
            modelBuilder.Entity<AuditLog>()
                .HasIndex(a => new { a.UlbId, a.PerformedAt })
                .HasDatabaseName("IX_AuditLogs_UlbId_PerformedAt");

            modelBuilder.Entity<AuditLog>()
                .HasIndex(a => new { a.EntityType, a.EntityId, a.PerformedAt })
                .HasDatabaseName("IX_AuditLogs_Entity_PerformedAt");

            modelBuilder.Entity<AuditLog>()
                .HasOne(a => a.Ulb)
                .WithMany(u => u.AuditLogs)
                .HasForeignKey(a => a.UlbId)
                .OnDelete(DeleteBehavior.SetNull);

            // =========================================================================
            // 3. DEVICE & VEHICLE REGISTRIES
            // =========================================================================
            modelBuilder.Entity<DeviceRegistry>()
                .HasIndex(d => d.DeviceCode)
                .IsUnique()
                .HasDatabaseName("UQ_DeviceRegistry_DeviceCode");

            modelBuilder.Entity<DeviceRegistry>()
                .HasOne(d => d.StatusStateDefinition)
                .WithMany()
                .HasForeignKey(d => d.StatusStateDefinitionId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<VehicleRegistry>()
                .HasIndex(v => v.VehicleRegistrationNumber)
                .IsUnique()
                .HasDatabaseName("UQ_VehicleRegistry_RegNumber");

            modelBuilder.Entity<VehicleRegistry>()
                .HasIndex(v => v.UlbId)
                .HasDatabaseName("IX_VehicleRegistry_UlbId");

            modelBuilder.Entity<VehicleRegistry>()
                .HasOne(v => v.Ulb)
                .WithMany(u => u.Vehicles)
                .HasForeignKey(v => v.UlbId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<VehicleRegistry>()
                .HasOne(v => v.StatusStateDefinition)
                .WithMany()
                .HasForeignKey(v => v.StatusStateDefinitionId)
                .OnDelete(DeleteBehavior.Restrict);

            // DeviceVehicleAssignment: Filtered Unique Index (Only 1 Active Assignment per Device / Vehicle)
            modelBuilder.Entity<DeviceVehicleAssignment>()
                .HasIndex(a => a.DeviceId)
                .IsUnique()
                .HasFilter("[IsActive] = 1")
                .HasDatabaseName("UX_DeviceVehicleAssignment_OneActivePerDevice");

            modelBuilder.Entity<DeviceVehicleAssignment>()
                .HasIndex(a => a.VehicleId)
                .IsUnique()
                .HasFilter("[IsActive] = 1")
                .HasDatabaseName("UX_DeviceVehicleAssignment_OneActivePerVehicle");

            modelBuilder.Entity<DeviceVehicleAssignment>()
                .HasOne(a => a.Device)
                .WithMany(d => d.Assignments)
                .HasForeignKey(a => a.DeviceId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<DeviceVehicleAssignment>()
                .HasOne(a => a.Vehicle)
                .WithMany(v => v.Assignments)
                .HasForeignKey(a => a.VehicleId)
                .OnDelete(DeleteBehavior.Restrict);

            // =========================================================================
            // 4. GIS MASTER TABLES: ROADS, GEOMETRY VERSIONS, SEGMENTS, HOUSES
            // =========================================================================
            modelBuilder.Entity<Road>()
                .HasIndex(r => new { r.UlbId, r.RoadCode })
                .IsUnique()
                .HasDatabaseName("UQ_Roads_UlbId_RoadCode");

            modelBuilder.Entity<Road>()
                .HasOne(r => r.Ulb)
                .WithMany(u => u.Roads)
                .HasForeignKey(r => r.UlbId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<RoadGeometryVersion>()
                .HasIndex(rg => new { rg.RoadId, rg.VersionNumber })
                .IsUnique()
                .HasDatabaseName("UQ_RoadGeometryVersions_Road_Version");

            modelBuilder.Entity<RoadGeometryVersion>()
                .Property(rg => rg.Geometry)
                .HasColumnType("geography");

            modelBuilder.Entity<RoadGeometryVersion>()
                .HasOne(rg => rg.Road)
                .WithMany(r => r.GeometryVersions)
                .HasForeignKey(rg => rg.RoadId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<RoadSegment>()
                .HasIndex(rs => new { rs.RoadId, rs.Sequence })
                .HasDatabaseName("IX_RoadSegments_Road_Sequence");

            modelBuilder.Entity<RoadSegment>()
                .HasIndex(rs => rs.RoadGeometryVersionId)
                .HasDatabaseName("IX_RoadSegments_RoadGeometryVersionId");

            modelBuilder.Entity<RoadSegment>()
                .Property(rs => rs.Geometry)
                .HasColumnType("geography");

            modelBuilder.Entity<RoadSegment>()
                .HasOne(rs => rs.Road)
                .WithMany(r => r.Segments)
                .HasForeignKey(rs => rs.RoadId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<RoadSegment>()
                .HasOne(rs => rs.RoadGeometryVersion)
                .WithMany(rg => rg.Segments)
                .HasForeignKey(rs => rs.RoadGeometryVersionId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<House>()
                .HasIndex(h => new { h.UlbId, h.IsActive })
                .HasDatabaseName("IX_Houses_UlbId_IsActive");

            modelBuilder.Entity<House>()
                .Property(h => h.Location)
                .HasColumnType("geography");

            modelBuilder.Entity<House>()
                .HasOne(h => h.Ulb)
                .WithMany(u => u.Houses)
                .HasForeignKey(h => h.UlbId)
                .OnDelete(DeleteBehavior.Restrict);

            // =========================================================================
            // 5. OPERATIONAL SESSIONS & ROAD ASSIGNMENTS
            // =========================================================================
            modelBuilder.Entity<OperationalSession>()
                .HasIndex(os => os.SessionCode)
                .IsUnique()
                .HasDatabaseName("UQ_OperationalSessions_SessionCode");

            // Filtered unique index: One active reservation per vehicle (covers ACTIVE and PAUSED)
            modelBuilder.Entity<OperationalSession>()
                .HasIndex(os => os.VehicleId)
                .IsUnique()
                .HasFilter("[IsActiveReservation] = 1")
                .HasDatabaseName("UX_OperationalSession_OneActiveReservationPerVehicle");

            modelBuilder.Entity<OperationalSession>()
                .HasIndex(os => new { os.UlbId, os.StatusStateDefinitionId, os.ScheduledStartAt })
                .HasDatabaseName("IX_OperationalSessions_Ulb_Status_Scheduled");

            modelBuilder.Entity<OperationalSession>()
                .HasOne(os => os.Ulb)
                .WithMany(u => u.OperationalSessions)
                .HasForeignKey(os => os.UlbId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<OperationalSession>()
                .HasOne(os => os.Vehicle)
                .WithMany(v => v.OperationalSessions)
                .HasForeignKey(os => os.VehicleId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<OperationalSession>()
                .HasOne(os => os.StatusStateDefinition)
                .WithMany()
                .HasForeignKey(os => os.StatusStateDefinitionId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<SessionRoadAssignment>()
                .HasIndex(sra => new { sra.OperationalSessionId, sra.AssignedOrder })
                .HasDatabaseName("IX_SessionRoadAssignments_Session_Order");

            modelBuilder.Entity<SessionRoadAssignment>()
                .Property(sra => sra.AssignedGeometry)
                .HasColumnType("geography");

            modelBuilder.Entity<SessionRoadAssignment>()
                .HasOne(sra => sra.OperationalSession)
                .WithMany(os => os.RoadAssignments)
                .HasForeignKey(sra => sra.OperationalSessionId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<SessionRoadAssignment>()
                .HasOne(sra => sra.Road)
                .WithMany(r => r.SessionAssignments)
                .HasForeignKey(sra => sra.RoadId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<SessionRoadAssignment>()
                .HasOne(sra => sra.RoadSegment)
                .WithMany(rs => rs.SessionAssignments)
                .HasForeignKey(sra => sra.RoadSegmentId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<SessionRoadAssignment>()
                .HasOne(sra => sra.RoadGeometryVersion)
                .WithMany(rg => rg.SessionAssignments)
                .HasForeignKey(sra => sra.RoadGeometryVersionId)
                .OnDelete(DeleteBehavior.Restrict);

            // =========================================================================
            // 6. COLLECTION EVENTS, EVIDENCE IMAGES & HOUSE ASSOCIATIONS
            // =========================================================================
            modelBuilder.Entity<CollectionEvent>()
                .HasIndex(ce => new { ce.OperationalSessionId, ce.CapturedAt })
                .HasDatabaseName("IX_CollectionEvents_Session_CapturedAt");

            modelBuilder.Entity<CollectionEvent>()
                .HasIndex(ce => new { ce.VehicleId, ce.CapturedAt })
                .HasDatabaseName("IX_CollectionEvents_Vehicle_CapturedAt");

            modelBuilder.Entity<CollectionEvent>()
                .HasIndex(ce => ce.SessionRoadAssignmentId)
                .HasDatabaseName("IX_CollectionEvents_SessionRoadAssignmentId");

            modelBuilder.Entity<CollectionEvent>()
                .Property(ce => ce.Location)
                .HasColumnType("geography");

            modelBuilder.Entity<CollectionEvent>()
                .HasOne(ce => ce.OperationalSession)
                .WithMany(os => os.CollectionEvents)
                .HasForeignKey(ce => ce.OperationalSessionId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<CollectionEvent>()
                .HasOne(ce => ce.SessionRoadAssignment)
                .WithMany(sra => sra.CollectionEvents)
                .HasForeignKey(ce => ce.SessionRoadAssignmentId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<CollectionEvent>()
                .HasOne(ce => ce.Vehicle)
                .WithMany()
                .HasForeignKey(ce => ce.VehicleId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<CollectionEvent>()
                .HasOne(ce => ce.StatusStateDefinition)
                .WithMany()
                .HasForeignKey(ce => ce.StatusStateDefinitionId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<EvidenceImage>()
                .HasIndex(ei => ei.CollectionEventId)
                .HasDatabaseName("IX_EvidenceImages_CollectionEventId");

            modelBuilder.Entity<EvidenceImage>()
                .HasIndex(ei => ei.IdempotencyKey)
                .HasDatabaseName("IX_EvidenceImages_IdempotencyKey")
                .HasFilter("[IdempotencyKey] IS NOT NULL");

            modelBuilder.Entity<EvidenceImage>()
                .HasIndex(ei => new { ei.ExpiresAt, ei.DeletedAt })
                .HasDatabaseName("IX_EvidenceImages_ExpiresAt_DeletedAt");

            modelBuilder.Entity<EvidenceImage>()
                .HasOne(ei => ei.CollectionEvent)
                .WithMany(ce => ce.EvidenceImages)
                .HasForeignKey(ei => ei.CollectionEventId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<CollectionEventHouse>()
                .HasIndex(ceh => ceh.CollectionEventId)
                .HasDatabaseName("IX_CollectionEventHouses_CollectionEventId");

            modelBuilder.Entity<CollectionEventHouse>()
                .HasIndex(ceh => ceh.HouseId)
                .HasDatabaseName("IX_CollectionEventHouses_HouseId");

            modelBuilder.Entity<CollectionEventHouse>()
                .HasOne(ceh => ceh.CollectionEvent)
                .WithMany(ce => ce.ImpactedHouses)
                .HasForeignKey(ceh => ceh.CollectionEventId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<CollectionEventHouse>()
                .HasOne(ceh => ceh.House)
                .WithMany(h => h.CollectionEvents)
                .HasForeignKey(ceh => ceh.HouseId)
                .OnDelete(DeleteBehavior.Restrict);

            // =========================================================================
            // 7. CONTINUOUS RAW TELEMETRY (PRESERVED UNTOUCHED)
            // =========================================================================
            modelBuilder.Entity<TelemetrySession>()
                .HasOne(s => s.Device)
                .WithMany(d => d.TelemetrySessions)
                .HasForeignKey(s => s.DeviceId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<TelemetrySession>()
                .HasOne(s => s.Assignment)
                .WithMany(a => a.TelemetrySessions)
                .HasForeignKey(s => s.AssignmentId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<TelemetryPacket>()
                .HasAlternateKey(p => new { p.SessionId, p.SequenceNumber })
                .HasName("UQ_TelemetryPackets_Session_Sequence");

            modelBuilder.Entity<ImuSample>()
                .HasOne<TelemetryPacket>()
                .WithMany()
                .HasPrincipalKey(p => new { p.SessionId, p.SequenceNumber })
                .HasForeignKey(i => new { i.SessionId, i.SequenceNumber })
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<GnssSample>()
                .HasOne<TelemetryPacket>()
                .WithMany()
                .HasPrincipalKey(p => new { p.SessionId, p.SequenceNumber })
                .HasForeignKey(g => new { g.SessionId, g.SequenceNumber })
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<GnssSatelliteObservation>()
                .HasOne<TelemetryPacket>()
                .WithMany()
                .HasPrincipalKey(p => new { p.SessionId, p.SequenceNumber })
                .HasForeignKey(s => new { s.SessionId, s.SequenceNumber })
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<TelemetrySession>()
                .HasIndex(s => new { s.Mode, s.StartedAt })
                .HasDatabaseName("IX_TelemetrySessions_Mode_StartedAt");

            modelBuilder.Entity<TelemetryPacket>()
                .HasIndex(p => new { p.SessionId, p.SequenceNumber })
                .HasDatabaseName("IX_TelemetryPackets_Session_Sequence");

            modelBuilder.Entity<ImuSample>()
                .HasIndex(i => new { i.SessionId, i.Timestamp })
                .HasDatabaseName("IX_ImuSamples_Session_Timestamp")
                .IncludeProperties(i => new { i.AccelX, i.AccelY, i.AccelZ, i.GyroX, i.GyroY, i.GyroZ, i.Roll, i.Pitch, i.Yaw });

            modelBuilder.Entity<GnssSample>()
                .HasIndex(g => new { g.SessionId, g.FixValid, g.Timestamp })
                .HasDatabaseName("IX_GnssSamples_Session_Fix_Timestamp")
                .IncludeProperties(g => new { g.Latitude, g.Longitude, g.AltitudeM, g.SpeedKmh, g.CourseDeg });

            modelBuilder.Entity<GnssSatelliteObservation>()
                .HasIndex(s => new { s.SessionId, s.Constellation, s.Prn, s.ObservedAt })
                .HasDatabaseName("IX_GnssSatelliteObservations_Session_PRN")
                .IncludeProperties(s => new { s.ElevationDeg, s.AzimuthDeg, s.SnrDbHz, s.UsedInFix });

            modelBuilder.Entity<GnssSatelliteObservation>()
                .HasIndex(s => new { s.SessionId, s.GsvSeq })
                .HasDatabaseName("IX_GnssSatelliteObservations_Session_GsvSeq");

            // =========================================================================
            // 8. SEED DATA: STATE DEFINITIONS CATALOG (FOUR DOMAIN ENTITIES ONLY)
            // =========================================================================
            var seedDate = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

            modelBuilder.Entity<StateDefinition>().HasData(
                // DEVICE Lifecycle States
                new StateDefinition { StateDefinitionId = 1,  EntityType = "DEVICE", StateCode = "INVENTORY",       DisplayName = "In Inventory",       Description = "Unassigned hardware in storage",                      IsTerminal = false, IsActive = true, SortOrder = 1, CreatedAt = seedDate },
                new StateDefinition { StateDefinitionId = 2,  EntityType = "DEVICE", StateCode = "PROVISIONED",     DisplayName = "Provisioned",        Description = "Assigned to vehicle, awaiting installation",          IsTerminal = false, IsActive = true, SortOrder = 2, CreatedAt = seedDate },
                new StateDefinition { StateDefinitionId = 3,  EntityType = "DEVICE", StateCode = "IN_SERVICE",      DisplayName = "In Service",         Description = "Active in field and transmitting telemetry",          IsTerminal = false, IsActive = true, SortOrder = 3, CreatedAt = seedDate },
                new StateDefinition { StateDefinitionId = 4,  EntityType = "DEVICE", StateCode = "MAINTENANCE",     DisplayName = "Maintenance",        Description = "Under diagnostic inspection or repair",               IsTerminal = false, IsActive = true, SortOrder = 4, CreatedAt = seedDate },
                new StateDefinition { StateDefinitionId = 5,  EntityType = "DEVICE", StateCode = "DISABLED",        DisplayName = "Disabled",           Description = "Temporarily disabled by operator",                    IsTerminal = false, IsActive = true, SortOrder = 5, CreatedAt = seedDate },
                new StateDefinition { StateDefinitionId = 6,  EntityType = "DEVICE", StateCode = "RETIRED",         DisplayName = "Retired",            Description = "Decommissioned from municipal inventory",              IsTerminal = true,  IsActive = true, SortOrder = 6, CreatedAt = seedDate },

                // VEHICLE Lifecycle States
                new StateDefinition { StateDefinitionId = 10, EntityType = "VEHICLE", StateCode = "IN_SERVICE",     DisplayName = "In Service",         Description = "Operational vehicle available for missions",          IsTerminal = false, IsActive = true, SortOrder = 1, CreatedAt = seedDate },
                new StateDefinition { StateDefinitionId = 11, EntityType = "VEHICLE", StateCode = "MAINTENANCE",    DisplayName = "Maintenance",        Description = "In garage workshop for repair/service",                IsTerminal = false, IsActive = true, SortOrder = 2, CreatedAt = seedDate },
                new StateDefinition { StateDefinitionId = 12, EntityType = "VEHICLE", StateCode = "SUSPENDED",      DisplayName = "Suspended",          Description = "Temporarily barred from municipal route",             IsTerminal = false, IsActive = true, SortOrder = 3, CreatedAt = seedDate },
                new StateDefinition { StateDefinitionId = 13, EntityType = "VEHICLE", StateCode = "DECOMMISSIONED", DisplayName = "Decommissioned",     Description = "Retired permanently from municipal fleet",             IsTerminal = true,  IsActive = true, SortOrder = 4, CreatedAt = seedDate },

                // OPERATIONAL_SESSION Lifecycle States
                new StateDefinition { StateDefinitionId = 20, EntityType = "OPERATIONAL_SESSION", StateCode = "SCHEDULED", DisplayName = "Scheduled",      Description = "Planned for future time window",                       IsTerminal = false, IsActive = true, SortOrder = 1, CreatedAt = seedDate },
                new StateDefinition { StateDefinitionId = 21, EntityType = "OPERATIONAL_SESSION", StateCode = "ACTIVE",    DisplayName = "Mission Active", Description = "In field execution, vehicle reserved",                 IsTerminal = false, IsActive = true, SortOrder = 2, CreatedAt = seedDate },
                new StateDefinition { StateDefinitionId = 22, EntityType = "OPERATIONAL_SESSION", StateCode = "PAUSED",    DisplayName = "Mission Paused", Description = "Temporarily paused in field, vehicle remains reserved",IsTerminal = false, IsActive = true, SortOrder = 3, CreatedAt = seedDate },
                new StateDefinition { StateDefinitionId = 23, EntityType = "OPERATIONAL_SESSION", StateCode = "COMPLETED", DisplayName = "Completed",      Description = "Mission finished within schedule",                     IsTerminal = true,  IsActive = true, SortOrder = 4, CreatedAt = seedDate },
                new StateDefinition { StateDefinitionId = 24, EntityType = "OPERATIONAL_SESSION", StateCode = "CANCELLED", DisplayName = "Cancelled",      Description = "Cancelled by officer prior to execution",             IsTerminal = true,  IsActive = true, SortOrder = 5, CreatedAt = seedDate },
                new StateDefinition { StateDefinitionId = 25, EntityType = "OPERATIONAL_SESSION", StateCode = "ABORTED",   DisplayName = "Aborted",        Description = "Terminated early due to emergency or breakdown",      IsTerminal = true,  IsActive = true, SortOrder = 6, CreatedAt = seedDate },

                // COLLECTION_EVENT Lifecycle States
                new StateDefinition { StateDefinitionId = 30, EntityType = "COLLECTION_EVENT", StateCode = "DETECTED",    DisplayName = "Detected",       Description = "Motion detected within road buffer & speed threshold", IsTerminal = false, IsActive = true, SortOrder = 1, CreatedAt = seedDate },
                new StateDefinition { StateDefinitionId = 31, EntityType = "COLLECTION_EVENT", StateCode = "VERIFIED",    DisplayName = "Verified",       Description = "Confirmed solid waste collection",                    IsTerminal = false, IsActive = true, SortOrder = 2, CreatedAt = seedDate },
                new StateDefinition { StateDefinitionId = 32, EntityType = "COLLECTION_EVENT", StateCode = "FLAGGED",     DisplayName = "Flagged",        Description = "Flagged for officer inspection or anomalies",          IsTerminal = false, IsActive = true, SortOrder = 3, CreatedAt = seedDate }
            );
        }
    }
}
