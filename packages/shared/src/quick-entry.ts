import type { Locale, Priority } from './constants.js'
import { TAG_MAX_LENGTH } from './constants.js'
import { addDays, addMonths, dayOfMonth, isoWeekday, makeDate, startOfWeek } from './dates.js'
import { firstOccurrence } from './recurrence.js'
import type { Recurrence } from './schemas/tasks.js'

/*
 * Natural-language quick entry in English and German:
 *
 *   "Take out the trash tomorrow 6pm every Tuesday !important #household"
 *   "Müll rausbringen jeden Dienstag um 18 Uhr !wichtig #haushalt @Haushalt"
 *
 * Recognized parts become fields and are removed from the title. Both
 * languages are always understood, since people mix them; the locale only
 * decides how "3/4" is read (day/month in German, month/day in English).
 */

export type QuickEntryKind =
  'date' | 'time' | 'recurrence' | 'important' | 'priority' | 'tag' | 'list'

export interface QuickEntryToken {
  kind: QuickEntryKind
  /** The text as typed; pass it to `ignore` to keep it in the title instead. */
  text: string
  start: number
  end: number
  /** The tag name or the list id, for `tag` and `list` tokens. */
  value?: string
}

export interface QuickEntryResult {
  title: string
  dueDate: string | null
  dueTime: string | null
  recurrence: Recurrence | null
  important: boolean
  priority: Priority | null
  tags: string[]
  listId: string | null
  /** The recognized parts, in the order they appear. */
  tokens: QuickEntryToken[]
}

export interface QuickEntryOptions {
  /** Today in the user's time zone, `YYYY-MM-DD`. */
  today: string
  locale: Locale
  /** Lists that `@name` may refer to. */
  lists?: readonly { id: string; name: string }[]
  /** Token texts (case-insensitive) the user chose to keep as plain text. */
  ignore?: readonly string[]
}

// ── Vocabulary ──────────────────────────────────────────────────────────

const WEEKDAYS: Record<string, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
  montag: 0,
  dienstag: 1,
  mittwoch: 2,
  donnerstag: 3,
  freitag: 4,
  samstag: 5,
  sonnabend: 5,
  sonntag: 6,
}

/** "mondays" (English) and "montags" (German) mean "every Monday". */
const WEEKDAY_PLURALS: Record<string, number> = {
  mondays: 0,
  tuesdays: 1,
  wednesdays: 2,
  thursdays: 3,
  fridays: 4,
  saturdays: 5,
  sundays: 6,
  montags: 0,
  dienstags: 1,
  mittwochs: 2,
  donnerstags: 3,
  freitags: 4,
  samstags: 5,
  sonnabends: 5,
  sonntags: 6,
}

const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
  januar: 1,
  jänner: 1,
  februar: 2,
  märz: 3,
  maerz: 3,
  mär: 3,
  mai: 5,
  juni: 6,
  juli: 7,
  oktober: 10,
  okt: 10,
  dezember: 12,
  dez: 12,
}

const NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  ein: 1,
  eine: 1,
  einen: 1,
  einem: 1,
  einer: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  fuenf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwölf: 12,
  zwoelf: 12,
}

/** German ordinals as in "jede zweite Woche", "jeden dritten Tag". */
const ORDINALS: Record<string, number> = {
  zweite: 2,
  dritte: 3,
  vierte: 4,
  fünfte: 5,
  fuenfte: 5,
  sechste: 6,
}

const UNITS: Record<string, Recurrence['frequency']> = {
  day: 'daily',
  days: 'daily',
  tag: 'daily',
  tage: 'daily',
  tagen: 'daily',
  week: 'weekly',
  weeks: 'weekly',
  woche: 'weekly',
  wochen: 'weekly',
  month: 'monthly',
  months: 'monthly',
  monat: 'monthly',
  monate: 'monthly',
  monaten: 'monthly',
  year: 'yearly',
  years: 'yearly',
  jahr: 'yearly',
  jahre: 'yearly',
  jahren: 'yearly',
}

const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** An alternation of `words`, longest first so "sept" wins over "sep". */
const alt = (words: string[]) =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join('|')

