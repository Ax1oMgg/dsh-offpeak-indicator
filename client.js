/**
 * Client half of dsh-offpeak-indicator.
 *
 * Renders one compact row at the sidebar foot: whether DeepSeek token pricing
 * is currently off-peak or full price, plus a live countdown to the next
 * switch. Clicking the row opens the schedule, sync status, and a refresh
 * action. All rule parsing and holiday handling stay in the Host half; this
 * file only renders the snapshot the Host serves.
 */
window.__ModuleLoader__.load({
  id: 'dsh-offpeak-indicator',
  factory(require) {
    const React = require('react')
    const { createPortal } = require('react-dom')

    const NS = 'offpeakIndicator'
    const h = React.createElement

    const en = {
      'status.offpeak': 'Off-peak rate',
      'status.peak': 'Full price',
      'status.loading': 'Checking rate',
      'status.unknown': 'Rate unavailable',
      'countdown.offpeak': 'ends in {time}',
      'countdown.peak': 'starts in {time}',
      'countdown.unknown': 'no data',
      'duration.minutes': '{count} min',
      'duration.hours': '{count} h',
      'duration.hoursMinutes': '{count} h {minutes} min',
      'duration.lessMinute': 'less than a minute',
      'weekday.sun': 'Sun',
      'weekday.mon': 'Mon',
      'weekday.tue': 'Tue',
      'weekday.wed': 'Wed',
      'weekday.thu': 'Thu',
      'weekday.fri': 'Fri',
      'weekday.sat': 'Sat',
      'weekdays.workdays': 'Mon–Fri',
      'details.title': 'Token pricing',
      'details.offpeakTitle': 'Off-peak token pricing is active',
      'details.peakTitle': 'Full token pricing is active',
      'details.offpeakBody': '{percent}% off until {time} ({at}).',
      'details.peakBody': 'Off-peak starts in {time}, at {at}.',
      'details.scheduleTitle': 'Full-price hours ({zone})',
      'details.schedule': '{days}, {windows}',
      'details.holidays': 'Chinese public holidays are off-peak all day.',
      'details.half': 'Off-peak tokens cost half the peak rate.',
      'details.syncedLive': 'Checked against api-docs.deepseek.com · {at}',
      'details.syncedCache': 'Network unavailable; using the last saved rule · {at}',
      'details.syncedFallback': 'Network unavailable; using the built-in rule.',
      'details.error': 'Last refresh failed: {message}',
      'details.refresh': 'Refresh',
      'details.refreshing': 'Refreshing…',
      'details.pricing': 'Open pricing page',
      'details.close': 'Close',
      'aria.label': 'Token pricing: {status}, {countdown}',
      'aria.loading': 'Token pricing: checking the official rules',
    }

    const ru = {
      'status.offpeak': 'Льготный тариф',
      'status.peak': 'Полный тариф',
      'status.loading': 'Проверяю тариф',
      'status.unknown': 'Тариф недоступен',
      'countdown.offpeak': 'ещё {time}',
      'countdown.peak': 'через {time}',
      'countdown.unknown': 'нет данных',
      'duration.minutes': '{count} мин',
      'duration.hours': '{count} ч',
      'duration.hoursMinutes': '{count} ч {minutes} мин',
      'duration.lessMinute': 'меньше минуты',
      'weekday.sun': 'Вс',
      'weekday.mon': 'Пн',
      'weekday.tue': 'Вт',
      'weekday.wed': 'Ср',
      'weekday.thu': 'Чт',
      'weekday.fri': 'Пт',
      'weekday.sat': 'Сб',
      'weekdays.workdays': 'Пн–Пт',
      'details.title': 'Цены на токены',
      'details.offpeakTitle': 'Сейчас действуют льготные цены',
      'details.peakTitle': 'Сейчас действует полная цена',
      'details.offpeakBody': 'Скидка {percent}% ещё {time} — до {at}.',
      'details.peakBody': 'Льготный тариф начнётся через {time} — в {at}.',
      'details.scheduleTitle': 'Полная цена ({zone})',
      'details.schedule': '{days}, {windows}',
      'details.holidays': 'Праздники КНР — льготный тариф весь день.',
      'details.half': 'В льготное время токены стоят вдвое дешевле.',
      'details.syncedLive': 'Сверено с api-docs.deepseek.com · {at}',
      'details.syncedCache': 'Сеть недоступна — правила с прошлого запуска · {at}',
      'details.syncedFallback': 'Сеть недоступна — встроенные правила.',
      'details.error': 'Последняя сверка не удалась: {message}',
      'details.refresh': 'Обновить',
      'details.refreshing': 'Обновляю…',
      'details.pricing': 'Открыть прайс',
      'details.close': 'Закрыть',
      'aria.label': 'Цены на токены: {status}, {countdown}',
      'aria.loading': 'Цены на токены: проверяю официальные правила',
    }

    const zh = {
      'status.offpeak': '闲时价',
      'status.peak': '全价',
      'status.loading': '正在核对价格',
      'status.unknown': '价格不可用',
      'countdown.offpeak': '还剩 {time}',
      'countdown.peak': '{time}后开始',
      'countdown.unknown': '无数据',
      'duration.minutes': '{count} 分钟',
      'duration.hours': '{count} 小时',
      'duration.hoursMinutes': '{count} 小时 {minutes} 分',
      'duration.lessMinute': '不到一分钟',
      'weekday.sun': '周日',
      'weekday.mon': '周一',
      'weekday.tue': '周二',
      'weekday.wed': '周三',
      'weekday.thu': '周四',
      'weekday.fri': '周五',
      'weekday.sat': '周六',
      'weekdays.workdays': '周一至周五',
      'details.title': 'Token 价格',
      'details.offpeakTitle': '当前为闲时价格',
      'details.peakTitle': '当前为全价',
      'details.offpeakBody': '优惠 {percent}%，还剩 {time}（至 {at}）。',
      'details.peakBody': '闲时价将在 {time}后开始（{at}）。',
      'details.scheduleTitle': '全价时段（{zone}）',
      'details.schedule': '{days} {windows}',
      'details.holidays': '中国法定节假日全天按闲时计价。',
      'details.half': '闲时 Token 价格为高峰的一半。',
      'details.syncedLive': '已与 api-docs.deepseek.com 核对 · {at}',
      'details.syncedCache': '网络不可用，使用上次保存的规则 · {at}',
      'details.syncedFallback': '网络不可用，使用内置规则。',
      'details.error': '上次刷新失败：{message}',
      'details.refresh': '刷新',
      'details.refreshing': '刷新中…',
      'details.pricing': '打开发布价格页',
      'details.close': '关闭',
      'aria.label': 'Token 价格：{status}，{countdown}',
      'aria.loading': 'Token 价格：正在核对官方规则',
    }

    const CSS = [
      '.dsh-opf{box-sizing:border-box;display:flex;flex:1 1 auto;align-items:center;gap:8px;min-width:0;height:34px;margin:0 0 2px;padding:0 8px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}',
      '.dsh-opf:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-opf:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}',
      '.dsh-opf[data-rail=true]{justify-content:center;width:36px;height:36px;padding:0;margin:0}',
      '.dsh-opf-icon{display:inline-flex;flex:none;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-label-tertiary)}',
      '.dsh-opf[data-status=offpeak] .dsh-opf-icon{color:var(--dsw-alias-state-success-primary,#2ea043)}',
      '.dsh-opf[data-status=peak] .dsh-opf-icon{color:var(--dsw-alias-state-warn-primary,#d29922)}',
      '.dsh-opf-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dsh-opf-count{margin-left:auto;flex:none;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;font-size:12px}',
      '.dsh-opf[data-status=offpeak] .dsh-opf-count{color:var(--dsw-alias-state-success-primary,#2ea043)}',
      '.dsh-opf-spin{animation:dsh-opf-rotate 1s linear infinite;transform-origin:50% 50%}',
      '@keyframes dsh-opf-rotate{to{transform:rotate(360deg)}}',
      '.dsh-opf-pop{position:fixed;z-index:80;box-sizing:border-box;width:min(360px,calc(100vw - 16px));max-height:min(520px,calc(100vh - 24px));overflow:auto;padding:14px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-overlay,#fff);color:var(--dsw-alias-label-primary);box-shadow:0 10px 32px rgba(0,0,0,.22);font-size:13px;line-height:19px}',
      '.dsh-opf-pop-head{display:flex;align-items:center;gap:8px;margin-bottom:2px}',
      '.dsh-opf-pop-head .dsh-opf-icon{width:18px;height:18px}',
      '.dsh-opf-pop-title{margin:0;font-size:14px;font-weight:600;line-height:20px}',
      '.dsh-opf-pop-sub{margin:0 0 10px;color:var(--dsw-alias-label-secondary)}',
      '.dsh-opf-pop-body{margin:0 0 12px;color:var(--dsw-alias-label-primary)}',
      '.dsh-opf-section{padding-top:10px;margin-top:10px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.dsh-opf-section-title{margin:0 0 3px;color:var(--dsw-alias-label-tertiary);font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase}',
      '.dsh-opf-muted{margin:2px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.dsh-opf-error{margin:8px 0 0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:17px;word-break:break-word}',
      '.dsh-opf-actions{display:flex;align-items:center;gap:8px;margin-top:12px}',
      '.dsh-opf-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:5px;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;cursor:pointer}',
      '.dsh-opf-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-opf-btn[data-primary=true]{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:#fff}',
      '.dsh-opf-btn:disabled{opacity:.55;cursor:default}',
      '.dsh-opf-link{margin-left:auto;color:var(--dsw-alias-state-business-primary);text-decoration:none;font-size:12px}',
      '.dsh-opf-link:hover{text-decoration:underline}',
    ].join('\n')

    if (typeof document !== 'undefined') {
      const tagId = 'dsh-offpeak-indicator/client.css'
      if (document.querySelector('style[data-plugin-css="' + tagId + '"]') === null) {
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-offpeak-indicator'
        tag.dataset.pluginCss = tagId
        tag.textContent = CSS
        document.head.appendChild(tag)
      }
    }

    const STATE_URL = '/offpeak-indicator/state'
    const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

    const pad = (value) => String(value).padStart(2, '0')

    function formatDuration(ms, t) {
      const total = Math.max(0, Math.ceil(ms / 60_000))
      if (total < 1) return t('duration.lessMinute')
      const hours = Math.floor(total / 60)
      const minutes = total % 60
      if (hours === 0) return t('duration.minutes', { count: minutes })
      if (minutes === 0) return t('duration.hours', { count: hours })
      return t('duration.hoursMinutes', { count: hours, minutes })
    }

    function formatCompact(ms) {
      const total = Math.max(0, Math.ceil(ms / 60_000))
      if (total >= 60) return `${Math.floor(total / 60)}:${pad(total % 60)}`
      const seconds = Math.max(0, Math.floor((ms % 60_000) / 1000))
      return `${total}:${pad(seconds)}`
    }

    function formatClock(iso) {
      if (typeof iso !== 'string') return '—'
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return '—'
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }

    function formatDateTime(iso) {
      if (typeof iso !== 'string') return '—'
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return '—'
      return date.toLocaleString(undefined, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    }

    function formatWindow(minutes) {
      const date = new Date(2000, 0, 1, 0, 0, 0)
      date.setMinutes(minutes)
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    }

    function weekdayLabel(days, t) {
      const sorted = [...new Set(days)].sort((a, b) => a - b)
      if (sorted.length === 5 && sorted.every((day, index) => day === index + 1)) {
        return t('weekdays.workdays')
      }
      return sorted.map((day) => t(`weekday.${DAY_KEYS[day]}`)).join(', ')
    }

    function timezoneLabel(offsetMinutes) {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
      const language = typeof navigator === 'undefined' ? '' : String(navigator.language).toLowerCase()
      if (zone === 'Europe/Moscow') return language.startsWith('ru') ? 'МСК' : 'MSK'
      if (zone === 'Asia/Shanghai') return language.startsWith('zh') ? '北京时间' : 'CST'
      const sign = offsetMinutes >= 0 ? '+' : '−'
      const absolute = Math.abs(offsetMinutes)
      const hours = Math.floor(absolute / 60)
      const minutes = absolute % 60
      return `UTC${sign}${hours}${minutes === 0 ? '' : `:${pad(minutes)}`}`
    }

    function scheduleText(schedule, t) {
      const localOffset = -new Date().getTimezoneOffset()
      const ruleOffset = schedule?.offsetMinutes ?? 0
      const toLocal = (minutes) => (minutes - ruleOffset + localOffset + 2880) % 1440
      const windows = (schedule?.windows ?? [])
        .map((window) => `${formatWindow(toLocal(window.start))}–${formatWindow(toLocal(window.end))}`)
        .join(' · ')
      return t('details.schedule', {
        days: weekdayLabel(schedule?.weekdays ?? [], t),
        windows,
      })
    }

    function MoonIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        h('path', { d: 'M13.2 9.4A5.3 5.3 0 0 1 6.6 2.8 5.3 5.3 0 1 0 13.2 9.4Z' }),
      )
    }

    function SunIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        h('circle', { cx: 8, cy: 8, r: 3 }),
        h('path', { d: 'M8 1.2v1.4M8 13.4v1.4M1.2 8h1.4M13.4 8h1.4M3.2 3.2l1 1M11.8 11.8l1 1M12.8 3.2l-1 1M4.2 11.8l-1 1' }),
      )
    }

    function RefreshIcon() {
      return h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
        h('path', { d: 'M13 5.4A5.2 5.2 0 1 0 13.2 9' }),
        h('path', { d: 'M13.4 2.4 13 5.4 10 5.2' }),
      )
    }

    function OffpeakAction({ wide, t }) {
      const [snapshot, setSnapshot] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [open, setOpen] = React.useState(false)
      const [anchor, setAnchor] = React.useState(null)
      const [now, setNow] = React.useState(() => Date.now())
      const buttonRef = React.useRef(null)
      const popoverRef = React.useRef(null)

      const load = React.useCallback(async (force) => {
        setBusy(true)
        try {
          const url = new URL(STATE_URL, window.location.origin)
          if (force) url.searchParams.set('refresh', '1')
          const response = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const payload = await response.json()
          if (payload?.ok !== true) throw new Error(payload?.error ?? 'invalid state payload')
          setSnapshot(payload)
          setError(null)
        }
        catch (failure) {
          setError(failure instanceof Error ? failure.message : String(failure))
        }
        finally {
          setBusy(false)
        }
      }, [])

      React.useEffect(() => {
        void load(false)
        const timer = setInterval(() => { void load(false) }, 60_000)
        return () => clearInterval(timer)
      }, [load])

      React.useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(timer)
      }, [])

      const nextChange = snapshot?.nextChangeAt === null || snapshot?.nextChangeAt === undefined
        ? 0
        : Date.parse(snapshot.nextChangeAt)

      React.useEffect(() => {
        if (nextChange === 0) return undefined
        const delay = nextChange - Date.now()
        if (delay <= 0) {
          void load(false)
          return undefined
        }
        const timer = setTimeout(() => { void load(false) }, delay + 1_500)
        return () => clearTimeout(timer)
      }, [nextChange, load])

      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          if (popoverRef.current?.contains(event.target)) return
          if (buttonRef.current?.contains(event.target)) return
          setOpen(false)
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [open])

      const toggle = () => {
        if (open) {
          setOpen(false)
          return
        }
        const rect = buttonRef.current?.getBoundingClientRect()
        if (rect !== undefined) {
          const width = Math.min(360, window.innerWidth - 16)
          setAnchor({
            left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
            bottom: Math.max(8, window.innerHeight - rect.top + 8),
          })
        }
        setOpen(true)
      }

      const status = snapshot?.status ?? (error === null ? 'loading' : 'unknown')
      const known = status === 'offpeak' || status === 'peak'
      const remaining = known && nextChange > 0 ? Math.max(0, nextChange - now) : 0
      const duration = known && nextChange > 0 ? formatDuration(remaining, t) : t('countdown.unknown')
      const compact = known && nextChange > 0 ? formatCompact(remaining) : '—'
      const label = t(`status.${status}`)
      const countdown = known ? t(`countdown.${status}`, { time: duration }) : t('countdown.unknown')
      const aria = known
        ? t('aria.label', { status: label, countdown })
        : t('aria.loading')

      const icon = status === 'offpeak' ? h(MoonIcon) : status === 'peak' ? h(SunIcon) : h(RefreshIcon)

      const popover = open && typeof document !== 'undefined'
        ? createPortal(
          h('div', {
            className: 'dsh-opf-pop',
            ref: popoverRef,
            role: 'dialog',
            'aria-label': t('details.title'),
            style: anchor === null ? undefined : { left: `${anchor.left}px`, bottom: `${anchor.bottom}px` },
            'data-status': status,
          },
          h('div', { className: 'dsh-opf-pop-head' },
            h('span', { className: 'dsh-opf-icon' }, icon),
            h('h2', { className: 'dsh-opf-pop-title' }, t('details.title')),
          ),
          h('p', { className: 'dsh-opf-pop-sub' }, known ? t(status === 'offpeak' ? 'details.offpeakTitle' : 'details.peakTitle') : label),
          h('p', { className: 'dsh-opf-pop-body' },
            known
              ? t(status === 'offpeak' ? 'details.offpeakBody' : 'details.peakBody', {
                percent: snapshot?.discountPercent ?? 50,
                time: duration,
                at: formatClock(snapshot?.nextChangeAt),
              })
              : (error ?? t('status.loading')),
          ),
          snapshot !== null
            ? h('div', { className: 'dsh-opf-section' },
              h('p', { className: 'dsh-opf-section-title' }, t('details.scheduleTitle', { zone: timezoneLabel(-new Date().getTimezoneOffset()) })),
              h('p', { className: 'dsh-opf-muted', style: { margin: 0, color: 'var(--dsw-alias-label-primary)' } }, scheduleText(snapshot.schedule, t)),
              snapshot.schedule?.excludeChineseHolidays === true
                ? h('p', { className: 'dsh-opf-muted' }, t('details.holidays'))
                : null,
              h('p', { className: 'dsh-opf-muted' }, t('details.half')),
            )
            : null,
          h('div', { className: 'dsh-opf-section' },
            h('p', { className: 'dsh-opf-muted' },
              snapshot?.data?.mode === 'live'
                ? t('details.syncedLive', { at: formatDateTime(snapshot.data.fetchedAt) })
                : snapshot?.data?.mode === 'cache'
                  ? t('details.syncedCache', { at: formatDateTime(snapshot.data.fetchedAt) })
                  : t('details.syncedFallback'),
            ),
            error !== null ? h('p', { className: 'dsh-opf-error' }, t('details.error', { message: error })) : null,
            snapshot?.data?.errors?.length > 0
              ? h('p', { className: 'dsh-opf-error' }, snapshot.data.errors.join('; '))
              : null,
            h('div', { className: 'dsh-opf-actions' },
              h('button', {
                type: 'button',
                className: 'dsh-opf-btn',
                disabled: busy,
                onClick: () => { void load(true) },
              },
              h('span', { className: busy ? 'dsh-opf-spin' : undefined }, h(RefreshIcon)),
              busy ? t('details.refreshing') : t('details.refresh'),
              ),
              h('a', {
                className: 'dsh-opf-link',
                href: snapshot?.data?.pricingUrl ?? 'https://api-docs.deepseek.com/quick_start/pricing',
                target: '_blank',
                rel: 'noreferrer noopener',
              }, t('details.pricing')),
            ),
          ),
        ),
          document.body,
        )
        : null

      return h(React.Fragment, null,
        h('button', {
          type: 'button',
          ref: buttonRef,
          className: 'dsh-opf',
          'data-status': status,
          'data-rail': wide ? 'false' : 'true',
          title: `${label} · ${countdown}`,
          'aria-label': aria,
          'aria-expanded': open,
          'aria-haspopup': 'dialog',
          onClick: toggle,
        },
        h('span', { className: busy && !known ? 'dsh-opf-icon dsh-opf-spin' : 'dsh-opf-icon' }, icon),
        wide ? h('span', { className: 'dsh-opf-label' }, label) : null,
        wide ? h('span', { className: 'dsh-opf-count' }, compact) : null,
        ),
        popover,
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, { en, ru, zh }),
          'offpeak-indicator: dictionaries',
        )
        ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'offpeak-indicator',
          order: -10,
          locale: NS,
        }, OffpeakAction))
      },
    }
  },
})
