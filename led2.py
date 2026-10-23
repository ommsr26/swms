from gpiozero import PWMLED
from time import sleep
import random

# active_high=False because the NPN stage inverts the signal
led = PWMLED(17, active_high=False)

def clouds(duration):
    # slow, dim drifting glow
    level = 0.05
    for _ in range(int(duration / 0.05)):
        level += random.uniform(-0.02, 0.02)
        level = max(0.02, min(0.15, level))
        led.value = level
        sleep(0.05)

def lightning():
    # a few rapid return strokes, like real lightning
    for _ in range(random.randint(2, 5)):
        led.value = random.uniform(0.7, 1.0)
        sleep(random.uniform(0.02, 0.06))
        led.value = random.uniform(0.0, 0.2)
        sleep(random.uniform(0.03, 0.09))
    # big final flash
    led.value = 1.0
    sleep(0.1)
    # slow afterglow fade
    for i in range(100, 0, -4):
        led.value = (i / 100) ** 2
        sleep(0.015)
    led.off()

try:
    while True:
        clouds(random.uniform(2, 7))
        lightning()
        if random.random() < 0.4:      # sometimes a second strike
            sleep(random.uniform(0.2, 0.8))
            lightning()

except KeyboardInterrupt:
    led.off()