const WEEKDAY = alt(Object.keys(WEEKDAYS))
const WEEKDAY_PLURAL = alt(Object.keys(WEEKDAY_PLURALS))
const MONTH = alt(Object.keys(MONTHS))
const COUNT = `\\d{1,3}|${alt(Object.keys(NUMBERS))}`
const ORDINAL = `(?:${alt(Object.keys(ORDINALS))})[nrs]?`
const UNIT = alt(Object.keys(UNITS))
const SEPARATOR = String.raw`(?:\s*,\s*|\s+(?:and|und)\s+|\s*&\s*)`
const WEEKDAY_LIST = `(?:${WEEKDAY})(?:${SEPARATOR}(?:${WEEKDAY}))*`
const WEEKDAY_PLURAL_LIST = `(?:${WEEKDAY_PLURAL})(?:${SEPARATOR}(?:${WEEKDAY_PLURAL}))*`
/** Words that may introduce a date: "on Monday", "bis Freitag", "ab morgen". */
const DATE_PREFIX = String.raw`(?:(?:on|by|due|until|till|from|am|bis|ab|zum)\s+)?`
const TIME_PREFIX = String.raw`(?:(?:at|um|gegen|ab)\s+)?`

// ── Matchers ────────────────────────────────────────────────────────────

type Value =
  | { kind: 'date'; date: string }
  | { kind: 'time'; time: string }
  | { kind: 'recurrence'; rule: Recurrence }
  | { kind: 'important' }
  | { kind: 'priority'; priority: Priority }
  | { kind: 'tag'; tag: string }
  | { kind: 'list'; listId: string }

interface Context {
  today: string
  locale: Locale
}

type Groups = Record<string, string | undefined>

interface Matcher {
  pattern: string
  resolve: (groups: Groups, context: Context) => Value | null
}

const number = (value: string | undefined): number => {
  if (!value) return Number.NaN
  const lower = value.toLowerCase()
  return /^\d+$/.test(lower) ? Number(lower) : (NUMBERS[lower] ?? Number.NaN)
}

/** All weekday names in `text`, as ISO weekday numbers. */
const weekdaysIn = (text: string, names: Record<string, number>): number[] =>
  (text.toLowerCase().match(/[\p{L}]+/gu) ?? [])
    .map((word) => names[word])
    .filter((day): day is number => day !== undefined)

const rule = (
  frequency: Recurrence['frequency'],
  interval = 1,
  weekdays: number[] = [],
): Value | null =>
  interval >= 1 && interval <= 999
    ? {
        kind: 'recurrence',
        rule: {
          frequency,
          interval,
          weekdays: frequency === 'weekly' ? [...new Set(weekdays)].sort((a, b) => a - b) : [],
          from: 'due',
        },
      }
    : null

/** The next date with `weekday` after today (or from today on, with `includeToday`). */
const nextWeekday = (today: string, weekday: number, includeToday: boolean): string => {
  const offset = (weekday - isoWeekday(today) + 7) % 7
  return addDays(today, offset === 0 && !includeToday ? 7 : offset)
}

/** A day and month without a year: this year, or next year once it has passed. */
const upcoming = (today: string, month: number, day: number, year?: number): string | null => {
  if (year !== undefined) return makeDate(year, month, day)
  const thisYear = Number(today.slice(0, 4))
  const date = makeDate(thisYear, month, day) ?? makeDate(thisYear + 1, month, day)
  if (date && date >= today) return date
  return makeDate(thisYear + 1, month, day)
}

const fullYear = (value: string | undefined): number | undefined => {
  if (!value) return undefined
  const year = Number(value)
  return value.length === 2 ? 2000 + year : year
}

const time = (hours: number, minutes = 0): Value | null =>
  Number.isInteger(hours) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59
    ? {
        kind: 'time',
        time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      }
    : null

const date = (value: string | null): Value | null => (value ? { kind: 'date', date: value } : null)

