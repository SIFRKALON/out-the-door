// Out the Door: "Time to TMPL". For each club, the soonest you could actually be inside,
// using live train times all the way to the exit station (not schedules), plus the walk and a few minutes to change.
const CHANGE_MIN = 5;   // locker room: from the front desk to the sauna

// Exit walks measured on Google Maps (station → club entrance).
const STOP_NAMES = {
  D21: "Broadway–Lafayette", L03: "Union Sq", D15: "47–50 Sts", D20: "W 4 St", L01: "8 Av",
  M18: "Delancey–Essex", L06: "1 Av", F11: "Lexington Av/53", B08: "Lexington Av/63", L10: "Lorimer St", M13: "Lorimer St",
};
const CLUBS = [
  { name: "Astor Place",     doing: "in the sauna",          exits: [{ route: "M", stop: "D21", walk: 8 }, { route: "L", stop: "L03", walk: 9 }] },
  { name: "Hell's Kitchen",  doing: "in the saltwater pool", exits: [{ route: "M", stop: "D15", walk: 9 }] },
  { name: "West Village",    doing: "in the infrared sauna", exits: [{ route: "M", stop: "D20", walk: 4 }, { route: "L", stop: "L01", walk: 10 }] },
  { name: "Avenue A",        doing: "in the infrared sauna", exits: [{ route: "M", stop: "M18", walk: 7 }, { route: "J", stop: "M18", walk: 7 }, { route: "Z", stop: "M18", walk: 7 }, { route: "L", stop: "L06", walk: 13 }] },
  { name: "Lexington",       doing: "at the spa",            exits: [{ route: "M", stop: "F11", walk: 1 }, { route: "M", stop: "B08", walk: 12 }, { route: "M", stop: "D15", walk: 13 }] },
];

// Groceries. Walks from Google Maps; homeWalk = walking the whole way from home, used when it beats the train.
const GROCERIES = [
  { name: "Essex Crossing", doing: "at Trader Joe's + Target", extra: 0,
    exits: [{ route: "M", stop: "M18", walk: 4 }, { route: "J", stop: "M18", walk: 4 }, { route: "Z", stop: "M18", walk: 4 }] },
  { name: "Lower East Side", doing: "at Lidl", extra: 0,
    exits: [{ route: "M", stop: "M18", walk: 4 }, { route: "J", stop: "M18", walk: 4 }, { route: "Z", stop: "M18", walk: 4 }] },
  { name: "Williamsburg", doing: "at Lidl", extra: 0, homeWalk: 38,
    exits: [{ route: "L", stop: "L10", walk: 4 }, { route: "M", stop: "M13", walk: 11 }, { route: "J", stop: "M13", walk: 11 }] },
];

// rows: the model's catchable options (each has o, catchable[{t, leave, after:[[stop, time]...]}])
function tmplTimes(rows, now) { return destTimes(CLUBS, rows, now, CHANGE_MIN); }

function destTimes(list, rows, now, extraMin) {
  return list.map(club => {
    const extra = club.extra ?? extraMin;
    let best = club.homeWalk ? { inside: now + club.homeWalk * 60 + extra * 60, leave: 0, route: "walk", from: "home", exit: null, walkOnly: true } : null;
    for (const r of rows) for (const x of r.catchable) {
      if (x.leave < -30) continue;
      for (const ex of club.exits) {
        if (ex.route !== r.o.route) continue;
        const hit = (x.after || []).find(s => s[0] === ex.stop);
        if (!hit || !hit[1]) continue;
        const inside = hit[1] + (ex.walk + extra) * 60;
        if (!best || inside < best.inside)
          best = { inside, leave: x.leave, route: r.o.route, from: r.o.station, exit: STOP_NAMES[ex.stop] || ex.stop, color: r.color };
      }
    }
    return { ...club, best, mins: best ? Math.max(0, Math.round((best.inside - now) / 60)) : null };
  }).sort((a, b) => (a.mins ?? 1e9) - (b.mins ?? 1e9));
}
