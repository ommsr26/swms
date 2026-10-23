from gpiozero import PWMLED
from time import sleep
import random

# active_high=False because the NPN stage inverts the signal
led = PWMLED(17, active_high=False)

def strobe(times, delay):
    for _ in range(times):
        led.on();  sleep(delay)
        led.off(); sleep(delay)

def flicker(duration):
    # random brightness, like a faulty bulb
    for _ in range(int(duration / 0.03)):
        led.value = random.random()
        sleep(random.uniform(0.01, 0.05))

def heartbeat(beats):
    for _ in range(beats):
        for _ in range(2):
            led.value = 1; sleep(0.08)
            led.value = 0.1; sleep(0.08)
        sleep(0.5)

def ramp_and_slam(times):
    # slow build up, then instant blackout
    for _ in range(times):
        for i in range(0, 101, 2):
            led.value = i / 100
            sleep(0.015)
        led.off()
        sleep(0.2)

try:
    while True:
        strobe(30, 0.05)      # fast strobe
        flicker(3)            # chaotic flicker
        heartbeat(4)          # double-pulse heartbeat
        ramp_and_slam(3)      # build up and cut
        strobe(40, 0.02)      # very fast strobe
        led.off()
        sleep(1)

except KeyboardInterrupt:
    led.off()
