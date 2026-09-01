using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Data;
using System.Linq;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.SignalR;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Hubs;
using SWSTP.Telemetry.Backend.Models;
using SWSTP.Telemetry.Backend.Services.Motion;

using SWSTP.Telemetry.Backend.Services.LiveState;

namespace SWSTP.Telemetry.Backend.Services
{
    public class TelemetryIngestionService : BackgroundService, ITelemetryIngestionService
    {
        private readonly Channel<IngestBatchDto> _channel;
        private readonly IServiceProvider _serviceProvider;
        private readonly IConfiguration _configuration;
        private readonly IHubContext<TelemetryHub> _hubContext;
        private readonly ISpeedFusionService _speedFusion;
        private readonly ILiveTruckStateStore _liveStore;
        private readonly ILogger<TelemetryIngestionService> _logger;
        private readonly ConcurrentDictionary<long, int?> _lastProcessedGsvSeq = new();
        private static readonly ConcurrentDictionary<string, SemaphoreSlim> _sessionLocks = new();
        private static readonly ConcurrentDictionary<long, VehicleFieldState> _vehicleFieldStates = new();

        private class VehicleFieldState
        {
            public bool? IsInDepot { get; set; }
            public bool? IsInCorridor { get; set; }
            public bool? IsStopped { get; set; }
            public DateTime LastLoggedAt { get; set; } = DateTime.MinValue;
        }

        public TelemetryIngestionService(
            IServiceProvider serviceProvider,
            IConfiguration configuration,
            IHubContext<TelemetryHub> hubContext,
            ISpeedFusionService speedFusion,
            ILiveTruckStateStore liveStore,
            ILogger<TelemetryIngestionService> logger)
        {
            _serviceProvider = serviceProvider;
            _configuration = configuration;
            _hubContext = hubContext;
            _speedFusion = speedFusion;
            _liveStore = liveStore;
            _logger = logger;
            _channel = Channel.CreateUnbounded<IngestBatchDto>(new UnboundedChannelOptions
            {
                SingleReader = true
            });
        }

        public async Task EnqueueBatchAsync(IngestBatchDto batch)
        {
            if (batch != null && batch.Packets != null && batch.Packets.Count > 0)
            {
                await _channel.Writer.WriteAsync(batch);
            }
        }

        public async Task<SessionIdentityDto?> GetOrCreateSessionIdentityForDeviceAsync(string deviceCode, string mode)
        {
            var sem = _sessionLocks.GetOrAdd(deviceCode, _ => new SemaphoreSlim(1, 1));
            await sem.WaitAsync();

            try
            {
                using var scope = _serviceProvider.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

                // 1. STRICT DEVICE REGISTRY CHECK
                var device = await db.DeviceRegistry
                    .AsNoTracking()
                    .FirstOrDefaultAsync(d => d.DeviceCode == deviceCode && d.IsActive);

                if (device == null)
                {
                    _logger.LogWarning("REJECTED SESSION CREATION: DeviceCode '{DeviceCode}' is UNREGISTERED in DeviceRegistry.", deviceCode);
                    return null;
                }

                // Update LastSeenAt for device
                var devTrack = await db.DeviceRegistry.FindAsync(device.DeviceId);
                if (devTrack != null)
                {
                    devTrack.LastSeenAt = DateTime.UtcNow;
                    await db.SaveChangesAsync();
                }

                // 2. Resolve Active Device ➔ Vehicle Assignment
                var activeAssignment = await db.DeviceVehicleAssignments
                    .AsNoTracking()
                    .Include(a => a.Vehicle)
                    .FirstOrDefaultAsync(a => a.DeviceId == device.DeviceId && a.IsActive);

                string vehicleReg = activeAssignment?.Vehicle?.VehicleRegistrationNumber ?? "UNASSIGNED";

                // 3. IDEMPOTENCY / CONCURRENCY CHECK: Check for existing ACTIVE session for this device
                var existingActiveSession = await db.TelemetrySessions
                    .AsNoTracking()
                    .Where(s => s.DeviceId == device.DeviceId && s.Status == "ACTIVE" && s.EndedAt == null)
                    .OrderByDescending(s => s.StartedAt)
                    .FirstOrDefaultAsync();

                TelemetrySession session;
                if (existingActiveSession != null)
                {
                    _logger.LogInformation("Reusing existing ACTIVE TelemetrySession #{SessionId} for Device '{DeviceCode}'",
                        existingActiveSession.SessionId, deviceCode);
                    session = existingActiveSession;
                }
                else
                {
                    var sessionCode = $"SES-{(mode == "SIMULATION" ? "SIM" : "REAL")}-{DateTime.UtcNow:yyyyMMdd-HHmmss}";
                    session = new TelemetrySession
                    {
                        SessionCode = sessionCode,
                        DeviceId = device.DeviceId,
                        AssignmentId = activeAssignment?.AssignmentId,
                        DeviceCode = device.DeviceCode,
                        VehicleRegistrationNumber = vehicleReg,
                        Mode = mode,
                        StartedAt = DateTime.UtcNow,
                        Status = "ACTIVE"
                    };

                    db.TelemetrySessions.Add(session);
                    await db.SaveChangesAsync();

                    _logger.LogInformation("Created TelemetrySession #{SessionId} for Device '{DeviceCode}' mapped to Vehicle '{VehicleReg}'",
                        session.SessionId, session.DeviceCode, session.VehicleRegistrationNumber);
                }

                // 4. Build clean SessionIdentityDto (No circular EF navigation graph)
                var dto = new SessionIdentityDto
                {
                    SessionId = session.SessionId,
                    SessionCode = session.SessionCode,
                    Mode = session.Mode,
                    StartedAt = session.StartedAt,
                    EndedAt = session.EndedAt,
                    Status = session.Status,
                    Device = new DeviceIdentityDto
                    {
                        DeviceId = device.DeviceId,
                        DeviceCode = device.DeviceCode,
                        HardwareVersion = device.HardwareVersion,
                        FirmwareVersion = device.FirmwareVersion,
                        IsActive = device.IsActive
                    }
                };

                if (activeAssignment != null)
                {
                    dto.Assignment = new AssignmentIdentityDto
                    {
                        AssignmentId = activeAssignment.AssignmentId,
                        IsActive = activeAssignment.IsActive,
                        AssignedAt = activeAssignment.AssignedAt
                    };

                    if (activeAssignment.Vehicle != null)
                    {
                        dto.Vehicle = new VehicleIdentityDto
                        {
                            VehicleId = activeAssignment.Vehicle.VehicleId,
                            RegistrationNumber = activeAssignment.Vehicle.VehicleRegistrationNumber,
                            VehicleType = activeAssignment.Vehicle.VehicleType,
                            Status = activeAssignment.Vehicle.Status
                        };

                        if (!string.IsNullOrEmpty(activeAssignment.Vehicle.UlbId) || !string.IsNullOrEmpty(activeAssignment.Vehicle.UlbName))
                        {
                            dto.Ulb = new UlbIdentityDto
                            {
                                UlbId = activeAssignment.Vehicle.UlbId ?? string.Empty,
                                Name = activeAssignment.Vehicle.UlbName ?? string.Empty
                            };
                        }
                    }
                }

                var maxSeq = await db.TelemetryPackets
                    .Where(p => p.SessionId == session.SessionId)
                    .MaxAsync(p => (long?)p.SequenceNumber) ?? 0;
                dto.LastSequenceNumber = maxSeq;

                return dto;
            }
            finally
            {
                sem.Release();
            }
        }


