using System;
using System.Linq;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SWSTP.Telemetry.Backend.Data;
using SWSTP.Telemetry.Backend.Hubs;
using SWSTP.Telemetry.Backend.Services;
using SWSTP.Telemetry.Backend.Services.LiveState;
using SWSTP.Telemetry.Backend.Services.Motion;
using SWSTP.Telemetry.Backend.Services.Spatial;

var builder = WebApplication.CreateBuilder(args);

// 1. Add DbContext with SQL Server NetTopologySuite Spatial Support
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
builder.Services.AddDbContext<TelemetryDbContext>(options =>
    options.UseSqlServer(connectionString, x => x.UseNetTopologySuite()));

// 2. Add SignalR
builder.Services.AddSignalR();

// 3. Operational Domain Configuration & State Resolver
builder.Services.AddSingleton<OperationalConstants>();
builder.Services.AddSingleton<IStateDefinitionResolver, StateDefinitionResolver>();
builder.Services.AddSingleton<ILiveTruckStateStore, LiveTruckStateStore>();

// 4. Spatial & Speed Fusion Services
builder.Services.AddSingleton<ICoordinateProjectionService, CoordinateProjectionService>();
builder.Services.AddSingleton<ISpeedFusionService, PrototypeSpeedFusionService>();

// 5. Core Operational Domain Services
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddScoped<ISessionAuthorizationService, SessionAuthorizationService>();
builder.Services.AddScoped<IStateTransitionService, StateTransitionService>();
builder.Services.AddScoped<IOperationalSessionService, OperationalSessionService>();
builder.Services.AddScoped<IRoadAssignmentService, RoadAssignmentService>();
builder.Services.AddScoped<IProximityService, ProximityService>();
builder.Services.AddScoped<ICoverageService, CoverageService>();
builder.Services.AddScoped<ICollectionEventService, CollectionEventService>();
builder.Services.AddScoped<IEvidenceService, EvidenceService>();
builder.Services.AddScoped<IOperationalAlertService, OperationalAlertService>();

// 6. Background Workers
builder.Services.AddSingleton<TelemetryIngestionService>();
builder.Services.AddSingleton<ITelemetryIngestionService>(sp => sp.GetRequiredService<TelemetryIngestionService>());
builder.Services.AddHostedService(sp => sp.GetRequiredService<TelemetryIngestionService>());
builder.Services.AddHostedService<SessionActivationService>();
builder.Services.AddHostedService<RetentionCleanupService>();
builder.Services.AddHostedService<OfflineAlertEvaluatorService>();

// 7. Controllers, Swagger, CORS
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowNamedFloatingPointLiterals;
        options.JsonSerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("ConfiguredCors", policy =>
    {
        policy.SetIsOriginAllowed(origin => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// Startup validation, cache warming, and GIS road/house seeding
try
{
    var projService = app.Services.GetRequiredService<ICoordinateProjectionService>();
    projService.ValidateConfiguration();

    var stateResolver = app.Services.GetRequiredService<IStateDefinitionResolver>();
    stateResolver.WarmCacheAsync("OPERATIONAL_SESSION", "COLLECTION_EVENT", "DEVICE", "VEHICLE").GetAwaiter().GetResult();

    DbGisSeeder.SeedAsync(app.Services).GetAwaiter().GetResult();
}
catch (Exception ex)
{
    var logger = app.Services.GetRequiredService<ILogger<Program>>();
    logger.LogWarning(ex, "WarmCache/Validation/GIS Seeding on startup logged an exception.");
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("ConfiguredCors");
app.UseAuthorization();
app.MapControllers();
app.MapHub<TelemetryHub>("/hubs/telemetry");

app.Run();
