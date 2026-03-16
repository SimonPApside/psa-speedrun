const today = new Date();
const januaryFirst = new Date(today.getFullYear(), 0, 1);
const daysToNextMonday =
  (januaryFirst.getDay() === 1) ? 0 :
    (7 - januaryFirst.getDay()) % 7;
const nextMonday = new Date(today.getFullYear(), 0, januaryFirst.getDate() + daysToNextMonday);

const addDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const paques = function (year) {
  const a = year % 19
  const century = Math.floor(year / 100)
  const yearsAfterCentury = year % 100
  const d =
    (19 * a + century - Math.floor(century / 4) - Math.floor((Math.floor(century - (century + 8) / 25) + 1) / 3) + 15) %
    30
  const e = (32 + 2 * (century % 4) + 2 * Math.floor(yearsAfterCentury / 4) - d - (yearsAfterCentury % 4)) % 7
  const f = d + e - 7 * Math.floor((a + 11 * d + 22 * e) / 451) + 114
  const month = Math.floor(f / 31)
  const day = (f % 31) + 1

  return new Date(year, month - 1, day)
}

const fetes = (year) => ([
  {
    name: 'Armistice', date: new Date(year, 10, 11).toISOString(),
  },
  {
    name: 'Ascension', date: addDays(paques(year), 39).toISOString(),
  },
  {
    name: 'Assomption', date: new Date(year, 7, 15).toISOString(),
  },
  {
    name: 'Fête Nationale', date: new Date(year, 6, 14).toISOString(),
  },
  {
    name: 'Fête du travail', date: new Date(year, 4, 1).toISOString(),
  },
  {
    name: 'Jour de l\'an', date: new Date(year, 0, 1).toISOString(),
  },
  {
    name: 'Lundi de Pentecôte', date: addDays(paques(year), 50).toISOString(),
  },
  {
    name: 'Lundi de Pâques', date: addDays(paques(year), 1).toISOString(),
  },
  {
    name: 'Noël', date: new Date(year, 11, 25).toISOString(),
  },
  {
    name: 'Toussaint', date: new Date(year, 10, 1).toISOString(),
  },
  {
    name: 'Victoire des alliés', date: new Date(year, 4, 8).toISOString(),
  }
]);

const fetesAlsace = (year) => ([
  {
    name: 'Saint Étienne', date: new Date(year, 11, 26).toISOString(),
  },
  {
    name: 'Vendredi Saint', date: addDays(paques(year), -2).toISOString(),
  }
]);

/**
 * Get french bank holidays by year and zone.
 *
 * @param year year you're interested in
 * @param options the zone you're interested in ("métropole" by default)
 */
export function joursFeries(year, options = { zone: 'metropole' }) {
  if (options && options['zone'] && options['zone'] === "alsace-moselle") {
    return fetes(year).concat(fetesAlsace(year));
  } else {
    return fetes(year);
  }
}

export function getWeekJoursFeries(date = new Date(), joursFs = undefined) {
  if (!joursFs) {
    joursFs = joursFeries(date.getFullYear());
  }
  return joursFs.filter((j) => isSameWeek(date, new Date(j.date)));
}

function isSameWeek(date1, date2) {
  return getDateWeek(date1) === getDateWeek(date2);
}

function getDateWeek(date) {
  return (date < januaryFirst) ? 52 :
    (date > nextMonday ? Math.ceil(
      (date - nextMonday) / (24 * 3600 * 1000) / 7) + 1 : 1);
}