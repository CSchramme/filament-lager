// Startdatei für Plesk (Node.js-Erweiterung mit Phusion Passenger) und
// andere Hoster, die die Startdatei per require() laden. Passenger kann
// keine ES-Module laden, deshalb wird der Server hier per import() geholt.
import('./src/server.js').catch((err) => {
  console.error('Filament-Lager konnte nicht starten:', err);
  process.exit(1);
});