const MATCHERS: Matcher[] = [
  // ── Recurrence ──
  {
    pattern: String.raw`every\s*day|each\s+day|daily|täglich|taeglich|jeden\s+tag`,
    resolve: () => rule('daily'),
  },
  {
    pattern: String.raw`(?:every|each)\s+(?:weekday|work\s*day)|(?:on\s+)?weekdays|werktags|werktäglich|jeden\s+werktag|an\s+werktagen`,
    resolve: () => rule('weekly', 1, [0, 1, 2, 3, 4]),
  },
  {
    pattern: String.raw`(?:every|each)\s+weekend|(?:on\s+)?weekends|jedes\s+wochenende|an\s+wochenenden`,
    resolve: () => rule('weekly', 1, [5, 6]),
  },
  {
    pattern: String.raw`(?:every|each)\s+week|weekly|wöchentlich|woechentlich|jede\s+woche`,
    resolve: () => rule('weekly'),
  },
  {
    pattern: String.raw`(?:every|each)\s+month|monthly|monatlich|jeden\s+monat`,
    resolve: () => rule('monthly'),
  },
  {
    pattern: String.raw`(?:every|each)\s+year|yearly|annually|jährlich|jaehrlich|jedes\s+jahr`,
    resolve: () => rule('yearly'),
  },
  {
    // "every 2 weeks", "every other week on Monday", "alle 3 Tage", "alle zwei Wochen am Montag"
    pattern: String.raw`(?:every\s+(?<n>${COUNT}|other)|alle\s+(?<m>${COUNT}))\s+(?<unit>${UNIT})(?:\s+(?:on|am|an)\s+(?<days>${WEEKDAY_LIST})|\s+(?<plural>${WEEKDAY_PLURAL_LIST}))?`,
    resolve: (groups) => {
      const frequency = UNITS[groups.unit!.toLowerCase()]!
      const interval = groups.n?.toLowerCase() === 'other' ? 2 : number(groups.n ?? groups.m)
      const weekdays = groups.days
        ? weekdaysIn(groups.days, WEEKDAYS)
        : groups.plural
          ? weekdaysIn(groups.plural, WEEKDAY_PLURALS)
          : []
      if (weekdays.length > 0 && frequency !== 'weekly') return null
      return rule(frequency, interval, weekdays)
    },
  },
  {
    // "jede zweite Woche", "jeden dritten Tag"
    pattern: String.raw`jede[nrs]?\s+(?<ordinal>${ORDINAL})\s+(?<unit>tag|woche|monat|jahr)`,
    resolve: (groups) =>
      rule(
        UNITS[groups.unit!.toLowerCase()]!,
        ORDINALS[groups.ordinal!.toLowerCase().replace(/[nrs]$/, '')] ?? Number.NaN,
      ),
  },
  {
    // "every Tuesday and Friday", "every other Monday", "jeden Montag", "jeden zweiten Freitag"
    pattern: String.raw`(?:(?:every|each)(?:\s+(?<other>other))?|jede[nrs]?(?:\s+(?<ordinal>${ORDINAL}))?)\s+(?<days>${WEEKDAY_LIST})`,
    resolve: (groups) => {
      const interval = groups.other
        ? 2
        : groups.ordinal
          ? (ORDINALS[groups.ordinal.toLowerCase().replace(/[nrs]$/, '')] ?? Number.NaN)
          : 1
      return rule('weekly', interval, weekdaysIn(groups.days!, WEEKDAYS))
    },
  },
  {
    // "mondays", "on Mondays and Thursdays", "dienstags und freitags"
    pattern: String.raw`(?:on\s+)?(?<days>${WEEKDAY_PLURAL_LIST})`,
    resolve: (groups) => rule('weekly', 1, weekdaysIn(groups.days!, WEEKDAY_PLURALS)),
  },

  // ── Dates ──
  {
    pattern: String.raw`${DATE_PREFIX}(?<word>(?:the\s+)?day\s+after\s+tomorrow|übermorgen|uebermorgen|today|tomorrow|heute|morgen)`,
    resolve: (groups, { today }) => {
      const word = groups.word!.toLowerCase()
      const offset = /heute|today/.test(word) ? 0 : /after|über|ueber/.test(word) ? 2 : 1
      return date(addDays(today, offset))
    },
  },
  {
    // "Monday", "next Friday", "this Sunday", "am Montag", "nächsten Dienstag", "bis Freitag"
    pattern: String.raw`${DATE_PREFIX}(?:(?<modifier>next|this|coming|nächsten|nächster|nächste|naechsten|kommenden|diesen|diesem)\s+)?(?<day>${WEEKDAY})`,
    resolve: (groups, { today }) => {
      const includeToday = /^(this|diesen|diesem)$/i.test(groups.modifier ?? '')
      return date(nextWeekday(today, WEEKDAYS[groups.day!.toLowerCase()]!, includeToday))
    },
  },
  {
    pattern: String.raw`${DATE_PREFIX}(?:next|nächste|naechste|kommende)\s+(?:week|woche)`,
    resolve: (_, { today }) => date(addDays(startOfWeek(today), 7)),
  },
  {
    pattern: String.raw`(?:(?:on|over)\s+the\s+|this\s+|am\s+|übers\s+|dieses\s+)?(?<word>weekend|wochenende)`,
    resolve: (_, { today }) => {
      const weekday = isoWeekday(today)
      return date(weekday >= 5 ? today : addDays(today, 5 - weekday))
    },
  },
  {
    pattern: String.raw`(?:next|nächstes|naechstes|kommendes)\s+(?:weekend|wochenende)`,
    resolve: (_, { today }) => date(addDays(startOfWeek(today), 12)),
  },
  {
    // "in 3 days", "in a week", "in zwei Wochen", "in einem Monat"
    pattern: String.raw`in\s+(?<n>${COUNT})\s+(?<unit>${UNIT})`,
    resolve: (groups, { today }) => {
      const count = number(groups.n)
      if (!Number.isInteger(count) || count < 1 || count > 999) return null
      switch (UNITS[groups.unit!.toLowerCase()]!) {
        case 'daily':
          return date(addDays(today, count))
        case 'weekly':
          return date(addDays(today, count * 7))
        case 'monthly':
          return date(addMonths(today, count))
        case 'yearly':
          return date(addMonths(today, count * 12))
      }
    },
  },
  {
    pattern: String.raw`${DATE_PREFIX}(?<y>\d{4})-(?<m>\d{2})-(?<d>\d{2})`,
    resolve: (groups) => date(makeDate(Number(groups.y), Number(groups.m), Number(groups.d))),
  },
  {
    // "12.10.", "12.10.2026", "1.2.27" – the trailing dot or a year tells it from a time
    pattern: String.raw`${DATE_PREFIX}(?<d>\d{1,2})\.(?<m>\d{1,2})\.(?<y>\d{4}|\d{2})?`,
    resolve: (groups, { today }) =>
      date(upcoming(today, Number(groups.m), Number(groups.d), fullYear(groups.y))),
  },
  {
    // "10/12/2026" or "on 10/12" – without a year or prefix, "1/2" is more likely a fraction
    pattern: String.raw`(?:(?<prefix>on|by|due|until|am|bis|ab|zum)\s+)?(?<a>\d{1,2})\/(?<b>\d{1,2})(?:\/(?<y>\d{4}|\d{2}))?`,
    resolve: (groups, { today, locale }) => {
      if (!groups.prefix && !groups.y) return null
      const [day, month] =
        locale === 'de'
          ? [Number(groups.a), Number(groups.b)]
          : [Number(groups.b), Number(groups.a)]
      return date(upcoming(today, month, day, fullYear(groups.y)))
    },
  },
  {
    // "12. Oktober", "12 Oct 2026", "the 12th of October"
    pattern: String.raw`${DATE_PREFIX}(?:the\s+)?(?<d>\d{1,2})(?:\.|st|nd|rd|th)?\s+(?:of\s+)?(?<month>${MONTH})\.?(?:\s+(?<y>\d{4}))?`,
    resolve: (groups, { today }) =>
      date(
        upcoming(today, MONTHS[groups.month!.toLowerCase()]!, Number(groups.d), fullYear(groups.y)),
      ),
  },
  {
    // "Oct 12", "October 12th, 2026"
    pattern: String.raw`${DATE_PREFIX}(?<month>${MONTH})\.?\s+(?<d>\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(?<y>\d{4}))?`,
    resolve: (groups, { today }) =>
      date(
        upcoming(today, MONTHS[groups.month!.toLowerCase()]!, Number(groups.d), fullYear(groups.y)),
      ),
  },
  {
    // "on the 15th", "am 15." – the next 15th of a month
    pattern: String.raw`(?:on\s+the|am)\s+(?<d>\d{1,2})(?:st|nd|rd|th|\.)`,
    resolve: (groups, { today }) => {
      const day = Number(groups.d)
      if (day < 1 || day > 31) return null
      for (let months = 0; months <= 12; months++) {
        const month = addMonths(today, months, 1)
        const candidate = makeDate(Number(month.slice(0, 4)), Number(month.slice(5, 7)), day)
        if (candidate && (months > 0 || day >= dayOfMonth(today))) return date(candidate)
      }
      return null
    },
  },

  // ── Times ──
  {
    // "6pm", "at 6:30 pm", "7 a.m."
    pattern: String.raw`${TIME_PREFIX}(?<h>\d{1,2})(?::(?<min>\d{2}))?\s*(?<period>am|pm|a\.m\.|p\.m\.)`,
    resolve: (groups) => {
      const hours = Number(groups.h)
      if (hours < 1 || hours > 12) return null
      const pm = groups.period!.toLowerCase().startsWith('p')
      return time((hours % 12) + (pm ? 12 : 0), Number(groups.min ?? 0))
    },
  },
  {
    // "18:30", "um 18:30 Uhr"
    pattern: String.raw`${TIME_PREFIX}(?<h>\d{1,2}):(?<min>\d{2})(?:\s*(?:uhr|h))?`,
    resolve: (groups) => time(Number(groups.h), Number(groups.min)),
  },
  {
    // "18.30 Uhr", "um 18.30"
    pattern: String.raw`(?:(?<prefix>at|um|gegen|ab)\s+)?(?<h>\d{1,2})\.(?<min>\d{2})(?<suffix>\s*(?:uhr|h))?`,
    resolve: (groups) =>
      groups.prefix || groups.suffix ? time(Number(groups.h), Number(groups.min)) : null,
  },
  {
    // "18 Uhr", "um 6 Uhr"
    pattern: String.raw`${TIME_PREFIX}(?<h>\d{1,2})\s*uhr`,
    resolve: (groups) => time(Number(groups.h)),
  },
  {
    // "at 18", "um 18"
    pattern: String.raw`(?:at|um|gegen)\s+(?<h>\d{1,2})`,
    resolve: (groups) => time(Number(groups.h)),
  },
  {
    pattern: String.raw`(?:at\s+)?noon|mittags`,
    resolve: () => time(12),
  },

  // ── Importance, priority, tags ──
  {
    pattern: String.raw`!(?:important|wichtig)`,
    resolve: () => ({ kind: 'important' }),
  },
  {
    pattern: String.raw`!!!|!3|!high|!hoch`,
    resolve: () => ({ kind: 'priority', priority: 3 }),
  },
  {
    pattern: String.raw`!!|!2|!medium|!mittel`,
    resolve: () => ({ kind: 'priority', priority: 2 }),
  },
  {
    pattern: String.raw`!1|!low|!niedrig`,
    resolve: () => ({ kind: 'priority', priority: 1 }),
  },
  {
    pattern: String.raw`#(?<tag>[\p{L}\p{N}_\-/]*\p{L}[\p{L}\p{N}_\-/]*)`,
    resolve: (groups) => {
      const tag = groups.tag!.toLowerCase()
      return tag.length <= TAG_MAX_LENGTH ? { kind: 'tag', tag } : null
    },
  },
]

