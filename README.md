# Trains

A personal departure board for Bushwick: when to leave for the next Manhattan-bound M, J, Z or L,
plus live door-to-door times to TMPL clubs and grocery stores.

Live at https://sifrkalon.github.io/out-the-door/ (add to Home Screen in Safari).

## What it does
- Live MTA arrivals for Central Av, Myrtle Av–Broadway, Jefferson St and Morgan Av, minus the real walk and a minute of slack.
- Tap a train to pin it: the big countdown follows it, it chimes at 2 minutes and at "time to go", and the screen stays on.
- Weather and air-quality heads-ups only when you need to do something; a late-night note when the M isn't running into Manhattan.
- Service notices for your lines, tucked away.
- TMPL and Groceries tabs: how soon you could actually be there, using live arrivals at the exit station.

## Files
- `index.html`, `style.css`: the page
- `app.js`: picks the train, draws the page, handles taps (pin, chime, keep-awake, moon, gold number)
- `data.js`: MTA trains and alerts, Open-Meteo weather and air quality, sunset/moon line
- `places.js`: TMPL clubs and grocery stores, with measured walks
- `mosaic.js`: the tile band, station-tablet sign, mosaic train lines
- `fx.js`: the living background (sky, weather, Grand Central ceiling at night, the little L and M, visitors)
- `pretend.js`: tap SIFRKALON to preview any weather, time, moon or visitor
- `sound.js`: the optional soundscape (Sound button in the footer), generated live with Web Audio: a soft city hum, a train rumble now and then, rain and wind from the weather, quiet bell tones (a major chord by day, a softer one at night).
- `suncalc.js`: SunCalc 1.9.0 by Vladimir Agafonkin (BSD-2-Clause, see `suncalc-LICENSE.txt`)
