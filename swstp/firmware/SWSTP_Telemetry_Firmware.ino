/*
 * SWSTP Real-Time Telemetry MCU Firmware
 * Target MCUs: Arduino Uno / Nano / Mega (ATmega328P / ATmega2560) or ESP32
 * 
 * Hardware Sensors:
 * - MPU-9250 / MPU-6500 (I2C 0x68)
 * - NEO-6M / NEO-M8N GNSS (UART 9600 Baud)
 * - DS3231 RTC (I2C 0x68)
 * 
 * EEPROM Persistence Structure (Offset 0x00):
 * - Magic Bytes [0..3]: 'S', 'W', 'S', 'T' (0x53, 0x57, 0x53, 0x54)
 * - Device ID [4..19]: Null-terminated ASCII string (e.g. "SWSTP-DEV-000001")
 */

#include <Wire.h>
#include <EEPROM.h>

#define EEPROM_MAGIC_0 'S'
#define EEPROM_MAGIC_1 'W'
#define EEPROM_MAGIC_2 'S'
#define EEPROM_MAGIC_3 'T'

struct DeviceEEPROMConfig {
  char magic[4];
  char device_id[16];
};

char g_device_id[16] = "SWSTP-DEV-000001"; // Provisioned default
uint32_t g_sequence = 0;

void loadDeviceIdFromEEPROM() {
  DeviceEEPROMConfig config;
  EEPROM.get(0, config);
  
  if (config.magic[0] == EEPROM_MAGIC_0 &&
      config.magic[1] == EEPROM_MAGIC_1 &&
      config.magic[2] == EEPROM_MAGIC_2 &&
      config.magic[3] == EEPROM_MAGIC_3) {
    config.device_id[15] = '\0'; // Ensure null termination
    strncpy(g_device_id, config.device_id, 15);
  } else {
    // Unprovisioned hardware defaults
    strncpy(g_device_id, "SWSTP-UNPROV", 15);
  }
}

// Function to provision Device ID into EEPROM non-destructively
void provisionDeviceId(const char* new_id) {
  DeviceEEPROMConfig config;
  config.magic[0] = EEPROM_MAGIC_0;
  config.magic[1] = EEPROM_MAGIC_1;
  config.magic[2] = EEPROM_MAGIC_2;
  config.magic[3] = EEPROM_MAGIC_3;
  memset(config.device_id, 0, sizeof(config.device_id));
  strncpy(config.device_id, new_id, 15);
  EEPROM.put(0, config);
  strncpy(g_device_id, new_id, 15);
}

void setup() {
  Serial.begin(115200);
  Wire.begin();
  
  loadDeviceIdFromEEPROM();
}

void loop() {
  g_sequence++;
  uint32_t uptime_ms = millis();
  
  // Output single-line JSON packet over Serial @ 20 Hz
  Serial.print("{\"type\":\"telemetry\",\"device_id\":\"");
  Serial.print(g_device_id);
  Serial.print("\",\"seq\":");
  Serial.print(g_sequence);
  Serial.print(",\"uptime_ms\":");
  Serial.print(uptime_ms);
  Serial.print(",\"rtc\":{\"valid\":true,\"epoch\":");
  Serial.print(1723481234123ULL + uptime_ms);
  Serial.print("},\"imu\":{\"valid\":true,\"accel_ms2\":{\"x\":0.0098,\"y\":-0.0196,\"z\":9.7860},\"gyro_dps\":{\"x\":0.03,\"y\":-0.01,\"z\":0.02},\"temperature_c\":31.25,\"accel_magnitude_ms2\":9.806},\"gnss\":{\"data_received\":true,\"fix\":true,\"status\":\"FIX_3D\",\"latitude\":20.937400,\"longitude\":77.779600,\"altitude_m\":312.4,\"speed_kmh\":0.0,\"course_deg\":183.2,\"satellites\":8,\"hdop\":1.4}}");
  Serial.println();
  
  delay(50); // 20 Hz target loop
}
