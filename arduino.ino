#include <ESP8266WiFi.h>
#include <FirebaseESP8266.h>
#include <DHT.h>
#include "arduino_secrets.h"

// Firebase Project Credentials
#define FIREBASE_HOST "tempmonitor-e2c3a-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH ""  // Test mode on hone ki wajah se zaroorat nahi hai

// Sensor aur Buzzer Pins
#define DHTPIN D2
#define DHTTYPE DHT11
#define BUZZER_PIN D5

DHT dht(DHTPIN, DHTTYPE);

// Firebase Objects
FirebaseData firebaseData;
FirebaseAuth auth;
FirebaseConfig config;

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);  // Shuru mein buzzer off rakho

  dht.begin();

  // Wi-Fi Connect
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Wi-Fi Connected! IP: ");
  Serial.println(WiFi.localIP());

  // Firebase Configuration
  config.host = FIREBASE_HOST;
  config.database_url = FIREBASE_HOST;
  config.signer.test_mode = true;

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
}

void loop() {
  delay(2000);

  float h = dht.readHumidity();
  float t = dht.readTemperature();  // Celsius mein temperature

  if (isnan(h) || isnan(t)) {
    Serial.println("Failed to read from DHT sensor!");
    return;
  }

  Serial.print("Temperature: ");
  Serial.print(t);
  Serial.print(" °C  |  Humidity: ");
  Serial.print(h);
  Serial.println(" %");

  // Temperature upload to Firebase
  if (Firebase.setFloat(firebaseData, "/ServerRoom/Temperature", t)) {
    Serial.println("Temperature uploaded successfully");
  } else {
    Serial.print("Temperature upload failed: ");
    Serial.println(firebaseData.errorReason());
  }

  // Humidity upload to Firebase
  if (Firebase.setFloat(firebaseData, "/ServerRoom/Humidity", h)) {
    Serial.println("Humidity uploaded successfully");
  } else {
    Serial.print("Humidity upload failed: ");
    Serial.println(firebaseData.errorReason());
  }

  // Buzzer condition: 23.0°C se upar par ON, warna OFF
  if (t > 23.0) {
    digitalWrite(BUZZER_PIN, HIGH);
  } else {
    digitalWrite(BUZZER_PIN, LOW);
  }
}
