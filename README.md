# Out the Door

A one-page web app that says when to leave for the next Manhattan-bound train
from Bushwick (M, J, Z, L), plus a weather heads-up only when you need to do something about it.

- Trains: MTA real-time subway feeds (free, no key), read directly in the browser.
- Weather: Open-Meteo (free, no key), next 3 hours.
- Leave time = arrival − walk time − 1 min.

Edit `OPTIONS` (stations and walk minutes) and `HOME` near the top of `index.html`.

Also shows, only when relevant:
- MTA service alerts for your lines, between your stations and Manhattan (active now or starting within 12 hours)
- Air quality warnings (US AQI ≥ 101, Open-Meteo)
- Sunset/sunrise, plus moonrise around a full moon and a note at new moon (SunCalc, computed on the device)

`suncalc.js` is SunCalc 1.9.0 by Vladimir Agafonkin (BSD-2-Clause, see `suncalc-LICENSE.txt`).
