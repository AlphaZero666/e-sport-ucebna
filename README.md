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

## Autor

Pavel Procházka – pořadatel akce a autor webu.

## Spuštění a nasazení

- **Na doménu:** nahrajte celou složku (s `index.html` v kořeni) na hosting. Není potřeba nic sestavovat.
- **Lokálně:** ve složce spusťte `python -m http.server 5173` a otevřete <http://localhost:5173>.
- Knihovny se načítají z CDN, proto web potřebuje připojení k internetu.

## Použité knihovny

- [GSAP + ScrollTrigger](https://gsap.com/) – otevírání brány při scrollu
- [Three.js](https://threejs.org/) – 3D vizualizace učebny
- Písmo Archivo (Google Fonts)

## Funkce

- úvodní „brána“, která se při scrollu otevře a odhalí 3D učebnu,
- harmonogram jako tištěný rozpis, v den akce se označí, co právě probíhá,
- 3D učebna: otáčení tažením, přepínání pohledů, zvýraznění vybavení ze seznamu,
- stažení události do kalendáře (.ics), mapa, mobilní menu,
- respektuje systémové nastavení „omezit pohyb“.
