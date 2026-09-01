using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using SWSTP.Telemetry.Backend.Models;
using SWSTP.Telemetry.Backend.Services;

namespace SWSTP.Telemetry.Backend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TelemetryController : ControllerBase
    {
        private readonly ITelemetryIngestionService _ingestionService;

        public TelemetryController(ITelemetryIngestionService ingestionService)
        {
            _ingestionService = ingestionService;
        }

        [HttpPost("ingest-batch")]
        public async Task<IActionResult> IngestBatch([FromBody] IngestBatchDto batch)
        {
            if (batch == null || batch.Packets == null || batch.Packets.Count == 0)
            {
                return BadRequest(new { error = "Empty telemetry batch payload" });
            }

            await _ingestionService.EnqueueBatchAsync(batch);
            return Ok(new { status = "QUEUED", count = batch.Packets.Count });
        }
    }
}
