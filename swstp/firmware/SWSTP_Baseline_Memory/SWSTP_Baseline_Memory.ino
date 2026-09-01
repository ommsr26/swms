/*
 * SWSTP ORIGINAL FIRMWARE — MEMORY BASELINE SKETCH
 *
 * This reproduces ONLY the global variable declarations from the
 * original SWSTP_Telemetry_GNSS_Detailed.ino (2823 lines, 45225 bytes)
 * as it existed before the memory optimisation pass.
 *
 * Used ONLY to get the compiler's "Global variables use X bytes" number
 * for an apples-to-apples before/after comparison.
 *
 * The original struct was:
 *   struct GnssSatellite { uint16_t prn; int16_t elevation; int16_t azimuth;
 *     int16_t snr; bool snrValid; bool usedInFix; char constellation[6]; };
 *   sizeof = 16 bytes
 *
 * NOTE: The full function bodies are omitted — only global declarations 
 * matter for dynamic memory (BSS/data segment) measurement.
 */

#include <Wire.h>
#include <RTClib.h>
#include <MPU6500_WE.h>
#include <TinyGPS++.h>
#include <SoftwareSerial.h>
#include <EEPROM.h>
#include <math.h>

#define PC_BAUD_RATE 115200
#define GNSS_BAUD_RATE 9600
#define TELEMETRY_RATE_HZ 20

// EEPROM device ID (added before optimisation pass)
char deviceId[16] = "UNPROVISIONED";

// Status LED
const uint8_t ALL_LEDS[] = { 9, 8, 10, 11, 12 };
const uint8_t NUM_LEDS = 5;

// Module objects (same as original)
RTC_DS3231 rtc;
MPU6500_WE mpu = MPU6500_WE(0x69);
TinyGPSPlus gps;
SoftwareSerial gnssSerial(3, 4);

// Module status
bool rtcOK = false;
bool imuOK = false;
bool gnssDataSeen = false;

// Telemetry state
unsigned long sequenceNumber = 0;
unsigned long lastTelemetryMs = 0;
unsigned long bootMillis = 0;

// IMU orientation
float rollDeg = 0.0f;
float pitchDeg = 0.0f;
float yawDeg = 0.0f;
unsigned long lastImuMicros = 0;
const float COMPLEMENTARY_ALPHA = 0.98f;

// LED timing
unsigned long lastFaultToggle = 0;
bool faultBlinkState = false;
const unsigned long FAULT_BLINK_INTERVAL = 400;
unsigned long lastYellowToggle = 0;
bool yellowState = false;
const unsigned long YELLOW_BLINK_INTERVAL = 1000;

// GNSS tracking
unsigned long lastGnssDataMs = 0;
const unsigned long GNSS_DATA_TIMEOUT_MS = 3000;

// ── ORIGINAL struct: 16 bytes each ──────────────────────────────────────────
struct GnssSatellite {
  uint16_t prn;           // 2
  int16_t  elevationDeg;  // 2
  int16_t  azimuthDeg;    // 2
  int16_t  snrDbHz;       // 2
  bool     snrValid;      // 1
  bool     usedInFix;     // 1
  char     constellation[6]; // 6
};                        // = 16 bytes

#define MAX_GNSS_SATELLITES 16

GnssSatellite gnssWorkingSatellites[MAX_GNSS_SATELLITES]; // 16*16 = 256 bytes
GnssSatellite gnssSatellites[MAX_GNSS_SATELLITES];        // 16*16 = 256 bytes

uint8_t gnssWorkingSatelliteCount = 0;
uint8_t gnssSatelliteCount = 0;
uint16_t gnssSatellitesInView = 0;
uint8_t gnssGsvExpectedMessages = 0;
uint8_t gnssGsvCurrentMessage = 0;
bool gnssGsvCycleActive = false;
unsigned long lastGnssSatelliteSnapshotMs = 0;
unsigned long lastGnssDetailEmitMs = 0;

// ── ORIGINAL GSA storage: 128 bytes ─────────────────────────────────────────
uint16_t gnssUsedPrns[16];           // 32 bytes
char gnssUsedConstellation[16][6];   // 96 bytes
uint8_t gnssUsedPrnCount = 0;

// ── ORIGINAL NMEA buffer: 128 bytes ─────────────────────────────────────────
char gnssNmeaLine[128];
uint8_t gnssNmeaLineLength = 0;

void setup() {
  Serial.begin(PC_BAUD_RATE);
  Serial.println(F("BEFORE-BASELINE"));
  Serial.print(F("sizeof(GnssSatellite)="));
  Serial.println(sizeof(GnssSatellite));
  Serial.print(F("sizeof(gnssWorkingSatellites)="));
  Serial.println(sizeof(gnssWorkingSatellites));
  Serial.print(F("sizeof(gnssUsedConstellation)="));
  Serial.println(sizeof(gnssUsedConstellation));
  Serial.print(F("sizeof(gnssNmeaLine)="));
  Serial.println(sizeof(gnssNmeaLine));
}

void loop() {}
