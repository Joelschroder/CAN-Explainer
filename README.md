# CAN-bussen i lastbilen

En interaktiv förklaring av hur CAN-bussar fungerar i tunga fordon. Du klickar dig igenom
15 kapitel, som en film i 3D, med övningar på vägen:

1. Varför en buss, och hur den fungerar elektriskt (tvinnat par, terminering, dominant och recessiv)
2. CAN-ramen och arbitreringen, bit för bit
3. J1939: prioritet, PGN och källadress
4. Flera bussar i fordonet och hur gateways skickar meddelanden vidare
5. Från bitar till mätvärde: digitala och analoga signaler, skala, offset, byteordning
6. Vad ett ”D” i ett datablad kan betyda
7. Dosan: instrument → gemensam buss → Vector-interface → applikation
8. Tre delprov: koppla in en CAN-givare, koppla in en spak som inte pratar CAN, och
   räkna ut värden ur loggade ramar

## Köra

Sidan är statisk och har inget byggsteg, men ES-moduler kräver en webbserver:

```sh
npm start          # python3 -m http.server 8080
# öppna http://localhost:8080
```

Vilken statisk server som helst fungerar.

### GitHub Pages

Sidan kan publiceras direkt från repots rot, utan byggsteg:

1. Öppna **Settings → Pages** i repot.
2. Under **Build and deployment**, välj **Source: Deploy from a branch**.
3. Välj grenen och mappen **/ (root)**, och spara.

Efter någon minut finns sidan på `https://<användare>.github.io/<repo>/`. Filen `.nojekyll`
gör att GitHub serverar filerna som de är.

## Test

```sh
npm test
```

Testerna täcker logiken i `js/can.js` och `js/data.js`: avkodning av J1939-ID, arbitrering,
signalavkodning, specialvärden, terminering och gateway-tabellerna.

## Struktur

| Fil | Innehåll |
| --- | --- |
| `index.html` | Sidans skelett |
| `css/style.css` | All styling. Färgerna överst läses även av 3D-scenen |
| `js/main.js` | Navigering mellan kapitel |
| `js/steps.js` | Kapitlens text, kameravyer och interaktiva delar |
| `js/ui.js` | Återanvändbara delar: oscilloskop, kopplingsövning, frågor |
| `js/scene.js` | 3D-scenen (three.js): lastbil, kabel, arbetsbänk, meddelanden |
| `js/data.js` | Noder, bussar, meddelanden, gateway-tabeller och J1939-uppslag |
| `js/can.js` | Ren CAN/J1939-logik utan DOM |
| `vendor/` | three.js r170 (MIT) |
| `tools/build-artifact.mjs` | Gör en sidfil för publicering som Claude-artifact |

### Lägga till ett kapitel eller delprov

Lägg ett objekt i `STEPS` i `js/steps.js`:

```js
{
  id: 'mitt-steg',            // används i adressfältet (#mitt-steg)
  kind: 'quiz',               // utelämna för vanliga kapitel
  title: 'Rubrik',
  body: `<p>Text före den interaktiva delen.</p>`,
  view: { group: 'bench', cam: VIEW.bench, ambient: ['b1'] },
  mount(el, world) { /* bygg widgeten i el, returnera ev. städfunktion */ },
  after: `<p>Text efter.</p>`,
}
```

En ny kopplingsövning är ett anrop till `wiringExercise` i `js/ui.js` med pinnar, plintar och
vilka kopplingar som är godkända. Se delprov 1 och 2 som mall.

### Lägga till en styrenhet, buss eller ett meddelande

Allt sådant ligger i `js/data.js`. En buss är en polylinje. Noder ansluts automatiskt till
närmaste punkt på den. Ett meddelande anger avsändare, vilka noder som använder det och vilka
gateways som skickar det vidare till vilka bussar.

## Att tänka på

- Lastbilen är en pedagogisk förenkling. Bussarnas antal, namn och innehåll skiljer mellan tillverkare.
- Databladen i delproven är påhittade för övningens skull.
- J1939-exemplen (PGN, SPN, skala, offset, källadresser) är ett litet urval. Kontrollera alltid
  mot J1939 Digital Annex eller er egen DBC-fil innan ni bygger något på dem.