        public async Task EndSessionAsync(long sessionId, string status = "COMPLETED")
        {
            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            var session = await db.TelemetrySessions.FirstOrDefaultAsync(s => s.SessionId == sessionId);
            if (session != null)
            {
                session.EndedAt = DateTime.UtcNow;
                session.Status = status;
                await db.SaveChangesAsync();
                _logger.LogInformation("Ended telemetry session #{SessionId} with status {Status}", sessionId, status);
            }
            _lastProcessedGsvSeq.TryRemove(sessionId, out _);
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("TelemetryIngestionService background worker running.");

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    if (await _channel.Reader.WaitToReadAsync(stoppingToken))
                    {
                        var batches = new List<IngestBatchDto>();
                        while (_channel.Reader.TryRead(out var batch))
                        {
                            batches.Add(batch);
                        }

                        if (batches.Count > 0)
                        {
                            await ProcessBatchesBulkAsync(batches, stoppingToken);
                        }
                    }
                }
                catch (OperationCanceledException)
                {
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error processing telemetry ingestion queue");
                    await Task.Delay(1000, stoppingToken);
                }
            }
        }

        private async Task ProcessBatchesBulkAsync(List<IngestBatchDto> batches, CancellationToken cancellationToken)
        {
            var connectionString = _configuration.GetConnectionString("DefaultConnection");
            if (string.IsNullOrEmpty(connectionString)) return;

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TelemetryDbContext>();

            foreach (var batch in batches)
            {
                if (batch.Packets == null || batch.Packets.Count == 0) continue;

                // Validate session status in DB
                var session = await db.TelemetrySessions.AsNoTracking().FirstOrDefaultAsync(s => s.SessionId == batch.SessionId, cancellationToken);
                if (session == null || session.Status == "UNREGISTERED_DEVICE" || session.Status == "ABORTED")
                {
                    _logger.LogWarning("Dropping ingestion batch for Session #{SessionId} (Status={Status})", batch.SessionId, session?.Status ?? "NOT_FOUND");
                    continue;
                }

                // Deduplicate within the incoming batch by SequenceNumber (keep newest)
                var uniquePackets = batch.Packets
                    .GroupBy(p => p.Sequence)
                    .Select(g => g.Last())
                    .OrderBy(p => p.Sequence)
                    .ThenBy(p => p.Timestamp)
                    .ToList();

                // Check against existing packets in DB to avoid UQ_TelemetryPackets_Session_Sequence violation
                var incomingSeqs = uniquePackets.Select(p => p.Sequence).ToList();
                var existingSeqs = await db.TelemetryPackets
                    .AsNoTracking()
                    .Where(p => p.SessionId == batch.SessionId && incomingSeqs.Contains(p.SequenceNumber))
                    .Select(p => p.SequenceNumber)
                    .ToListAsync(cancellationToken);

                var existingSeqSet = new HashSet<long>(existingSeqs);
                var validPackets = uniquePackets.Where(p => !existingSeqSet.Contains(p.Sequence)).ToList();

                if (validPackets.Count == 0)
                {
                    continue;
                }

                var packetsList = new List<TelemetryPacket>();
                var imuList = new List<ImuSample>();
                var gnssList = new List<GnssSample>();
                var satObsList = new List<GnssSatelliteObservation>();

                foreach (var p in validPackets)
                {
                    var receivedAt = DateTime.UtcNow;
                    bool isRtcValid = p.Rtc?.Synced != false && (p.Rtc?.Epoch > 0 || p.Timestamp > 0);
                    long? rtcEpochMs = p.Rtc?.Epoch > 0 ? p.Rtc.Epoch : (p.Timestamp > 0 ? p.Timestamp : (long?)null);

                    DateTime? rtcTime = (isRtcValid && rtcEpochMs.HasValue)
                        ? DateTimeOffset.FromUnixTimeMilliseconds(rtcEpochMs.Value).UtcDateTime
                        : null;

                    // Authoritative sample timestamp: RTC time if valid, or UnixEpoch (1970-01-01) if RTC is invalid (never silently substitute server clock)
                    DateTime sampleTimestamp = rtcTime ?? DateTime.UnixEpoch;

                    var packet = new TelemetryPacket
                    {
                        SessionId = batch.SessionId,
                        SequenceNumber = p.Sequence,
                        ReceivedAt = receivedAt,
                        ArduinoUptimeMs = p.UptimeMs,
                        RtcTimestamp = rtcTime,
                        RawJson = string.IsNullOrEmpty(p.RawJson) ? "{}" : p.RawJson,
                        ParserStatus = isRtcValid ? "OK" : "RTC_UNSYNCED"
                    };
                    packetsList.Add(packet);

                    if (p.Imu != null)
                    {
                        imuList.Add(new ImuSample
                        {
                            SessionId = batch.SessionId,
                            SequenceNumber = p.Sequence,
                            ArduinoUptimeMs = p.UptimeMs,
                            Timestamp = sampleTimestamp,
                            AccelX = p.Imu.Accel?.X,
                            AccelY = p.Imu.Accel?.Y,
                            AccelZ = p.Imu.Accel?.Z,
                            AccelMagnitude = p.Imu.AccelMagnitude,
                            GyroX = p.Imu.Gyro?.X,
                            GyroY = p.Imu.Gyro?.Y,
                            GyroZ = p.Imu.Gyro?.Z,
                            TemperatureC = p.Imu.TemperatureC,
                            Roll = p.Imu.Orientation?.Roll,
                            Pitch = p.Imu.Orientation?.Pitch,
                            Yaw = p.Imu.Orientation?.Yaw,
                            YawSource = p.Imu.Orientation?.YawSource,
                            QuaternionW = p.Imu.Quaternion?.W,
                            QuaternionX = p.Imu.Quaternion?.X,
                            QuaternionY = p.Imu.Quaternion?.Y,
                            QuaternionZ = p.Imu.Quaternion?.Z,
                            IsValid = p.Imu.Valid
                        });
                    }

                    if (p.Gnss != null)
                    {
                        var rawLat = p.Gnss.RawLat ?? p.Gnss.Lat;
                        var rawLon = p.Gnss.RawLon ?? p.Gnss.Lon;
                        var dispLat = p.Gnss.DisplayLat ?? p.Gnss.Lat ?? p.Gnss.RawLat;
                        var dispLon = p.Gnss.DisplayLon ?? p.Gnss.Lon ?? p.Gnss.RawLon;
                        var isFixValid = p.Gnss.Valid && ((dispLat.HasValue && dispLon.HasValue) || (rawLat.HasValue && rawLon.HasValue));

                        gnssList.Add(new GnssSample
                        {
                            SessionId = batch.SessionId,
                            SequenceNumber = p.Sequence,
                            ArduinoUptimeMs = p.UptimeMs,
                            Timestamp = sampleTimestamp,
                            FixStatus = p.Gnss.Fix ?? (isFixValid ? "FIX_3D" : "NO_FIX"),
                            FixValid = isFixValid,
                            Latitude = isFixValid ? dispLat : null,    // Canonical Display Latitude
                            Longitude = isFixValid ? dispLon : null,   // Canonical Display Longitude
                            RawLatitude = isFixValid ? rawLat : null,
                            RawLongitude = isFixValid ? rawLon : null,
                            DisplayLatitude = isFixValid ? dispLat : null,
                            DisplayLongitude = isFixValid ? dispLon : null,
                            IsInsideSafeZone = p.Gnss.IsInsideSafeZone,
                            IsSnapped = p.Gnss.IsSnapped,
                            AltitudeM = isFixValid ? p.Gnss.Alt : null,   // MUST PRESERVE NULL!
                            SpeedKmh = isFixValid ? p.Gnss.Speed : null,
                            CourseDeg = isFixValid ? p.Gnss.Heading : null,
                            SatellitesCount = p.Gnss.Satellites,
                            SatellitesInView = p.Gnss.SatellitesInView,  // STRICTLY A COUNT
                            SatellitesUsed = p.Gnss.SatellitesUsed,
                            Hdop = p.Gnss.Hdop,
                            GsvSeq = p.Gnss.GsvSeq,
                            GsvUptimeMs = p.Gnss.GsvUptimeMs
                        });

                        if (p.Gnss.SatellitesDetail != null && p.Gnss.SatellitesDetail.Count > 0)
                        {
                            bool isNewGsvSnapshot = true;
                            if (p.Gnss.GsvSeq.HasValue)
                            {
                                _lastProcessedGsvSeq.TryGetValue(batch.SessionId, out var lastSeq);
                                if (lastSeq.HasValue && lastSeq.Value == p.Gnss.GsvSeq.Value)
                                {
                                    isNewGsvSnapshot = false;
                                }
                                else
                                {
                                    _lastProcessedGsvSeq[batch.SessionId] = p.Gnss.GsvSeq.Value;
                                }
                            }

                            if (isNewGsvSnapshot)
                            {
                                foreach (var sat in p.Gnss.SatellitesDetail)
                                {
                                    satObsList.Add(new GnssSatelliteObservation
                                    {
                                        SessionId = batch.SessionId,
                                        SequenceNumber = p.Sequence,
                                        ObservedAt = sampleTimestamp,
                                        GsvSeq = p.Gnss.GsvSeq,
                                        Prn = sat.Prn,
                                        Constellation = string.IsNullOrEmpty(sat.Constellation) ? "UNKNOWN" : sat.Constellation.ToUpperInvariant(),
                                        ElevationDeg = sat.Elevation,
                                        AzimuthDeg = sat.Azimuth,
                                        SnrDbHz = sat.Snr,
                                        UsedInFix = sat.UsedInFix,
                                        Status = sat.Status ?? (sat.UsedInFix ? "USED IN FIX" : "VISIBLE")
                                    });
                                }
                            }
                        }
                    }
                }

                using var conn = new SqlConnection(connectionString);
                await conn.OpenAsync(cancellationToken);
                using var transaction = conn.BeginTransaction();

                try
                {
                    if (packetsList.Count > 0)
                    {
                        using var bulkPackets = new SqlBulkCopy(conn, SqlBulkCopyOptions.Default, transaction) { DestinationTableName = "TelemetryPackets" };
                        bulkPackets.ColumnMappings.Add("SessionId", "SessionId");
                        bulkPackets.ColumnMappings.Add("SequenceNumber", "SequenceNumber");
                        bulkPackets.ColumnMappings.Add("ReceivedAt", "ReceivedAt");
                        bulkPackets.ColumnMappings.Add("ArduinoUptimeMs", "ArduinoUptimeMs");
                        bulkPackets.ColumnMappings.Add("RtcTimestamp", "RtcTimestamp");
                        bulkPackets.ColumnMappings.Add("RawJson", "RawJson");
                        bulkPackets.ColumnMappings.Add("ParserStatus", "ParserStatus");
                        await bulkPackets.WriteToServerAsync(ToDataTablePackets(packetsList), cancellationToken);
                    }

                    if (imuList.Count > 0)
                    {
                        using var bulkImu = new SqlBulkCopy(conn, SqlBulkCopyOptions.Default, transaction) { DestinationTableName = "ImuSamples" };
                        bulkImu.ColumnMappings.Add("SessionId", "SessionId");
                        bulkImu.ColumnMappings.Add("SequenceNumber", "SequenceNumber");
                        bulkImu.ColumnMappings.Add("ArduinoUptimeMs", "ArduinoUptimeMs");
                        bulkImu.ColumnMappings.Add("Timestamp", "Timestamp");
                        bulkImu.ColumnMappings.Add("AccelX", "AccelX");
                        bulkImu.ColumnMappings.Add("AccelY", "AccelY");
                        bulkImu.ColumnMappings.Add("AccelZ", "AccelZ");
                        bulkImu.ColumnMappings.Add("AccelMagnitude", "AccelMagnitude");
                        bulkImu.ColumnMappings.Add("GyroX", "GyroX");
                        bulkImu.ColumnMappings.Add("GyroY", "GyroY");
                        bulkImu.ColumnMappings.Add("GyroZ", "GyroZ");
                        bulkImu.ColumnMappings.Add("TemperatureC", "TemperatureC");
                        bulkImu.ColumnMappings.Add("Roll", "Roll");
                        bulkImu.ColumnMappings.Add("Pitch", "Pitch");
                        bulkImu.ColumnMappings.Add("Yaw", "Yaw");
                        bulkImu.ColumnMappings.Add("YawSource", "YawSource");
                        bulkImu.ColumnMappings.Add("QuaternionW", "QuaternionW");
                        bulkImu.ColumnMappings.Add("QuaternionX", "QuaternionX");
                        bulkImu.ColumnMappings.Add("QuaternionY", "QuaternionY");
                        bulkImu.ColumnMappings.Add("QuaternionZ", "QuaternionZ");
                        bulkImu.ColumnMappings.Add("IsValid", "IsValid");
                        await bulkImu.WriteToServerAsync(ToDataTableImu(imuList), cancellationToken);
                    }

                    if (gnssList.Count > 0)
                    {
                        using var bulkGnss = new SqlBulkCopy(conn, SqlBulkCopyOptions.Default, transaction) { DestinationTableName = "GnssSamples" };
                        bulkGnss.ColumnMappings.Add("SessionId", "SessionId");
                        bulkGnss.ColumnMappings.Add("SequenceNumber", "SequenceNumber");
                        bulkGnss.ColumnMappings.Add("ArduinoUptimeMs", "ArduinoUptimeMs");
                        bulkGnss.ColumnMappings.Add("Timestamp", "Timestamp");
                        bulkGnss.ColumnMappings.Add("FixStatus", "FixStatus");
                        bulkGnss.ColumnMappings.Add("FixValid", "FixValid");
                        bulkGnss.ColumnMappings.Add("Latitude", "Latitude");
                        bulkGnss.ColumnMappings.Add("Longitude", "Longitude");
                        bulkGnss.ColumnMappings.Add("RawLatitude", "RawLatitude");
                        bulkGnss.ColumnMappings.Add("RawLongitude", "RawLongitude");
                        bulkGnss.ColumnMappings.Add("DisplayLatitude", "DisplayLatitude");
                        bulkGnss.ColumnMappings.Add("DisplayLongitude", "DisplayLongitude");
                        bulkGnss.ColumnMappings.Add("IsInsideSafeZone", "IsInsideSafeZone");
                        bulkGnss.ColumnMappings.Add("IsSnapped", "IsSnapped");
                        bulkGnss.ColumnMappings.Add("AltitudeM", "AltitudeM");
                        bulkGnss.ColumnMappings.Add("SpeedKmh", "SpeedKmh");
                        bulkGnss.ColumnMappings.Add("CourseDeg", "CourseDeg");
                        bulkGnss.ColumnMappings.Add("SatellitesCount", "SatellitesCount");
                        bulkGnss.ColumnMappings.Add("SatellitesInView", "SatellitesInView");
                        bulkGnss.ColumnMappings.Add("SatellitesUsed", "SatellitesUsed");
                        bulkGnss.ColumnMappings.Add("Hdop", "Hdop");
                        bulkGnss.ColumnMappings.Add("GsvSeq", "GsvSeq");
                        bulkGnss.ColumnMappings.Add("GsvUptimeMs", "GsvUptimeMs");
                        await bulkGnss.WriteToServerAsync(ToDataTableGnss(gnssList), cancellationToken);
                    }

                    if (satObsList.Count > 0)
                    {
                        using var bulkSat = new SqlBulkCopy(conn, SqlBulkCopyOptions.Default, transaction) { DestinationTableName = "GnssSatelliteObservations" };
                        bulkSat.ColumnMappings.Add("SessionId", "SessionId");
                        bulkSat.ColumnMappings.Add("SequenceNumber", "SequenceNumber");
                        bulkSat.ColumnMappings.Add("ObservedAt", "ObservedAt");
                        bulkSat.ColumnMappings.Add("GsvSeq", "GsvSeq");
                        bulkSat.ColumnMappings.Add("Prn", "Prn");
                        bulkSat.ColumnMappings.Add("Constellation", "Constellation");
                        bulkSat.ColumnMappings.Add("ElevationDeg", "ElevationDeg");
                        bulkSat.ColumnMappings.Add("AzimuthDeg", "AzimuthDeg");
                        bulkSat.ColumnMappings.Add("SnrDbHz", "SnrDbHz");
                        bulkSat.ColumnMappings.Add("UsedInFix", "UsedInFix");
                        bulkSat.ColumnMappings.Add("Status", "Status");
                        await bulkSat.WriteToServerAsync(ToDataTableSatObs(satObsList), cancellationToken);
                    }

                    await transaction.CommitAsync(cancellationToken);
                    _logger.LogInformation("Bulk inserted batch: {Pkts} packets for Session #{SessionId}", packetsList.Count, batch.SessionId);

                    // Update DeviceRegistry.LastSeenAt
                    try
                    {
                        var dev = session.DeviceId > 0
                            ? await db.DeviceRegistry.FindAsync(new object[] { session.DeviceId }, cancellationToken)
                            : await db.DeviceRegistry.FirstOrDefaultAsync(d => d.DeviceCode == session.DeviceCode, cancellationToken);

                        if (dev != null)
                        {
                            dev.LastSeenAt = DateTime.UtcNow;
                            await db.SaveChangesAsync(cancellationToken);
                        }
                    }
                    catch { }

                    // Separate best-effort write: update VehicleRegistry with latest valid GNSS fix
                    var latestFix = gnssList.Where(g => g.FixValid && g.Latitude.HasValue && g.Longitude.HasValue)
                                           .OrderByDescending(g => g.Timestamp)
                                           .FirstOrDefault();

                    if (latestFix != null)
                    {
                        try
                        {
                            long resolvedVehicleId = 0;
                            string? resolvedReg = null;
                            string? resolvedUlbId = null;
                            string? resolvedUlbName = null;
                            string? resolvedDeviceCode = null;

                            var sessionInfo = await db.TelemetrySessions
                                .AsNoTracking()
                                .Where(s => s.SessionId == batch.SessionId && s.AssignmentId.HasValue)
                                .Select(s => new { 
                                    s.Assignment!.VehicleId, 
                                    s.Assignment!.Vehicle!.VehicleRegistrationNumber,
                                    s.Assignment!.Vehicle!.UlbId, 
                                    s.Assignment!.Vehicle!.UlbName,
                                    DeviceCode = s.Assignment!.Device!.DeviceCode 
                                })
                                .FirstOrDefaultAsync(cancellationToken);

                            if (sessionInfo != null && sessionInfo.VehicleId > 0)
                            {
                                resolvedVehicleId = sessionInfo.VehicleId;
                                resolvedReg = sessionInfo.VehicleRegistrationNumber;
                                resolvedUlbId = sessionInfo.UlbId;
                                resolvedUlbName = sessionInfo.UlbName;
                                resolvedDeviceCode = sessionInfo.DeviceCode;
                            }
                            else
                            {
                                // Resilient fallback: lookup active assignment by device code from session or recent assignment
                                var fallbackAssign = await db.DeviceVehicleAssignments
                                    .AsNoTracking()
                                    .Include(a => a.Vehicle)
                                    .Include(a => a.Device)
                                    .Where(a => a.IsActive)
                                    .OrderByDescending(a => a.AssignedAt)
                                    .FirstOrDefaultAsync(cancellationToken);

                                if (fallbackAssign?.Vehicle != null)
                                {
                                    resolvedVehicleId = fallbackAssign.Vehicle.VehicleId;
                                    resolvedReg = fallbackAssign.Vehicle.VehicleRegistrationNumber;
                                    resolvedUlbId = fallbackAssign.Vehicle.UlbId;
                                    resolvedUlbName = fallbackAssign.Vehicle.UlbName;
                                    resolvedDeviceCode = fallbackAssign.Device?.DeviceCode;
                                }
                            }

                            if (resolvedVehicleId > 0)
                            {
                                var vehicle = await db.VehicleRegistry.FindAsync(new object[] { resolvedVehicleId }, cancellationToken);
                                if (vehicle != null)
                                {
                                    vehicle.LastKnownLatitude = latestFix.DisplayLatitude ?? latestFix.Latitude;
                                    vehicle.LastKnownLongitude = latestFix.DisplayLongitude ?? latestFix.Longitude;
                                    vehicle.LastKnownTimestamp = DateTime.UtcNow;
                                    vehicle.LastKnownRtcValid = latestFix.Timestamp != DateTime.UnixEpoch;
                                    vehicle.LastKnownSpeedKmh = latestFix.SpeedKmh;
                                    vehicle.LastKnownHeadingDeg = latestFix.CourseDeg;
                                    await db.SaveChangesAsync(cancellationToken);

                                    // ─── UPDATE IN-MEMORY LIVE TRUCK STATE STORE ──────────────────
                                    var effUlbId = resolvedUlbId ?? vehicle.UlbId ?? "ULB_MH_AMRAVATI";
                                    var liveState = new LiveTruckStateDto
                                    {
                                        VehicleId = vehicle.VehicleId,
                                        Registration = vehicle.VehicleRegistrationNumber ?? resolvedReg,
                                        SessionId = batch.SessionId,
                                        DeviceCode = resolvedDeviceCode ?? session?.DeviceCode ?? "UNASSIGNED",
                                        UlbId = effUlbId,
                                        UlbName = resolvedUlbName ?? vehicle.UlbName,
                                        RawLat = latestFix.RawLatitude ?? latestFix.Latitude,
                                        RawLon = latestFix.RawLongitude ?? latestFix.Longitude,
                                        DisplayLat = latestFix.DisplayLatitude ?? latestFix.Latitude,
                                        DisplayLon = latestFix.DisplayLongitude ?? latestFix.Longitude,
                                        IsInsideSafeZone = latestFix.IsInsideSafeZone,
                                        IsSnapped = latestFix.IsSnapped,
                                        Speed = latestFix.SpeedKmh,
                                        Heading = latestFix.CourseDeg,
                                        LastSeen = DateTime.UtcNow,
                                        IsLive = true
                                    };

                                    _liveStore.Update(liveState);

                                    // ─── BROADCAST REALTIME FLEET UPDATE OVER SIGNALR ────────────
                                    try
                                    {
                                        if (!string.IsNullOrWhiteSpace(effUlbId))
                                        {
                                            await _hubContext.Clients
                                                .Group($"fleet:{effUlbId.ToUpperInvariant()}")
                                                .SendAsync("TruckLocationUpdated", liveState, cancellationToken);
                                        }

                                        await _hubContext.Clients
                                            .Group("admin:fleet")
                                            .SendAsync("TruckLocationUpdated", liveState, cancellationToken);
                                    }
                                    catch (Exception sigEx)
                                    {
                                        _logger.LogWarning(sigEx, "Failed to broadcast TruckLocationUpdated SignalR message for Vehicle {VehicleId}", vehicle.VehicleId);
                                    }

                                    // ─── FIELD OPERATION EVENT TRACKING ──────────────────────────
                                    var state = _vehicleFieldStates.GetOrAdd(vehicle.VehicleId, _ => new VehicleFieldState());
                                    var lat = latestFix.Latitude ?? 0;
                                    var lon = latestFix.Longitude ?? 0;
                                    var speed = latestFix.SpeedKmh ?? 0;
                                    var heading = latestFix.CourseDeg ?? 0;

                                    if (Math.Abs(lat) > 0.001 && Math.Abs(lon) > 0.001)
                                    {
                                        // 1. Check Safe Zone Depot Proximity (20.928816, 77.7514375)
                                        double depotLat = 20.928816, depotLon = 77.7514375;
                                        double dxDepot = (lon - depotLon) * Math.Cos(depotLat * Math.PI / 180.0) * 111320.0;
                                        double dyDepot = (lat - depotLat) * 110540.0;
                                        double depotDist = Math.Sqrt(dxDepot * dxDepot + dyDepot * dyDepot);
                                        bool currentlyInDepot = depotDist <= 25.0;

                                        if (state.IsInDepot != currentlyInDepot)
                                        {
                                            state.IsInDepot = currentlyInDepot;
                                            if (currentlyInDepot)
                                            {
                                                _logger.LogInformation("==================================================================");
                                                _logger.LogInformation("[FIELD EVENT] 🛡 REST POSITION REACHED: Vehicle {VehicleReg} arrived at Safe Zone Depot", vehicle.VehicleRegistrationNumber);
                                                _logger.LogInformation("              Location: ({Lat:F6}, {Lon:F6}) | Depot Dist: {Dist:F1}m (Safe Radius: 20m)", lat, lon, depotDist);
                                                _logger.LogInformation("==================================================================");
                                            }
                                            else
                                            {
                                                _logger.LogInformation("[FIELD EVENT] 🚀 DEPOT DEPARTURE: Vehicle {VehicleReg} left Safe Zone Depot (Heading: {Heading:F0}°, Speed: {Speed:F1} km/h)",
                                                    vehicle.VehicleRegistrationNumber, heading, speed);
                                            }
                                        }

                                        // 2. Check Straight Road Corridor Proximity (20.955845, 77.764415 to 20.956396, 77.763289)
                                        double roadMidLat = 20.95612, roadMidLon = 77.76385;
                                        double dxRoad = (lon - roadMidLon) * Math.Cos(roadMidLat * Math.PI / 180.0) * 111320.0;
                                        double dyRoad = (lat - roadMidLat) * 110540.0;
                                        double roadDist = Math.Sqrt(dxRoad * dxRoad + dyRoad * dyRoad);
                                        bool currentlyInCorridor = roadDist <= 60.0;

                                        if (state.IsInCorridor != currentlyInCorridor)
                                        {
                                            state.IsInCorridor = currentlyInCorridor;
                                            if (currentlyInCorridor)
                                            {
                                                _logger.LogInformation("==================================================================");
                                                _logger.LogInformation("[FIELD EVENT] 🛣 APPROACHING STREET: Vehicle {VehicleReg} entered collection corridor", vehicle.VehicleRegistrationNumber);
                                                _logger.LogInformation("              Target: Siddhivinayak Nagar Internal Lane (Dist: {Dist:F1}m, Speed: {Speed:F1} km/h)", roadDist, speed);
                                                _logger.LogInformation("==================================================================");
                                            }
                                            else
                                            {
                                                _logger.LogInformation("[FIELD EVENT] 🏁 STREET CORRIDOR EXITED: Vehicle {VehicleReg} left collection corridor (Dist: {Dist:F1}m)",
                                                    vehicle.VehicleRegistrationNumber, roadDist);
                                            }
                                        }

                                        // 3. Check Vehicle Stopping / Resuming Motion
                                        bool currentlyStopped = speed <= 3.5;
                                        if (state.IsStopped != currentlyStopped)
                                        {
                                            state.IsStopped = currentlyStopped;
                                            if (currentlyStopped)
                                            {
                                                _logger.LogInformation("[FIELD EVENT] 🛑 VEHICLE STOP: Vehicle {VehicleReg} stationary at ({Lat:F6}, {Lon:F6}) | Speed: {Speed:F1} km/h (Road Dist: {Dist:F1}m)",
                                                    vehicle.VehicleRegistrationNumber, lat, lon, speed, roadDist);
                                            }
                                            else
                                            {
                                                _logger.LogInformation("[FIELD EVENT] 🚚 VEHICLE RESUME: Vehicle {VehicleReg} resumed motion at {Speed:F1} km/h (Heading: {Heading:F0}°)",
                                                    vehicle.VehicleRegistrationNumber, speed, heading);
                                            }
                                        }
                                    }

                                    // Evaluate operational alerts (GPS fix, prolonged idle, online recovery)
                                    try
                                    {
                                        var alertService = scope.ServiceProvider.GetService<IOperationalAlertService>();
                                        if (alertService != null)
                                        {
                                            var latestGnss = gnssList.OrderByDescending(g => g.Timestamp).FirstOrDefault();
                                            await alertService.EvaluateTelemetryAlertsAsync(
                                                vehicle.UlbId ?? "ULB_MH_AMRAVATI",
                                                vehicle.VehicleId,
                                                vehicle.VehicleRegistrationNumber,
                                                null,
                                                latestGnss?.FixValid ?? false,
                                                latestGnss?.SpeedKmh,
                                                latestGnss?.IsInsideSafeZone ?? false,
                                                latestGnss?.Timestamp ?? DateTime.UtcNow);
                                        }
                                    }
                                    catch (Exception alertEx)
                                    {
                                        _logger.LogWarning(alertEx, "Operational alert evaluation failed for Vehicle #{VehicleId}", vehicle.VehicleId);
                                    }
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Best-effort update of VehicleRegistry last-known-location failed for Session #{SessionId}", batch.SessionId);
                        }
                    }

                    // Broadcast real-time TelemetryUpdate via SignalR TelemetryHub
                    try
                    {
                        var latestGnss = gnssList.OrderByDescending(g => g.Timestamp).FirstOrDefault();
                        var latestImu = imuList.OrderByDescending(i => i.Timestamp).FirstOrDefault();

                        double? gyroMag = null;
                        if (latestImu?.GyroX.HasValue == true && latestImu?.GyroY.HasValue == true && latestImu?.GyroZ.HasValue == true)
                        {
                            gyroMag = Math.Sqrt(Math.Pow(latestImu.GyroX.Value, 2) + Math.Pow(latestImu.GyroY.Value, 2) + Math.Pow(latestImu.GyroZ.Value, 2));
                        }

                        var fusedMotion = _speedFusion.Fuse(
                            latestGnss?.SpeedKmh,
                            latestGnss?.FixValid ?? false,
                            latestImu?.AccelMagnitude,
                            gyroMag,
                            latestGnss?.Timestamp,
                            latestImu?.Timestamp);

                        var telemetrySnapshot = new
                        {
                            sessionId = batch.SessionId,
                            sequence = packetsList.LastOrDefault()?.SequenceNumber ?? 0,
                            receivedAt = DateTime.UtcNow,
                            gnss = latestGnss != null ? new
                            {
                                latitude = latestGnss.Latitude,
                                longitude = latestGnss.Longitude,
                                altitudeM = latestGnss.AltitudeM,
                                speedKmh = latestGnss.SpeedKmh,
                                headingDeg = latestGnss.CourseDeg,
                                fixStatus = latestGnss.FixStatus,
                                fixValid = latestGnss.FixValid,
                                satellites = latestGnss.SatellitesCount,
                                hdop = latestGnss.Hdop
                            } : null,
                            imu = latestImu != null ? new
                            {
                                accelX = latestImu.AccelX,
                                accelY = latestImu.AccelY,
                                accelZ = latestImu.AccelZ,
                                accelMagnitude = latestImu.AccelMagnitude,
                                gyroX = latestImu.GyroX,
                                gyroY = latestImu.GyroY,
                                gyroZ = latestImu.GyroZ,
                                roll = latestImu.Roll,
                                pitch = latestImu.Pitch,
                                yaw = latestImu.Yaw
                            } : null,
                            fusedMotion = new
                            {
                                fusedSpeedKmh = fusedMotion.FusedSpeedKmh,
                                source = fusedMotion.Source,
                                confidence = fusedMotion.Confidence,
                                isReliable = fusedMotion.IsReliable
                            }
                        };

                        await _hubContext.Clients
                            .Group($"session:{batch.SessionId}")
                            .SendAsync("TelemetryUpdate", telemetrySnapshot, cancellationToken);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to broadcast SignalR telemetry update for Session #{SessionId}", batch.SessionId);
                    }
                }
                catch (Exception ex)
                {
                    await transaction.RollbackAsync(cancellationToken);
                    _logger.LogError(ex, "Transaction failed for telemetry batch bulk copy. Rolling back.");
                    throw;
                }
            }
        }

        private static DataTable ToDataTablePackets(List<TelemetryPacket> items)
        {
            var dt = new DataTable();
            dt.Columns.Add("SessionId", typeof(long));
            dt.Columns.Add("SequenceNumber", typeof(long));
            dt.Columns.Add("ReceivedAt", typeof(DateTime));
            dt.Columns.Add("ArduinoUptimeMs", typeof(long));
            dt.Columns.Add("RtcTimestamp", typeof(DateTime));
            dt.Columns.Add("RawJson", typeof(string));
            dt.Columns.Add("ParserStatus", typeof(string));

            foreach (var item in items)
            {
                dt.Rows.Add(item.SessionId, item.SequenceNumber, item.ReceivedAt, item.ArduinoUptimeMs, (object?)item.RtcTimestamp ?? DBNull.Value, item.RawJson, item.ParserStatus);
            }
            return dt;
        }

        private static DataTable ToDataTableImu(List<ImuSample> items)
        {
            var dt = new DataTable();
            dt.Columns.Add("SessionId", typeof(long));
            dt.Columns.Add("SequenceNumber", typeof(long));
            dt.Columns.Add("ArduinoUptimeMs", typeof(long));
            dt.Columns.Add("Timestamp", typeof(DateTime));
            dt.Columns.Add("AccelX", typeof(double));
            dt.Columns.Add("AccelY", typeof(double));
            dt.Columns.Add("AccelZ", typeof(double));
            dt.Columns.Add("AccelMagnitude", typeof(double));
            dt.Columns.Add("GyroX", typeof(double));
            dt.Columns.Add("GyroY", typeof(double));
            dt.Columns.Add("GyroZ", typeof(double));
            dt.Columns.Add("TemperatureC", typeof(double));
            dt.Columns.Add("Roll", typeof(double));
            dt.Columns.Add("Pitch", typeof(double));
            dt.Columns.Add("Yaw", typeof(double));
            dt.Columns.Add("YawSource", typeof(string));
            dt.Columns.Add("QuaternionW", typeof(double));
            dt.Columns.Add("QuaternionX", typeof(double));
            dt.Columns.Add("QuaternionY", typeof(double));
            dt.Columns.Add("QuaternionZ", typeof(double));
            dt.Columns.Add("IsValid", typeof(bool));

            foreach (var item in items)
            {
                dt.Rows.Add(item.SessionId, item.SequenceNumber, item.ArduinoUptimeMs, item.Timestamp, (object?)item.AccelX ?? DBNull.Value, (object?)item.AccelY ?? DBNull.Value, (object?)item.AccelZ ?? DBNull.Value, (object?)item.AccelMagnitude ?? DBNull.Value, (object?)item.GyroX ?? DBNull.Value, (object?)item.GyroY ?? DBNull.Value, (object?)item.GyroZ ?? DBNull.Value, (object?)item.TemperatureC ?? DBNull.Value, (object?)item.Roll ?? DBNull.Value, (object?)item.Pitch ?? DBNull.Value, (object?)item.Yaw ?? DBNull.Value, (object?)item.YawSource ?? DBNull.Value, (object?)item.QuaternionW ?? DBNull.Value, (object?)item.QuaternionX ?? DBNull.Value, (object?)item.QuaternionY ?? DBNull.Value, (object?)item.QuaternionZ ?? DBNull.Value, item.IsValid);
            }
            return dt;
        }

        private static DataTable ToDataTableGnss(List<GnssSample> items)
        {
            var dt = new DataTable();
            dt.Columns.Add("SessionId", typeof(long));
            dt.Columns.Add("SequenceNumber", typeof(long));
            dt.Columns.Add("ArduinoUptimeMs", typeof(long));
            dt.Columns.Add("Timestamp", typeof(DateTime));
            dt.Columns.Add("FixStatus", typeof(string));
            dt.Columns.Add("FixValid", typeof(bool));
            dt.Columns.Add("Latitude", typeof(double));
            dt.Columns.Add("Longitude", typeof(double));
            dt.Columns.Add("RawLatitude", typeof(double));
            dt.Columns.Add("RawLongitude", typeof(double));
            dt.Columns.Add("DisplayLatitude", typeof(double));
            dt.Columns.Add("DisplayLongitude", typeof(double));
            dt.Columns.Add("IsInsideSafeZone", typeof(bool));
            dt.Columns.Add("IsSnapped", typeof(bool));
            dt.Columns.Add("AltitudeM", typeof(double));
            dt.Columns.Add("SpeedKmh", typeof(double));
            dt.Columns.Add("CourseDeg", typeof(double));
            dt.Columns.Add("SatellitesCount", typeof(int));
            dt.Columns.Add("SatellitesInView", typeof(int));
            dt.Columns.Add("SatellitesUsed", typeof(int));
            dt.Columns.Add("Hdop", typeof(double));
            dt.Columns.Add("GsvSeq", typeof(int));
            dt.Columns.Add("GsvUptimeMs", typeof(long));

            foreach (var item in items)
            {
                dt.Rows.Add(
                    item.SessionId,
                    item.SequenceNumber,
                    item.ArduinoUptimeMs,
                    item.Timestamp,
                    item.FixStatus,
                    item.FixValid,
                    (object?)item.Latitude ?? DBNull.Value,
                    (object?)item.Longitude ?? DBNull.Value,
                    (object?)item.RawLatitude ?? DBNull.Value,
                    (object?)item.RawLongitude ?? DBNull.Value,
                    (object?)item.DisplayLatitude ?? DBNull.Value,
                    (object?)item.DisplayLongitude ?? DBNull.Value,
                    item.IsInsideSafeZone,
                    item.IsSnapped,
                    (object?)item.AltitudeM ?? DBNull.Value,
                    (object?)item.SpeedKmh ?? DBNull.Value,
                    (object?)item.CourseDeg ?? DBNull.Value,
                    item.SatellitesCount,
                    item.SatellitesInView,
                    item.SatellitesUsed,
                    (object?)item.Hdop ?? DBNull.Value,
                    (object?)item.GsvSeq ?? DBNull.Value,
                    (object?)item.GsvUptimeMs ?? DBNull.Value);
            }
            return dt;
        }

        private static DataTable ToDataTableSatObs(List<GnssSatelliteObservation> items)
        {
            var dt = new DataTable();
            dt.Columns.Add("SessionId", typeof(long));
            dt.Columns.Add("SequenceNumber", typeof(long));
            dt.Columns.Add("ObservedAt", typeof(DateTime));
            dt.Columns.Add("GsvSeq", typeof(int));
            dt.Columns.Add("Prn", typeof(int));
            dt.Columns.Add("Constellation", typeof(string));
            dt.Columns.Add("ElevationDeg", typeof(double));
            dt.Columns.Add("AzimuthDeg", typeof(double));
            dt.Columns.Add("SnrDbHz", typeof(double));
            dt.Columns.Add("UsedInFix", typeof(bool));
            dt.Columns.Add("Status", typeof(string));

            foreach (var item in items)
            {
                dt.Rows.Add(item.SessionId, item.SequenceNumber, item.ObservedAt, (object?)item.GsvSeq ?? DBNull.Value, item.Prn, item.Constellation, (object?)item.ElevationDeg ?? DBNull.Value, (object?)item.AzimuthDeg ?? DBNull.Value, (object?)item.SnrDbHz ?? DBNull.Value, item.UsedInFix, item.Status);
            }
            return dt;
        }
    }
}
