# Quick entry

When you type a task, Crystal recognizes dates, times, repeats and more, and shows them as
chips below the field. The recognized words are removed from the title. Click the **×** on a
chip to keep those words as plain text instead.

English and German work side by side, whatever language the app is set to. Recognition can
be turned off under **Settings → Account → Quick entry**.

| What                | English                                                                            | German                                                                         |
| ------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Relative dates      | `today`, `tomorrow`, `the day after tomorrow`                                      | `heute`, `morgen`, `übermorgen`                                                |
| Weekdays            | `Monday`, `next Friday`, `this Sunday`, `on Tuesday`, `by Friday`                  | `Montag`, `nächsten Freitag`, `am Dienstag`, `bis Freitag`                     |
| Weeks and weekends  | `next week` (Monday), `this weekend`, `next weekend`                               | `nächste Woche`, `am Wochenende`, `nächstes Wochenende`                        |
| In some time        | `in 3 days`, `in a week`, `in 2 months`                                            | `in 3 Tagen`, `in einer Woche`, `in zwei Monaten`                              |
| Dates               | `Oct 12`, `October 12th, 2027`, `the 3rd of January`, `on the 15th`, `2027-03-31`  | `12.10.`, `12.10.2027`, `12. Oktober`, `am 15.`                                |
| Times               | `6pm`, `at 6:30 pm`, `18:30`, `at noon`                                            | `um 18 Uhr`, `18:30`, `18.30 Uhr`, `mittags`                                   |
| Repeats             | `daily`, `every weekday`, `weekly`, `every other week`, `every 3 months`, `yearly` | `täglich`, `werktags`, `wöchentlich`, `alle 2 Wochen`, `monatlich`, `jährlich` |
| Repeats on weekdays | `every Tuesday and Friday`, `on Mondays`, `every 2 weeks on Saturday`              | `jeden Dienstag und Freitag`, `montags`, `alle 2 Wochen am Samstag`            |
| Important           | `!important`                                                                       | `!wichtig`                                                                     |
| Priority            | `!1` `!2` `!3`, `!!` `!!!`, `!low` `!medium` `!high`                               | `!niedrig` `!mittel` `!hoch`                                                   |
| Tags                | `#household`                                                                       | `#haushalt`                                                                    |
| List                | `@Groceries`                                                                       | `@Einkauf`                                                                     |

A few details:

- **Only whole words count.** “Heute-Show”, “Morgenroutine” or “Monday.com” stay text.
- **A time without a date** means today. **A repeat without a date** starts on its first day
  from today on, e.g. “every Tuesday” on the next Tuesday.
- **Dates without a year** that have already passed this year mean next year.
- **Slashes** are read as month/day in English and day/month in German, and only with a year
  or a word like “on” or “am” in front – so “1/2 liter milk” stays as it is.
- **Only the first** date, time, repeat and list count; later ones stay in the title.
- **`@list`** needs the name of a list you can edit; unknown names stay text.

## Repeating tasks

A repeating task always has a due date. When you complete it, the next one appears right
away, with the steps unticked and everything else kept. Undo the tick by mistake and the next
one disappears again – as long as you have not changed it yet.

The next date is counted from the due date: a task due every Tuesday stays on Tuesdays even if
you complete it on Monday. If you are late, it moves to the next Tuesday from today on, not to
one that has already passed. For things like “descale the kettle every 30 days”, choose
**Count from: Completion** in the task details.
