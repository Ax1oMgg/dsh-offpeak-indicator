# dsh-offpeak-indicator

Строка в футере сайдбара DeepSeek Harness, которая отвечает на один вопрос:
**токены сейчас по льготной цене или по полной?**

- зелёная луна и «Льготный тариф» — скидка действует; справа таймер, сколько ещё осталось;
- солнце и «Полный тариф» — скидки нет; справа таймер, через сколько начнётся льготное время;
- клик открывает расписание, источник данных и кнопку ручной сверки;
- в свёрнутом сайдбаре остаётся только иконка с тем же таймером в подсказке.

Данные **не зашиты в плагин**: при каждом запуске Harness хост-половина заново
скачивает официальную страницу цен DeepSeek и календарь праздников КНР, разбирает
правило и сохраняет его в `~/.dsh/offpeak-indicator.json`. Если сети нет, работает
последнее сохранённое правило, а интерфейс честно пишет, что данные с прошлого
запуска.

## Установка

- GUI: **Настройки → Плагины → Добавить плагин** → указать каталог с этим
  репозиторием;
- CLI: `dsh plugin --profile desktop add ./dsh-offpeak-indicator`.

После установки клиентская половина подхватывается живьём; если строка не
появилась — обновить страницу (Ctrl+R). Хост-половина при правке кода
перезапускается выключением/включением bundle.

## Как считается

Официальное правило DeepSeek на момент написания:

> Off-peak rates are half of the peak rates. Peak hours are 01:00–04:00 and
> 06:00–10:00 UTC, Monday through Friday, excluding Chinese public holidays.
> All other hours are off-peak, including weekends and Chinese public holidays
> in full.

То есть по Москве полная цена — по будням 04:00–07:00 и 09:00–13:00, всё
остальное время (включая выходные и праздники КНР) — половина цены.

Плагин не полагается на эту формулировку в коде: `schedule.js` вытаскивает из
страницы окна, дни недели, часовой пояс, упоминание праздников и размер скидки,
а `holiday-cn` даёт список нерабочих дней Китая на текущий и следующий год.
Если страница поменяется и правило не распознаётся, остаётся встроенный
fallback, а в попапе появляется предупреждение.

## Источники

- [DeepSeek — Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)
  (и китайская версия как резерв).
- [NateScarlet/holiday-cn](https://github.com/NateScarlet/holiday-cn) —
  календарь праздников и переносов КНР; основной адрес raw.githubusercontent.com,
  резервный jsDelivr.

Запросы идут с хост-процесса Harness, не из браузера, поэтому CORS не мешает.
Таймаут — 20 секунд; повторная сверка — раз в 6 часов и по кнопке «Обновить».

## Что показывает попап

- текущий статус и точное время следующего переключения;
- окна полной цены, переведённые в часовой пояс браузера;
- напоминание, что праздники КНР считаются льготным временем;
- когда и с какого источника получены данные, были ли ошибки;
- кнопки «Обновить» и «Открыть прайс».

## Ограничения

- Правило берётся со страницы документации; если DeepSeek заменит её API или
  переверстает так, что парсер не найдёт фразу, плагин останется на последнем
  сохранённом правиле и покажет ошибку в попапе.
- Праздники КНР берутся из публичного зеркала `holiday-cn`. Если год ещё не
  опубликован (обычно следующий год появляется ближе к декабрю), этот год
  считается по будням без праздников.
- Часовой пояс окон — из правила (сейчас UTC); клиент пересчитывает их в
  локальное время браузера. Переход на летнее время в поясе правила не
  поддерживается, для UTC/UTC+8 это неактуально.
- Плагин ничего не меняет в сессиях, моделях и расходах: это только индикатор.
- `sidebar.footer.action` — штатный слот DSH; при его переименовании в новой
  версии Harness строка исчезнет, но приложение не сломается.

## Разработка

```bash
node --check index.js
node --check client.js
node --check schedule.js
node --test test/schedule.test.mjs test/client.test.mjs
```

| Файл | Назначение |
| --- | --- |
| `index.js` | Host: онлайн-сверка, кэш, HTTP-роут `/offpeak-indicator/state`. |
| `schedule.js` | Чистый парсер правила, календарь, расчёт фаз и переходов. |
| `client.js` | Client: строка в футере, таймер, попап, локали en/ru/zh. |
| `cordis.patch.yml` | Bundle-патч, монтирующий Host-половину. |

## English

A DeepSeek Harness plugin that puts one line in the sidebar footer: whether
token pricing is currently off-peak, and a live countdown to the next switch.
Clicking opens the schedule, the source of the data, and a manual refresh.

The rule is not hard-coded as the source of truth: on every Harness launch the
Host half fetches the official DeepSeek pricing page and the Chinese holiday
calendar, parses the peak-hours footnote, caches it in
`~/.dsh/offpeak-indicator.json`, and serves a snapshot over
`/offpeak-indicator/state`. When the network is down it keeps the last saved
rule and labels it as such. MIT licensed.

## Лицензия

MIT © 2026 Ax1oMgg
