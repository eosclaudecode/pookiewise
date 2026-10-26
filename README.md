# 🐻 PookieWise

Ausgaben gemeinsam aufteilen, zum Beispiel mit der Partnerin, der WG oder im Urlaub. Alle Gruppenmitglieder sehen Änderungen sofort auf allen Geräten.

- **Gruppenarten:** ✈️ *Ereignis* (z. B. Urlaub, optional mit Zeitraum) oder 🔁 *Laufend* (Monats- bzw. Wochenansicht, z. B. Haushalt)
- **🏦 Gemeinsame Kasse** pro Gruppe, optional mit Sollbeitrag pro Person. Einzahlungen, Ausgaben aus der Kasse und der Kassenstand werden mitgeführt.
- **Übersicht:** Gesamtausgaben, wer was bezahlt hat und wie viel davon sein Anteil war, Verteilung nach Kategorie, zeitlicher Verlauf, Einzahlungen in die Kasse
- **Aufteilung** gleichmäßig, nach exakten Beträgen oder nach Anteilen, dazu vereinfachte Schulden und Ausgleichszahlungen
- **Teilen** per Einladungslink, Anmeldung mit Google oder per Mail-Link ohne Passwort. Personen ohne Konto können als reine Namen mitgeführt werden.
- Funktioniert dank Offline-Cache auch ohne Netz und synchronisiert, sobald wieder eine Verbindung besteht.

Es gibt keinen Build-Schritt: statische Dateien, Firebase (Auth + Firestore) wird vom gstatic-CDN geladen.

## Einrichtung (einmalig, ca. 10 Minuten)

1. **Firebase-Projekt anlegen:** Auf <https://console.firebase.google.com> ein neues Projekt erstellen, z. B. `pookiewise`. Google Analytics wird nicht gebraucht.
2. **Web-App registrieren:** Projekteinstellungen → Allgemein → „App hinzufügen“ → Web (`</>`). Das angezeigte `firebaseConfig`-Objekt in [`firebase-config.js`](firebase-config.js) einfügen.
3. **Anmeldung aktivieren:** Authentication → Anmeldemethode → Google → aktivieren.
   Dann *Neuen Anbieter hinzufügen* → **E-Mail-Adresse/Passwort** → beide Schalter aktivieren, auch „E-Mail-Link (Anmeldung ohne Passwort)“.
   Unter Authentication → Einstellungen → *Autorisierte Domains* `eosclaudecode.github.io` hinzufügen (`localhost` ist schon eingetragen).
4. **Firestore anlegen:** Firestore Database → Datenbank erstellen → Produktionsmodus, Standort z. B. `eur3 (Europe)`.
   Unter *Regeln* den Inhalt von [`firestore.rules`](firestore.rules) einfügen und **Veröffentlichen** klicken.
5. **Veröffentlichen:** Änderungen nach `main` pushen. GitHub Pages liefert die Seite unter <https://eosclaudecode.github.io/pookiewise/> aus.

## Jemanden einladen

Öffne die Gruppe, gehe zum Tab **Gruppe** und klicke auf **Link kopieren**. Schick den Link weiter. Wer ihn öffnet, meldet sich mit Google oder per Mail-Link an, tritt bei und wählt aus, welche Person in der Gruppe sie ist. Über „Neuen Link erzeugen“ wird der alte Link ungültig.

## Lokal testen

```bash
python3 -m http.server 8000
```

Dann <http://localhost:8000> öffnen. Unter <http://localhost:8000/#selftest> laufen die Selbsttests für den Rechenkern, auch ohne Firebase.

## Datenmodell

- `groups/{id}`: Name, Art (`event`/`recurring`), Periode, Kasse, Mitglieder (`members`, mit `uid`, wenn ein Konto verknüpft ist), `memberUids`, `inviteCode`
- `groups/{id}/expenses/{id}`: `type` ist `expense` | `potExpense` | `contribution` | `settlement`. Beträge stehen in Cent.
  Die Kasse ist intern das virtuelle Mitglied `__pot`. Dadurch gehen alle Salden inklusive Kasse immer auf 0 auf.

Die alte Version hat ihre Daten nur im Browser gespeichert (`localStorage`). Ist dort noch etwas vorhanden, bietet die App nach dem Login an, diese Daten in die Cloud zu übernehmen.

## Hinweis zur Sicherheit

Zugriff auf eine Gruppe haben nur angemeldete Mitglieder. Das erzwingt `firestore.rules`; die Werte in `firebase-config.js` sind öffentlich und kein Geheimnis.
Auf GitHub Pages teilt sich PookieWise die Origin `eosclaudecode.github.io` mit den anderen Seiten dieses Accounts. Theoretisch könnte eine davon die Login-Sitzung mitlesen. Wer das ausschließen will, hostet PookieWise auf einer eigenen Domain (z. B. Cloudflare Pages) und trägt diese Domain in Firebase als autorisierte Domain ein. Der Code muss dafür nicht geändert werden.
