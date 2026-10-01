# Out the Door

A one-page web app that says when to leave for the next Manhattan-bound train
from Bushwick (M, J, Z, L), plus a weather heads-up only when you need to do something about it.

- Trains: MTA real-time subway feeds (free, no key), read directly in the browser.
- Weather: Open-Meteo (free, no key), next 3 hours.
- Leave time = arrival − walk time − 1 min.

Edit `OPTIONS` (stations and walk minutes) and `HOME` near the top of `index.html`.