// Parts must stand on their own: "heute" matches, "Heute-Show", "Morgenroutine" and
// "Monday.com" do not. A period only ends a part at the end of a sentence.
const BEFORE = String.raw`(?<=^|[\s(\[,;])`
const AFTER = String.raw`(?=$|[\s,;:!?)\]]|\.(?:$|\s))`
const AFTER_REGEX = new RegExp(`^${AFTER}`, 'u')
const COMPILED = MATCHERS.map((matcher) => ({
  ...matcher,
  regex: new RegExp(`${BEFORE}(?:${matcher.pattern})${AFTER}`, 'giu'),
}))

interface Candidate {
  start: number
  end: number
  text: string
  value: Value
}

function listCandidates(
  input: string,
  lists: readonly { id: string; name: string }[],
): Candidate[] {
  const candidates: Candidate[] = []
  // Longest names first, so "@Urlaub Portugal" wins over "@Urlaub".
  const sorted = [...lists].sort((a, b) => b.name.length - a.name.length)
  const lower = input.toLowerCase()
  for (let index = input.indexOf('@'); index !== -1; index = input.indexOf('@', index + 1)) {
    if (index > 0 && !/[\s([,;]/.test(input[index - 1]!)) continue
    for (const list of sorted) {
      const name = list.name.toLowerCase()
      const end = index + 1 + name.length
      if (lower.startsWith(name, index + 1) && AFTER_REGEX.test(input.slice(end))) {
        candidates.push({
          start: index,
          end,
          text: input.slice(index, end),
          value: { kind: 'list', listId: list.id },
        })
        break
      }
    }
  }
  return candidates
}

export function parseQuickEntry(input: string, options: QuickEntryOptions): QuickEntryResult {
  const context: Context = { today: options.today, locale: options.locale }
  const ignored = new Set((options.ignore ?? []).map((text) => text.toLowerCase()))

  const candidates: Candidate[] = listCandidates(input, options.lists ?? [])
  for (const matcher of COMPILED) {
    for (const match of input.matchAll(matcher.regex)) {
      const value = matcher.resolve(match.groups ?? {}, context)
      if (!value) continue
      candidates.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[0],
        value,
      })
    }
  }

  // The longest match wins where parts overlap ("every Tuesday" over "Tuesday").
  // Ignored parts still take up their place, so dismissing "every Tuesday"
  // does not turn its "Tuesday" into a date.
  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start)
  const chosen: Candidate[] = []
  for (const candidate of candidates) {
    if (chosen.some((other) => candidate.start < other.end && other.start < candidate.end)) continue
    chosen.push(candidate)
  }
  chosen.sort((a, b) => a.start - b.start)

  const result: QuickEntryResult = {
    title: '',
    dueDate: null,
    dueTime: null,
    recurrence: null,
    important: false,
    priority: null,
    tags: [],
    listId: null,
    tokens: [],
  }
  const used: Candidate[] = []
  for (const candidate of chosen) {
    if (ignored.has(candidate.text.toLowerCase())) continue
    const { value } = candidate
    let token: QuickEntryToken | null = { kind: value.kind, ...position(candidate) }
    switch (value.kind) {
      case 'date':
        if (result.dueDate) token = null
        else result.dueDate = value.date
        break
      case 'time':
        if (result.dueTime) token = null
        else result.dueTime = value.time
        break
      case 'recurrence':
        if (result.recurrence) token = null
        else result.recurrence = value.rule
        break
      case 'important':
        result.important = true
        break
      case 'priority':
        if (result.priority !== null) token = null
        else result.priority = value.priority
        break
      case 'tag':
        if (result.tags.includes(value.tag)) token = null
        else {
          result.tags.push(value.tag)
          token.value = value.tag
        }
        break
      case 'list':
        if (result.listId) token = null
        else {
          result.listId = value.listId
          token.value = value.listId
        }
        break
    }
    // Only one date, time, rule, priority and list count; repeats stay in the title.
    if (!token) continue
    result.tokens.push(token)
    used.push(candidate)
  }

  let title = ''
  let cursor = 0
  for (const candidate of used) {
    title += `${input.slice(cursor, candidate.start)} `
    cursor = candidate.end
  }
  title = (title + input.slice(cursor))
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '')
    .trim()

  // Nothing left for a title: treat everything as plain text.
  if (!title) return { ...emptyResult(input) }

  result.title = title
  if (result.recurrence && !result.dueDate) {
    result.dueDate = firstOccurrence(result.recurrence, options.today)
  }
  if (result.dueTime && !result.dueDate) result.dueDate = options.today
  result.tags.sort()
  return result
}

function position(candidate: Candidate) {
  return { text: candidate.text, start: candidate.start, end: candidate.end }
}

function emptyResult(input: string): QuickEntryResult {
  return {
    title: input.replace(/\s+/g, ' ').trim(),
    dueDate: null,
    dueTime: null,
    recurrence: null,
    important: false,
    priority: null,
    tags: [],
    listId: null,
    tokens: [],
  }
}
