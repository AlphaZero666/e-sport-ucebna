# Otevření e-sportové učebny – web akce

Web k otevření nové e-sportové učebny na SOŠ informatiky a spojů Kolín (7. 11. 2026).
Projekt do předmětu Tvorba webových stránek (TWS).

## Struktura

```
index.html        – obsah celé stránky (všechny texty jsou zde)
css/style.css     – vzhled, rozvržení a media queries pro mobil
js/main.js        – animace, mobilní menu, odpočet, výběr hrdiny, kalendář…
js/classroom.js   – interaktivní 3D vizualizace učebny (Three.js)
favicon.svg       – ikona webu
```

## Co je potřeba doplnit

V `index.html` jsou místa označená komentářem `✏️ DOPLŇTE`:

- jméno a příjmení pořadatele (sekce Kontakt + patička),
- e-mail pořadatele (2× v sekci Kontakt),
- telefon pořadatele.

## Spuštění a nasazení

- **Na doménu:** nahrajte celou složku (s `index.html` v kořeni) na hosting. Není potřeba nic sestavovat.
- **Lokálně:** ve složce spusťte `python -m http.server 5173` a otevřete <http://localhost:5173>.
- Knihovny se načítají z CDN, proto web potřebuje připojení k internetu.

## Použité knihovny

- [GSAP + ScrollTrigger](https://gsap.com/) – animace při scrollu
- [Lenis](https://lenis.darkroom.engineering/) – plynulý scroll
- [Three.js](https://threejs.org/) – 3D vizualizace učebny
- Písma Archivo a JetBrains Mono (Google Fonts)

## Funkce

- úvodní „brána“, která se při scrollu otevře a odhalí 3D učebnu,
- živý odpočet do začátku akce, štítek „Právě probíhá“ v harmonogramu,
- 3D učebna: otáčení tažením, přepínání pohledů, zvýraznění vybavení ze seznamu,
- výběr účinkujících ve stylu bojové hry (ovládání i šipkami),
- stažení události do kalendáře (.ics), mapa, mobilní menu,
- respektuje systémové nastavení „omezit pohyb“,
- tajemství: zkuste na klávesnici ↑ ↑ ↓ ↓ ← → ← → B A.
