import { describe, expect, it } from 'vitest'

import { parseQuickEntry, type QuickEntryOptions } from './quick-entry.js'

// Wednesday, 30 September 2026.
const TODAY = '2026-09-30'
const en: QuickEntryOptions = { today: TODAY, locale: 'en' }
const de: QuickEntryOptions = { today: TODAY, locale: 'de' }

const parse = (input: string, options: QuickEntryOptions = en) => parseQuickEntry(input, options)

describe('parseQuickEntry – the example from the roadmap', () => {
  it('understands every part', () => {
    const result = parse('Take out the trash tomorrow 6pm every Tuesday !important #household')
    expect(result).toMatchObject({
      title: 'Take out the trash',
      dueDate: '2026-10-01',
      dueTime: '18:00',
      recurrence: { frequency: 'weekly', interval: 1, weekdays: [1], from: 'due' },
      important: true,
      tags: ['household'],
    })
    expect(result.tokens.map((token) => [token.kind, token.text])).toEqual([
      ['date', 'tomorrow'],
      ['time', '6pm'],
      ['recurrence', 'every Tuesday'],
      ['important', '!important'],
      ['tag', '#household'],
    ])
  })

  it('works in German, too', () => {
    const result = parse('Müll rausbringen jeden Dienstag um 18 Uhr !wichtig #Haushalt', de)
    expect(result).toMatchObject({
      title: 'Müll rausbringen',
      // The first Tuesday from today on.
      dueDate: '2026-10-06',
      dueTime: '18:00',
      recurrence: { frequency: 'weekly', weekdays: [1] },
      important: true,
      tags: ['haushalt'],
    })
  })
})

describe('dates', () => {
  it.each([
    ['Call Anna today', 'Call Anna', TODAY],
    ['Call Anna tomorrow', 'Call Anna', '2026-10-01'],
    ['Call Anna the day after tomorrow', 'Call Anna', '2026-10-02'],
    ['Anna heute anrufen', 'Anna anrufen', TODAY],
    ['Anna morgen anrufen', 'Anna anrufen', '2026-10-01'],
    ['Anna übermorgen anrufen', 'Anna anrufen', '2026-10-02'],
    ['Pay rent by Friday', 'Pay rent', '2026-10-02'],
    ['Meeting on Monday', 'Meeting', '2026-10-05'],
    ['Meeting next Monday', 'Meeting', '2026-10-05'],
    // A bare weekday that is today means next week; "this" keeps today.
    ['Review Wednesday', 'Review', '2026-10-07'],
    ['Review this Wednesday', 'Review', TODAY],
    ['Anna am Montag anrufen', 'Anna anrufen', '2026-10-05'],
    ['Rechnung bis Freitag bezahlen', 'Rechnung bezahlen', '2026-10-02'],
    ['Termin nächsten Dienstag', 'Termin', '2026-10-06'],
    ['Plan trip next week', 'Plan trip', '2026-10-05'],
    ['Reise planen nächste Woche', 'Reise planen', '2026-10-05'],
    ['Clean the garage this weekend', 'Clean the garage', '2026-10-03'],
    ['Garage aufräumen am Wochenende', 'Garage aufräumen', '2026-10-03'],
    ['Garage aufräumen nächstes Wochenende', 'Garage aufräumen', '2026-10-10'],
    ['Renew passport in 3 weeks', 'Renew passport', '2026-10-21'],
    ['Reifen wechseln in zwei Wochen', 'Reifen wechseln', '2026-10-14'],
    ['Zahnarzt in einem Monat', 'Zahnarzt', '2026-10-30'],
    ['Tax return 2027-03-31', 'Tax return', '2027-03-31'],
    ['Rechnung bis 12.10. bezahlen', 'Rechnung bezahlen', '2026-10-12'],
    ['Steuer am 31.3.2027', 'Steuer', '2027-03-31'],
    ['Geburtstag 5.1.', 'Geburtstag', '2027-01-05'],
    ['Birthday Oct 12', 'Birthday', '2026-10-12'],
    ['Birthday on October 12th, 2027', 'Birthday', '2027-10-12'],
    ['Birthday the 3rd of January', 'Birthday', '2027-01-03'],
    ['Geburtstag am 12. Oktober', 'Geburtstag', '2026-10-12'],
    ['Pay rent on the 15th', 'Pay rent', '2026-10-15'],
    ['Miete zahlen am 30.', 'Miete zahlen', TODAY],
  ])('%s', (input, title, dueDate) => {
    const result = parse(
      input,
      /[äöüß]|\b(am|bis|nächste|in einem|in zwei|Wochenende|Anna|Miete|Rechnung|Termin|Steuer|Geburtstag)\b/.test(
        input,
      )
        ? de
        : en,
    )
    expect(result.title).toBe(title)
    expect(result.dueDate).toBe(dueDate)
  })

  it('reads slashes by locale, and only with a year or a prefix', () => {
    expect(parse('Dentist on 10/12', en).dueDate).toBe('2026-10-12')
    expect(parse('Zahnarzt am 10/12', de).dueDate).toBe('2026-12-10')
    expect(parse('Dentist 3/4/2027', en).dueDate).toBe('2027-03-04')
    expect(parse('Buy 1/2 liter milk', en)).toMatchObject({
      title: 'Buy 1/2 liter milk',
      dueDate: null,
    })
  })

  it('ignores impossible dates', () => {
    expect(parse('Party 31.02.', de)).toMatchObject({ title: 'Party 31.02.', dueDate: null })
  })

  it('only takes the first date', () => {
    const result = parse('Move meeting from Monday to Friday', en)
    expect(result.dueDate).toBe('2026-10-05')
    expect(result.title).toBe('Move meeting to Friday')
  })
})

