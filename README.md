# Digital Temperature Monitoring System

## Project overview

This project contains a browser dashboard for a server-room temperature monitoring system. The dashboard is built with HTML, CSS, and JavaScript. It is designed to display readings from Firebase Realtime Database, including temperature, humidity, cooling status, history charts, and threshold alerts.

## Files

- `index.html` – dashboard page structure.
- `style.css` – dashboard appearance and responsive layout.
- `script.js` – Firebase data handling, charts, refresh, and alert settings.
- `arduino.ino` – NodeMCU ESP8266 firmware for the DHT11 sensor and Firebase.
- `new.c/pro.c` – a separate C practice program that finds the largest of three numbers; it is not NodeMCU firmware.

## NodeMCU firmware

The firmware reads temperature and humidity from a DHT11 sensor, sends both values to Firebase Realtime Database, and controls a buzzer. The sketch uses D2 for the DHT11 data pin and D5 for the buzzer. It requires the ESP8266 Wi-Fi library, Firebase ESP8266 library, and DHT sensor library.

Copy `arduino_secrets.example.h` to `arduino_secrets.h`, then put your own `WIFI_SSID` and `WIFI_PASSWORD` values in the local copy before compiling. `arduino_secrets.h` is ignored by Git; the example template is safe to share.

## Setup notes

The web page loads Chart.js and Firebase libraries from their CDNs. `script.js` contains the Firebase web app configuration. Firebase web API keys are normally identifiers, but access to the Realtime Database must be protected by correct Firebase security rules. Never commit service-account keys, private tokens, Wi-Fi passwords, or webhook secrets. The current firmware uses Firebase test mode, so configure secure database rules before using it beyond a private demo.

## Project report

Use this repository as the source-code reference for the report. Add project-specific details such as the sensor model, NodeMCU board, circuit diagram, Firebase data format, testing results, and screenshots after confirming them from the actual build.
