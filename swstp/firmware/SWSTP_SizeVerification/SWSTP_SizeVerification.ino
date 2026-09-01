/*
 * SWSTP SIZE VERIFICATION SKETCH
 * Upload this to an ATmega328P (Arduino Uno/Nano) to get actual sizeof()
 * values at runtime. This does NOT affect the production firmware.
 * 
 * Expected output on Serial Monitor @ 115200:
 *   sizeof(GnssSatellite) = 8
 *   sizeof(gnssWorkingSatellites) = 128
 *   sizeof(gnssSatellites) = 128
 *   sizeof(gnssNmeaLine) = 96
 *   sizeof(gnssUsedConstellationId) = 16
 *   freeRAM = (varies by board state)
 */

#include <Arduino.h>

enum ConstellationId : uint8_t {
  CONST_GPS = 0, CONST_GLO, CONST_GAL, CONST_BDS, CONST_QZS, CONST_GNSS, CONST_UNK
};
#define SAT_FLAG_SNR_VALID   0x01
#define SAT_FLAG_USED_IN_FIX 0x02

struct GnssSatellite {
  uint16_t        prn;
  int8_t          elevationDeg;
  uint16_t        azimuthDeg;
  uint8_t         snrDbHz;
  uint8_t         flags;
  ConstellationId constId;
};

#define MAX_GNSS_SATELLITES 16

static GnssSatellite gnssWorkingSatellites[MAX_GNSS_SATELLITES];
static GnssSatellite gnssSatellites[MAX_GNSS_SATELLITES];
static ConstellationId gnssUsedConstellationId[16];
static char gnssNmeaLine[96];

int freeRam() {
  extern int __heap_start, *__brkval;
  int v;
  return (int)&v - (__brkval == 0 ? (int)&__heap_start : (int)__brkval);
}

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println(F("=== SIZE VERIFICATION ==="));
  Serial.print(F("sizeof(GnssSatellite) = "));
  Serial.println(sizeof(GnssSatellite));
  Serial.print(F("sizeof(gnssWorkingSatellites) = "));
  Serial.println(sizeof(gnssWorkingSatellites));
  Serial.print(F("sizeof(gnssSatellites) = "));
  Serial.println(sizeof(gnssSatellites));
  Serial.print(F("sizeof(gnssNmeaLine) = "));
  Serial.println(sizeof(gnssNmeaLine));
  Serial.print(F("sizeof(gnssUsedConstellationId) = "));
  Serial.println(sizeof(gnssUsedConstellationId));
  Serial.print(F("freeRAM = "));
  Serial.println(freeRam());
  Serial.println(F("=== END ==="));
}

void loop() {}