describe('times', () => {
  it.each([
    ['Call at 6pm', '18:00'],
    ['Call 6:30 pm', '18:30'],
    ['Call at 7 a.m.', '07:00'],
    ['Call 12am', '00:00'],
    ['Call at 18:30', '18:30'],
    ['Anrufen um 18 Uhr', '18:00'],
    ['Anrufen 18.30 Uhr', '18:30'],
    ['Anrufen um 9', '09:00'],
    ['Lunch at noon', '12:00'],
  ])('%s → %s', (input, dueTime) => {
    const result = parse(input)
    expect(result.dueTime).toBe(dueTime)
    // A time alone means today.
    expect(result.dueDate).toBe(TODAY)
  })

  it('combines a date and a time', () => {
    expect(parse('Anna morgen um 10:30 anrufen', de)).toMatchObject({
      title: 'Anna anrufen',
      dueDate: '2026-10-01',
      dueTime: '10:30',
    })
  })

  it('leaves impossible times alone', () => {
    expect(parse('Call at 25:00').dueTime).toBeNull()
    expect(parse('Version 1.10').dueTime).toBeNull()
  })
})

describe('recurrence', () => {
  it.each([
    ['Water plants daily', { frequency: 'daily', interval: 1, weekdays: [] }, TODAY],
    ['Pflanzen gießen täglich', { frequency: 'daily', interval: 1 }, TODAY],
    ['Stand-up every weekday', { frequency: 'weekly', weekdays: [0, 1, 2, 3, 4] }, TODAY],
    ['Stand-up werktags', { frequency: 'weekly', weekdays: [0, 1, 2, 3, 4] }, TODAY],
    ['Hike every weekend', { frequency: 'weekly', weekdays: [5, 6] }, '2026-10-03'],
    ['Report weekly', { frequency: 'weekly', weekdays: [] }, TODAY],
    ['Miete monatlich', { frequency: 'monthly' }, TODAY],
    ['Steuer jedes Jahr', { frequency: 'yearly' }, TODAY],
    ['Backup every 3 days', { frequency: 'daily', interval: 3 }, TODAY],
    ['Team call every other week', { frequency: 'weekly', interval: 2 }, TODAY],
    ['Filter wechseln alle 2 Monate', { frequency: 'monthly', interval: 2 }, TODAY],
    ['Bettwäsche alle zwei Wochen', { frequency: 'weekly', interval: 2 }, TODAY],
    ['Bettwäsche jede zweite Woche', { frequency: 'weekly', interval: 2 }, TODAY],
    ['Gym every Monday and Thursday', { frequency: 'weekly', weekdays: [0, 3] }, '2026-10-01'],
    ['Gym every Monday, Wednesday and Friday', { frequency: 'weekly', weekdays: [0, 2, 4] }, TODAY],
    ['Sport jeden Montag und Donnerstag', { frequency: 'weekly', weekdays: [0, 3] }, '2026-10-01'],
    ['Sport dienstags und freitags', { frequency: 'weekly', weekdays: [1, 4] }, '2026-10-02'],
    ['Yoga on Mondays', { frequency: 'weekly', weekdays: [0] }, '2026-10-05'],
    [
      'Paper bin every other Friday',
      { frequency: 'weekly', interval: 2, weekdays: [4] },
      '2026-10-02',
    ],
    [
      'Papiertonne jeden zweiten Freitag',
      { frequency: 'weekly', interval: 2, weekdays: [4] },
      '2026-10-02',
    ],
    [
      'Cleaning every 2 weeks on Saturday',
      { frequency: 'weekly', interval: 2, weekdays: [5] },
      '2026-10-03',
    ],
    [
      'Putzen alle 2 Wochen am Samstag',
      { frequency: 'weekly', interval: 2, weekdays: [5] },
      '2026-10-03',
    ],
  ])('%s', (input, recurrence, dueDate) => {
    const result = parse(
      input,
      /[äöüß]|täglich|werktags|monatlich|jedes|alle|jede|jeden|dienstags/.test(input) ? de : en,
    )
    expect(result.recurrence).toMatchObject(recurrence)
    // Without an explicit date, the task is due on the first occurrence.
    expect(result.dueDate).toBe(dueDate)
  })

  it('keeps an explicit start date', () => {
    expect(parse('Standup ab morgen täglich', de)).toMatchObject({
      title: 'Standup',
      dueDate: '2026-10-01',
      recurrence: { frequency: 'daily' },
    })
  })
})

