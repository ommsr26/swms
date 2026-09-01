using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SWSTP.Telemetry.Backend.Data;

namespace SWSTP.Telemetry.Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class HealthController : ControllerBase
    {
        private readonly TelemetryDbContext _db;

        public HealthController(TelemetryDbContext db)
        {
            _db = db;
        }

        [HttpGet]
        public async Task<IActionResult> GetHealth()
        {
            try
            {
                bool canConnect = await _db.Database.CanConnectAsync();
                if (canConnect)
                {
                    return Ok(new
                    {
                        status = "HEALTHY",
                        database = "CONNECTED",
                        timestamp = DateTime.UtcNow
                    });
                }
                else
                {
                    return StatusCode(503, new
                    {
                        status = "DEGRADED",
                        database = "DISCONNECTED",
                        message = "Database connection test failed.",
                        timestamp = DateTime.UtcNow
                    });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(503, new
                {
                    status = "UNHEALTHY",
                    database = "ERROR",
                    message = ex.Message,
                    timestamp = DateTime.UtcNow
                });
            }
        }
    }
}
