from gpiozero import PWMLED
from time import sleep

# active_high=False because the NPN stage inverts the signal
led = PWMLED(17, active_high=False)

MORSE = {
    'A': '.-',   'B': '-...', 'C': '-.-.', 'D': '-..',  'E': '.',
    'F': '..-.', 'G': '--.',  'H': '....', 'I': '..',   'J': '.---',
    'K': '-.-',  'L': '.-..', 'M': '--',   'N': '-.',   'O': '---',
    'P': '.--.', 'Q': '--.-', 'R': '.-.',  'S': '...',  'T': '-',
    'U': '..-',  'V': '...-', 'W': '.--',  'X': '-..-', 'Y': '-.--',
    'Z': '--..',
    '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
    '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
}

UNIT = 0.2  # seconds per dot, lower = faster

def blink(duration):
    led.on()
    sleep(duration)
    led.off()
    sleep(UNIT)             # gap between symbols

def send(text):
    for word in text.upper().split():
        for letter in word:
            for symbol in MORSE.get(letter, ''):
                blink(UNIT if symbol == '.' else UNIT * 3)
            sleep(UNIT * 2)     # gap between letters (3 units total)
        sleep(UNIT * 4)         # gap between words (7 units total)

try:
    while True:
        msg = input("Message (Ctrl+C to quit): ")
        send(msg)

except KeyboardInterrupt:
    led.off()
