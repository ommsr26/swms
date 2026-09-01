BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    DROP INDEX [IX_DeviceVehicleAssignment_DeviceId] ON [DeviceVehicleAssignment];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    DROP INDEX [IX_DeviceVehicleAssignment_VehicleId] ON [DeviceVehicleAssignment];
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    ALTER TABLE [VehicleRegistry] ADD [StatusStateDefinitionId] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    ALTER TABLE [DeviceRegistry] ADD [StatusStateDefinitionId] int NULL;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE TABLE [AuditLogs] (
        [AuditLogId] bigint NOT NULL IDENTITY,
        [UlbId] nvarchar(50) NULL,
        [Action] nvarchar(100) NOT NULL,
        [EntityType] nvarchar(50) NOT NULL,
        [EntityId] nvarchar(100) NOT NULL,
        [PerformedBy] nvarchar(100) NOT NULL,
        [PerformedAt] datetime2 NOT NULL,
        [ClientIp] nvarchar(50) NULL,
        [DetailsJson] nvarchar(max) NULL,
        CONSTRAINT [PK_AuditLogs] PRIMARY KEY ([AuditLogId]),
        CONSTRAINT [FK_AuditLogs_ULBRegistry_UlbId] FOREIGN KEY ([UlbId]) REFERENCES [ULBRegistry] ([UlbId]) ON DELETE SET NULL
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE TABLE [Houses] (
        [HouseId] nvarchar(50) NOT NULL,
        [UlbId] nvarchar(50) NOT NULL,
        [Latitude] float NOT NULL,
        [Longitude] float NOT NULL,
        [Location] geography NOT NULL,
        [Address] nvarchar(255) NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NULL,
        CONSTRAINT [PK_Houses] PRIMARY KEY ([HouseId]),
        CONSTRAINT [FK_Houses_ULBRegistry_UlbId] FOREIGN KEY ([UlbId]) REFERENCES [ULBRegistry] ([UlbId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE TABLE [Roads] (
        [RoadId] bigint NOT NULL IDENTITY,
        [UlbId] nvarchar(50) NOT NULL,
        [RoadCode] nvarchar(50) NOT NULL,
        [RoadName] nvarchar(150) NOT NULL,
        [RoadType] nvarchar(50) NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [CreatedBy] nvarchar(100) NULL,
        [UpdatedAt] datetime2 NULL,
        [UpdatedBy] nvarchar(100) NULL,
        CONSTRAINT [PK_Roads] PRIMARY KEY ([RoadId]),
        CONSTRAINT [FK_Roads_ULBRegistry_UlbId] FOREIGN KEY ([UlbId]) REFERENCES [ULBRegistry] ([UlbId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE TABLE [StateDefinitions] (
        [StateDefinitionId] int NOT NULL IDENTITY,
        [EntityType] nvarchar(50) NOT NULL,
        [StateCode] nvarchar(50) NOT NULL,
        [DisplayName] nvarchar(100) NOT NULL,
        [Description] nvarchar(255) NULL,
        [IsTerminal] bit NOT NULL,
        [IsActive] bit NOT NULL,
        [SortOrder] int NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NULL,
        CONSTRAINT [PK_StateDefinitions] PRIMARY KEY ([StateDefinitionId])
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE TABLE [RoadGeometryVersions] (
        [RoadGeometryVersionId] bigint NOT NULL IDENTITY,
        [RoadId] bigint NOT NULL,
        [VersionNumber] int NOT NULL,
        [Geometry] geography NOT NULL,
        [EffectiveFrom] datetime2 NOT NULL,
        [EffectiveTo] datetime2 NULL,
        [CreatedAt] datetime2 NOT NULL,
        [CreatedBy] nvarchar(100) NULL,
        CONSTRAINT [PK_RoadGeometryVersions] PRIMARY KEY ([RoadGeometryVersionId]),
        CONSTRAINT [FK_RoadGeometryVersions_Roads_RoadId] FOREIGN KEY ([RoadId]) REFERENCES [Roads] ([RoadId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE TABLE [EntityStateTransitions] (
        [StateTransitionId] bigint NOT NULL IDENTITY,
        [EntityType] nvarchar(50) NOT NULL,
        [EntityId] nvarchar(100) NOT NULL,
        [PreviousStateDefinitionId] int NULL,
        [NewStateDefinitionId] int NOT NULL,
        [ChangedAt] datetime2 NOT NULL,
        [ChangedBy] nvarchar(100) NULL,
        [Reason] nvarchar(500) NULL,
        [Source] nvarchar(50) NULL,
        CONSTRAINT [PK_EntityStateTransitions] PRIMARY KEY ([StateTransitionId]),
        CONSTRAINT [FK_EntityStateTransitions_StateDefinitions_NewStateDefinitionId] FOREIGN KEY ([NewStateDefinitionId]) REFERENCES [StateDefinitions] ([StateDefinitionId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_EntityStateTransitions_StateDefinitions_PreviousStateDefinitionId] FOREIGN KEY ([PreviousStateDefinitionId]) REFERENCES [StateDefinitions] ([StateDefinitionId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE TABLE [OperationalSessions] (
        [OperationalSessionId] bigint NOT NULL IDENTITY,
        [UlbId] nvarchar(50) NOT NULL,
        [VehicleId] bigint NOT NULL,
        [SessionCode] nvarchar(50) NOT NULL,
        [Name] nvarchar(150) NOT NULL,
        [Description] nvarchar(500) NULL,
        [StatusStateDefinitionId] int NOT NULL,
        [IsActiveReservation] bit NOT NULL,
        [ScheduledStartAt] datetime2 NOT NULL,
        [ScheduledEndAt] datetime2 NOT NULL,
        [ActualStartAt] datetime2 NULL,
        [ActualEndAt] datetime2 NULL,
        [CompletedAt] datetime2 NULL,
        [CreatedAt] datetime2 NOT NULL,
        [CreatedBy] nvarchar(100) NULL,
        [UpdatedAt] datetime2 NULL,
        [UpdatedBy] nvarchar(100) NULL,
        CONSTRAINT [PK_OperationalSessions] PRIMARY KEY ([OperationalSessionId]),
        CONSTRAINT [FK_OperationalSessions_StateDefinitions_StatusStateDefinitionId] FOREIGN KEY ([StatusStateDefinitionId]) REFERENCES [StateDefinitions] ([StateDefinitionId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_OperationalSessions_ULBRegistry_UlbId] FOREIGN KEY ([UlbId]) REFERENCES [ULBRegistry] ([UlbId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_OperationalSessions_VehicleRegistry_VehicleId] FOREIGN KEY ([VehicleId]) REFERENCES [VehicleRegistry] ([VehicleId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE TABLE [RoadSegments] (
        [RoadSegmentId] bigint NOT NULL IDENTITY,
        [RoadId] bigint NOT NULL,
        [RoadGeometryVersionId] bigint NOT NULL,
        [SegmentCode] nvarchar(50) NOT NULL,
        [SegmentName] nvarchar(150) NOT NULL,
        [Geometry] geography NOT NULL,
        [StartNodeReference] nvarchar(100) NULL,
        [EndNodeReference] nvarchar(100) NULL,
        [LengthMeters] float NOT NULL,
        [Sequence] int NOT NULL,
        [IsActive] bit NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [UpdatedAt] datetime2 NULL,
        CONSTRAINT [PK_RoadSegments] PRIMARY KEY ([RoadSegmentId]),
        CONSTRAINT [FK_RoadSegments_RoadGeometryVersions_RoadGeometryVersionId] FOREIGN KEY ([RoadGeometryVersionId]) REFERENCES [RoadGeometryVersions] ([RoadGeometryVersionId]) ON DELETE CASCADE,
        CONSTRAINT [FK_RoadSegments_Roads_RoadId] FOREIGN KEY ([RoadId]) REFERENCES [Roads] ([RoadId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE TABLE [SessionRoadAssignments] (
        [SessionRoadAssignmentId] bigint NOT NULL IDENTITY,
        [OperationalSessionId] bigint NOT NULL,
        [RoadId] bigint NOT NULL,
        [RoadSegmentId] bigint NULL,
        [RoadGeometryVersionId] bigint NOT NULL,
        [AssignedGeometry] geography NOT NULL,
        [BufferMeters] float NOT NULL,
        [AssignmentType] nvarchar(50) NOT NULL,
        [AssignedOrder] int NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        [CreatedBy] nvarchar(100) NULL,
        [UpdatedAt] datetime2 NULL,
        [UpdatedBy] nvarchar(100) NULL,
        CONSTRAINT [PK_SessionRoadAssignments] PRIMARY KEY ([SessionRoadAssignmentId]),
        CONSTRAINT [FK_SessionRoadAssignments_OperationalSessions_OperationalSessionId] FOREIGN KEY ([OperationalSessionId]) REFERENCES [OperationalSessions] ([OperationalSessionId]) ON DELETE CASCADE,
        CONSTRAINT [FK_SessionRoadAssignments_RoadGeometryVersions_RoadGeometryVersionId] FOREIGN KEY ([RoadGeometryVersionId]) REFERENCES [RoadGeometryVersions] ([RoadGeometryVersionId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SessionRoadAssignments_RoadSegments_RoadSegmentId] FOREIGN KEY ([RoadSegmentId]) REFERENCES [RoadSegments] ([RoadSegmentId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SessionRoadAssignments_Roads_RoadId] FOREIGN KEY ([RoadId]) REFERENCES [Roads] ([RoadId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE TABLE [CollectionEvents] (
        [CollectionEventId] bigint NOT NULL IDENTITY,
        [OperationalSessionId] bigint NOT NULL,
        [SessionRoadAssignmentId] bigint NOT NULL,
        [VehicleId] bigint NOT NULL,
        [CapturedAt] datetime2 NOT NULL,
        [ReceivedAt] datetime2 NOT NULL,
        [Latitude] float NOT NULL,
        [Longitude] float NOT NULL,
        [Location] geography NOT NULL,
        [FusedSpeedKph] float NOT NULL,
        [MotionConfidence] float NOT NULL,
        [DistanceToRoadMeters] float NOT NULL,
        [StatusStateDefinitionId] int NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_CollectionEvents] PRIMARY KEY ([CollectionEventId]),
        CONSTRAINT [FK_CollectionEvents_OperationalSessions_OperationalSessionId] FOREIGN KEY ([OperationalSessionId]) REFERENCES [OperationalSessions] ([OperationalSessionId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CollectionEvents_SessionRoadAssignments_SessionRoadAssignmentId] FOREIGN KEY ([SessionRoadAssignmentId]) REFERENCES [SessionRoadAssignments] ([SessionRoadAssignmentId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CollectionEvents_StateDefinitions_StatusStateDefinitionId] FOREIGN KEY ([StatusStateDefinitionId]) REFERENCES [StateDefinitions] ([StateDefinitionId]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CollectionEvents_VehicleRegistry_VehicleId] FOREIGN KEY ([VehicleId]) REFERENCES [VehicleRegistry] ([VehicleId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE TABLE [CollectionEventHouses] (
        [CollectionEventHouseId] bigint NOT NULL IDENTITY,
        [CollectionEventId] bigint NOT NULL,
        [HouseId] nvarchar(50) NOT NULL,
        [DistanceMeters] float NOT NULL,
        [CoverageRadiusMeters] float NOT NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_CollectionEventHouses] PRIMARY KEY ([CollectionEventHouseId]),
        CONSTRAINT [FK_CollectionEventHouses_CollectionEvents_CollectionEventId] FOREIGN KEY ([CollectionEventId]) REFERENCES [CollectionEvents] ([CollectionEventId]) ON DELETE CASCADE,
        CONSTRAINT [FK_CollectionEventHouses_Houses_HouseId] FOREIGN KEY ([HouseId]) REFERENCES [Houses] ([HouseId]) ON DELETE NO ACTION
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE TABLE [EvidenceImages] (
        [EvidenceImageId] bigint NOT NULL IDENTITY,
        [CollectionEventId] bigint NOT NULL,
        [RelativePath] nvarchar(300) NOT NULL,
        [CapturedAt] datetime2 NOT NULL,
        [ExpiresAt] datetime2 NOT NULL,
        [FileSizeBytes] bigint NOT NULL,
        [Width] int NOT NULL,
        [Height] int NOT NULL,
        [CompressionQuality] int NOT NULL,
        [DeletedAt] datetime2 NULL,
        [CreatedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_EvidenceImages] PRIMARY KEY ([EvidenceImageId]),
        CONSTRAINT [FK_EvidenceImages_CollectionEvents_CollectionEventId] FOREIGN KEY ([CollectionEventId]) REFERENCES [CollectionEvents] ([CollectionEventId]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'StateDefinitionId', N'CreatedAt', N'Description', N'DisplayName', N'EntityType', N'IsActive', N'IsTerminal', N'SortOrder', N'StateCode', N'UpdatedAt') AND [object_id] = OBJECT_ID(N'[StateDefinitions]'))
        SET IDENTITY_INSERT [StateDefinitions] ON;
    EXEC(N'INSERT INTO [StateDefinitions] ([StateDefinitionId], [CreatedAt], [Description], [DisplayName], [EntityType], [IsActive], [IsTerminal], [SortOrder], [StateCode], [UpdatedAt])
    VALUES (1, ''2026-01-01T00:00:00.0000000Z'', N''Unassigned hardware in storage'', N''In Inventory'', N''DEVICE'', CAST(1 AS bit), CAST(0 AS bit), 1, N''INVENTORY'', NULL),
    (2, ''2026-01-01T00:00:00.0000000Z'', N''Assigned to vehicle, awaiting installation'', N''Provisioned'', N''DEVICE'', CAST(1 AS bit), CAST(0 AS bit), 2, N''PROVISIONED'', NULL),
    (3, ''2026-01-01T00:00:00.0000000Z'', N''Active in field and transmitting telemetry'', N''In Service'', N''DEVICE'', CAST(1 AS bit), CAST(0 AS bit), 3, N''IN_SERVICE'', NULL),
    (4, ''2026-01-01T00:00:00.0000000Z'', N''Under diagnostic inspection or repair'', N''Maintenance'', N''DEVICE'', CAST(1 AS bit), CAST(0 AS bit), 4, N''MAINTENANCE'', NULL),
    (5, ''2026-01-01T00:00:00.0000000Z'', N''Temporarily disabled by operator'', N''Disabled'', N''DEVICE'', CAST(1 AS bit), CAST(0 AS bit), 5, N''DISABLED'', NULL),
    (6, ''2026-01-01T00:00:00.0000000Z'', N''Decommissioned from municipal inventory'', N''Retired'', N''DEVICE'', CAST(1 AS bit), CAST(1 AS bit), 6, N''RETIRED'', NULL),
    (10, ''2026-01-01T00:00:00.0000000Z'', N''Operational vehicle available for missions'', N''In Service'', N''VEHICLE'', CAST(1 AS bit), CAST(0 AS bit), 1, N''IN_SERVICE'', NULL),
    (11, ''2026-01-01T00:00:00.0000000Z'', N''In garage workshop for repair/service'', N''Maintenance'', N''VEHICLE'', CAST(1 AS bit), CAST(0 AS bit), 2, N''MAINTENANCE'', NULL),
    (12, ''2026-01-01T00:00:00.0000000Z'', N''Temporarily barred from municipal route'', N''Suspended'', N''VEHICLE'', CAST(1 AS bit), CAST(0 AS bit), 3, N''SUSPENDED'', NULL),
    (13, ''2026-01-01T00:00:00.0000000Z'', N''Retired permanently from municipal fleet'', N''Decommissioned'', N''VEHICLE'', CAST(1 AS bit), CAST(1 AS bit), 4, N''DECOMMISSIONED'', NULL),
    (20, ''2026-01-01T00:00:00.0000000Z'', N''Planned for future time window'', N''Scheduled'', N''OPERATIONAL_SESSION'', CAST(1 AS bit), CAST(0 AS bit), 1, N''SCHEDULED'', NULL),
    (21, ''2026-01-01T00:00:00.0000000Z'', N''In field execution, vehicle reserved'', N''Mission Active'', N''OPERATIONAL_SESSION'', CAST(1 AS bit), CAST(0 AS bit), 2, N''ACTIVE'', NULL),
    (22, ''2026-01-01T00:00:00.0000000Z'', N''Temporarily paused in field, vehicle remains reserved'', N''Mission Paused'', N''OPERATIONAL_SESSION'', CAST(1 AS bit), CAST(0 AS bit), 3, N''PAUSED'', NULL),
    (23, ''2026-01-01T00:00:00.0000000Z'', N''Mission finished within schedule'', N''Completed'', N''OPERATIONAL_SESSION'', CAST(1 AS bit), CAST(1 AS bit), 4, N''COMPLETED'', NULL),
    (24, ''2026-01-01T00:00:00.0000000Z'', N''Cancelled by officer prior to execution'', N''Cancelled'', N''OPERATIONAL_SESSION'', CAST(1 AS bit), CAST(1 AS bit), 5, N''CANCELLED'', NULL),
    (25, ''2026-01-01T00:00:00.0000000Z'', N''Terminated early due to emergency or breakdown'', N''Aborted'', N''OPERATIONAL_SESSION'', CAST(1 AS bit), CAST(1 AS bit), 6, N''ABORTED'', NULL),
    (30, ''2026-01-01T00:00:00.0000000Z'', N''Motion detected within road buffer & speed threshold'', N''Detected'', N''COLLECTION_EVENT'', CAST(1 AS bit), CAST(0 AS bit), 1, N''DETECTED'', NULL),
    (31, ''2026-01-01T00:00:00.0000000Z'', N''Confirmed solid waste collection'', N''Verified'', N''COLLECTION_EVENT'', CAST(1 AS bit), CAST(0 AS bit), 2, N''VERIFIED'', NULL),
    (32, ''2026-01-01T00:00:00.0000000Z'', N''Flagged for officer inspection or anomalies'', N''Flagged'', N''COLLECTION_EVENT'', CAST(1 AS bit), CAST(0 AS bit), 3, N''FLAGGED'', NULL)');
    IF EXISTS (SELECT * FROM [sys].[identity_columns] WHERE [name] IN (N'StateDefinitionId', N'CreatedAt', N'Description', N'DisplayName', N'EntityType', N'IsActive', N'IsTerminal', N'SortOrder', N'StateCode', N'UpdatedAt') AND [object_id] = OBJECT_ID(N'[StateDefinitions]'))
        SET IDENTITY_INSERT [StateDefinitions] OFF;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_VehicleRegistry_StatusStateDefinitionId] ON [VehicleRegistry] ([StatusStateDefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [UX_DeviceVehicleAssignment_OneActivePerDevice] ON [DeviceVehicleAssignment] ([DeviceId]) WHERE [IsActive] = 1');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [UX_DeviceVehicleAssignment_OneActivePerVehicle] ON [DeviceVehicleAssignment] ([VehicleId]) WHERE [IsActive] = 1');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_DeviceRegistry_StatusStateDefinitionId] ON [DeviceRegistry] ([StatusStateDefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_Entity_PerformedAt] ON [AuditLogs] ([EntityType], [EntityId], [PerformedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_UlbId_PerformedAt] ON [AuditLogs] ([UlbId], [PerformedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_CollectionEventHouses_CollectionEventId] ON [CollectionEventHouses] ([CollectionEventId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_CollectionEventHouses_HouseId] ON [CollectionEventHouses] ([HouseId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_CollectionEvents_Session_CapturedAt] ON [CollectionEvents] ([OperationalSessionId], [CapturedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_CollectionEvents_SessionRoadAssignmentId] ON [CollectionEvents] ([SessionRoadAssignmentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_CollectionEvents_StatusStateDefinitionId] ON [CollectionEvents] ([StatusStateDefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_CollectionEvents_Vehicle_CapturedAt] ON [CollectionEvents] ([VehicleId], [CapturedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_EntityStateTransitions_Entity_ChangedAt] ON [EntityStateTransitions] ([EntityType], [EntityId], [ChangedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_EntityStateTransitions_NewStateDefinitionId] ON [EntityStateTransitions] ([NewStateDefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_EntityStateTransitions_PreviousStateDefinitionId] ON [EntityStateTransitions] ([PreviousStateDefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_EvidenceImages_CollectionEventId] ON [EvidenceImages] ([CollectionEventId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_EvidenceImages_ExpiresAt_DeletedAt] ON [EvidenceImages] ([ExpiresAt], [DeletedAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_Houses_UlbId_IsActive] ON [Houses] ([UlbId], [IsActive]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_OperationalSessions_StatusStateDefinitionId] ON [OperationalSessions] ([StatusStateDefinitionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_OperationalSessions_Ulb_Status_Scheduled] ON [OperationalSessions] ([UlbId], [StatusStateDefinitionId], [ScheduledStartAt]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE UNIQUE INDEX [UQ_OperationalSessions_SessionCode] ON [OperationalSessions] ([SessionCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    EXEC(N'CREATE UNIQUE INDEX [UX_OperationalSession_OneActiveReservationPerVehicle] ON [OperationalSessions] ([VehicleId]) WHERE [IsActiveReservation] = 1');
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE UNIQUE INDEX [UQ_RoadGeometryVersions_Road_Version] ON [RoadGeometryVersions] ([RoadId], [VersionNumber]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE UNIQUE INDEX [UQ_Roads_UlbId_RoadCode] ON [Roads] ([UlbId], [RoadCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_RoadSegments_Road_Sequence] ON [RoadSegments] ([RoadId], [Sequence]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_RoadSegments_RoadGeometryVersionId] ON [RoadSegments] ([RoadGeometryVersionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_SessionRoadAssignments_RoadGeometryVersionId] ON [SessionRoadAssignments] ([RoadGeometryVersionId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_SessionRoadAssignments_RoadId] ON [SessionRoadAssignments] ([RoadId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_SessionRoadAssignments_RoadSegmentId] ON [SessionRoadAssignments] ([RoadSegmentId]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE INDEX [IX_SessionRoadAssignments_Session_Order] ON [SessionRoadAssignments] ([OperationalSessionId], [AssignedOrder]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    CREATE UNIQUE INDEX [UQ_StateDefinitions_EntityType_StateCode] ON [StateDefinitions] ([EntityType], [StateCode]);
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    ALTER TABLE [DeviceRegistry] ADD CONSTRAINT [FK_DeviceRegistry_StateDefinitions_StatusStateDefinitionId] FOREIGN KEY ([StatusStateDefinitionId]) REFERENCES [StateDefinitions] ([StateDefinitionId]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    ALTER TABLE [VehicleRegistry] ADD CONSTRAINT [FK_VehicleRegistry_StateDefinitions_StatusStateDefinitionId] FOREIGN KEY ([StatusStateDefinitionId]) REFERENCES [StateDefinitions] ([StateDefinitionId]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    ALTER TABLE [VehicleRegistry] ADD CONSTRAINT [FK_VehicleRegistry_ULBRegistry_UlbId] FOREIGN KEY ([UlbId]) REFERENCES [ULBRegistry] ([UlbId]) ON DELETE NO ACTION;
END;

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260817073441_AddDomainAndSpatialFoundation'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260817073441_AddDomainAndSpatialFoundation', N'10.0.11');
END;

COMMIT;
GO

