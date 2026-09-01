using System;

namespace SWSTP.Telemetry.Backend.Services
{
    /// <summary>
    /// Thrown when a StateDefinition lookup by (EntityType, StateCode) finds no matching row.
    /// Indicates either missing seed data or an incorrect state code string.
    /// </summary>
    public sealed class StateDefinitionNotFoundException : InvalidOperationException
    {
        public string EntityType { get; }
        public string StateCode  { get; }

        public StateDefinitionNotFoundException(string entityType, string stateCode)
            : base($"StateDefinition not found: EntityType='{entityType}', StateCode='{stateCode}'. " +
                   $"Verify seed data is applied and the state code string is correct.")
        {
            EntityType = entityType;
            StateCode  = stateCode;
        }
    }
}
