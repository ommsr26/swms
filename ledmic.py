from gpiozero import PWMLED
import sounddevice as sd
import numpy as np

# active_high=False because the NPN stage inverts the signal
led = PWMLED(17, active_high=False)

NOISE_FLOOR = 0.005   # RMS below this counts as silence
LOUD = 0.15           # RMS at or above this = full brightness
ATTACK = 0.6          # how fast it rises (0-1, higher = faster)
RELEASE = 0.08        # how fast it falls (lower = slower)

level = 0.0

def callback(indata, frames, time, status):
    global level
    rms = float(np.sqrt(np.mean(indata ** 2)))
    x = (rms - NOISE_FLOOR) / (LOUD - NOISE_FLOOR)
    x = max(0.0, min(1.0, x))
    rate = ATTACK if x > level else RELEASE
    level += (x - level) * rate
    led.value = level

try:
    with sd.InputStream(channels=1, samplerate=16000,
                        blocksize=800, callback=callback):   # 50 ms blocks
        print("Listening... Ctrl+C to stop")
        while True:
            sd.sleep(1000)
except KeyboardInterrupt:
    led.off()
