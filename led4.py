from gpiozero import PWMLED
from time import sleep
import math
import random

# active_high=False because the NPN stage inverts the signal
led = PWMLED(17, active_high=False)

try:
    phase = 0.0
    speed = 0.03
    while True:
        # smooth sine curve, never fully off
        brightness = 0.05 + 0.6 * (math.sin(phase) + 1) / 2
        led.value = brightness ** 2          # squared for natural-looking fade
        phase += speed
        speed += random.uniform(-0.001, 0.001)   # slow drift in breathing rate
        speed = max(0.02, min(0.05, speed))
        sleep(0.02)

except KeyboardInterrupt:
    led.off()