describe('importance, priority, tags and lists', () => {
  it('reads importance and priority', () => {
    expect(parse('Pay bills !important')).toMatchObject({ title: 'Pay bills', important: true })
    expect(parse('Pay bills !!')).toMatchObject({ title: 'Pay bills', priority: 2 })
    expect(parse('Pay bills !!!')).toMatchObject({ priority: 3 })
    expect(parse('Rechnung !hoch', de)).toMatchObject({ priority: 3 })
    expect(parse('Pay bills !1')).toMatchObject({ priority: 1 })
    // Exclamation marks inside words are not markers.
    expect(parse('Yay!!! Party')).toMatchObject({ title: 'Yay!!! Party', priority: null })
  })

  it('collects tags in lower case without duplicates', () => {
    const result = parse('Plan #Trip with #family and #trip')
    expect(result.title).toBe('Plan with and #trip')
    expect(result.tags).toEqual(['family', 'trip'])
    expect(parse('Ticket #1234').tags).toEqual([])
    expect(parse('Fix issue#12').tags).toEqual([])
  })

  it('finds lists by name, the longest name first', () => {
    const lists = [
      { id: 'a', name: 'Urlaub' },
      { id: 'b', name: 'Urlaub Portugal' },
      { id: 'c', name: 'Einkauf' },
    ]
    expect(parse('Reisepass @urlaub portugal prüfen', { ...de, lists })).toMatchObject({
      title: 'Reisepass prüfen',
      listId: 'b',
    })
    expect(parse('Milch @Einkauf', { ...de, lists }).listId).toBe('c')
    expect(parse('Mail an anna@example.org', { ...de, lists })).toMatchObject({
      title: 'Mail an anna@example.org',
      listId: null,
    })
    expect(parse('Milch @Unbekannt', { ...de, lists }).listId).toBeNull()
  })
})

describe('what stays text', () => {
  it.each(['Watch Heute-Show', 'Morgenroutine üben', 'Read Monday.com docs', 'Mayday drill'])(
    '%s',
    (input) => {
      const result = parse(input, de)
      expect(result.title).toBe(input)
      expect(result.tokens).toEqual([])
    },
  )

  it('keeps parts the user dismissed, and does not reuse them', () => {
    const once = parse('Buy tickets tomorrow every Tuesday', en)
    expect(once.tokens.map((token) => token.text)).toEqual(['tomorrow', 'every Tuesday'])

    const result = parse('Buy tickets tomorrow every Tuesday', {
      ...en,
      ignore: ['every tuesday'],
    })
    expect(result.title).toBe('Buy tickets every Tuesday')
    expect(result.recurrence).toBeNull()
    // "Tuesday" inside the dismissed part does not become a date.
    expect(result.dueDate).toBe('2026-10-01')
  })

  it('never produces an empty title', () => {
    const result = parse('tomorrow', en)
    expect(result).toMatchObject({ title: 'tomorrow', dueDate: null, tokens: [] })
  })

  it('trims separators left behind', () => {
    expect(parse('Call Anna, tomorrow', en).title).toBe('Call Anna')
    expect(parse('Tomorrow: call Anna', en).title).toBe('call Anna')
  })
})
