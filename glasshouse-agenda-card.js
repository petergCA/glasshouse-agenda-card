/*!
 * Glasshouse Agenda Card v1.1.0
 * What's coming: today's deliveries and the week ahead from your calendars, in one card.
 * Part of the Glasshouse card suite. MIT License (c) 2026 Peter Gray.
 */
(() => {
  'use strict';

  const VERSION = '1.4.0';
  const TAG = 'glasshouse-agenda-card';

  const REFRESH_MS = 15 * 60000;
  const TICK_MS = 60000;
  const STALE_MS = 60000;
  const HOLD_MS = 500;
  const CAL_MIN_PX = 260;

  const ACCENTS = ['ok', 'warn', 'alert', 'info', 'light', 'fan', 'cover', 'switch', 'heat', 'cool', 'media',
    'lock', 'security', 'energy', 'water', 'neutral', 'accent'];
  const CAL_PALETTE = ['info', 'media', 'ok', 'light', 'heat', 'fan', 'cover', 'warn'];
  const DEAD = new Set(['unavailable', 'unknown', 'none', '']);

  const CARRIERS = {
    amzlus: 'Amazon', amazon: 'Amazon', amzl: 'Amazon', amzluk: 'Amazon', amzlde: 'Amazon', amzlca: 'Amazon',
    ups: 'UPS', fedex: 'FedEx', fdx: 'FedEx', usps: 'USPS', dhl: 'DHL', dhlgm: 'DHL', dhlexpress: 'DHL',
    ontrac: 'OnTrac', lasership: 'LaserShip', canadapost: 'Canada Post', royalmail: 'Royal Mail',
  };

  /* status_code (parcelapp): 0 delivered, 1 frozen, 2 in transit, 3 expecting pickup, 4 out for delivery,
   * 5 not found, 6 failed attempt, 7 exception, 8 info received. step: 0 info, 1 transit, 2 out, 3 delivered. */
  const STATUS = {
    0: { kind: 'delivered', word: 'Delivered', tone: 'done', step: 3, icon: 'mdi:package-variant-closed-check' },
    1: { kind: 'frozen', word: 'Not updating', tone: 'neutral', step: 1, icon: 'mdi:pause-circle-outline' },
    2: { kind: 'transit', word: 'In transit', tone: 'neutral', step: 1, icon: 'mdi:truck-outline' },
    3: { kind: 'pickup', word: 'Ready for pickup', tone: 'warn', step: 2, icon: 'mdi:storefront-outline' },
    4: { kind: 'out', word: 'Out for delivery', tone: 'out', step: 2, icon: 'mdi:truck-fast-outline' },
    5: { kind: 'notfound', word: 'Not found', tone: 'neutral', step: 0, icon: 'mdi:help-circle-outline' },
    6: { kind: 'failed', word: 'Failed attempt', tone: 'alert', step: 2, icon: 'mdi:alert-circle-outline' },
    7: { kind: 'exception', word: 'Exception', tone: 'alert', step: 1, icon: 'mdi:alert-circle-outline' },
    8: { kind: 'info', word: 'Label created', tone: 'neutral', step: 0, icon: 'mdi:tag-outline' },
  };
  const STEP_NAMES = ['Info received', 'In transit', 'Out for delivery', 'Delivered'];

  const toList = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
  const isNum = (v) => v !== null && v !== undefined && typeof v !== 'boolean' && String(v).trim() !== '' && !Number.isNaN(Number(v));
  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : s);
  const plural = (n, one, many) => (n === 1 ? one : many || `${one}s`);
  const pad = (n) => String(n).padStart(2, '0');
  const valid = (d) => d instanceof Date && Number.isFinite(d.getTime());

  function posInt(v, def, lo, hi) {
    const n = Math.round(Number(v));
    if (v === undefined || v === null || !Number.isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  }

  /** A Glasshouse accent name ("info", "ok", …) → its token; any other CSS colour passes through (sanitised). */
  function colorOf(c, i) {
    const s = c === undefined || c === null ? '' : String(c).trim();
    if (s && ACCENTS.includes(s.toLowerCase())) return `var(--gh-${s.toLowerCase()})`;
    if (s && /^[#\w\s(),.%/-]+$/.test(s) && !/;|url|expression/i.test(s)) return s;
    return `var(--gh-${CAL_PALETTE[(i || 0) % CAL_PALETTE.length]})`;
  }

  const STYLE = `
    :host {
      --gh-font: var(--glasshouse-font, -apple-system, "SF Pro Text", Inter, Roboto, system-ui, sans-serif);
      --gh-surface: var(--glasshouse-surface, rgba(255,255,255,0.045));
      --gh-surface-2: var(--glasshouse-surface-2, rgba(255,255,255,0.075));
      --gh-border: var(--glasshouse-border, rgba(255,255,255,0.09));
      --gh-blur: var(--glasshouse-blur, 18px);
      --gh-radius: var(--glasshouse-radius, 22px);
      --gh-radius-sm: var(--glasshouse-radius-sm, 14px);
      --gh-pad: var(--glasshouse-pad, 16px);
      --gh-gap: var(--glasshouse-gap, 10px);
      --gh-text: var(--glasshouse-text, #e9eef6);
      --gh-text-2: var(--glasshouse-text-2, #93a0b5);
      --gh-text-3: var(--glasshouse-text-3, #5d697d);
      --gh-ok: var(--glasshouse-ok, #3fb950);
      --gh-warn: var(--glasshouse-warn, #e3b341);
      --gh-alert: var(--glasshouse-alert, #ff5c5c);
      --gh-info: var(--glasshouse-info, #58a6ff);
      --gh-light: var(--glasshouse-light, #ffb547);
      --gh-fan: var(--glasshouse-fan, #4dd6e8);
      --gh-cover: var(--glasshouse-cover, #a3a8ff);
      --gh-switch: var(--glasshouse-switch, #7ee08a);
      --gh-heat: var(--glasshouse-heat, #ff7a59);
      --gh-cool: var(--glasshouse-cool, #58a6ff);
      --gh-media: var(--glasshouse-media, #c48cff);
      --gh-lock: var(--glasshouse-lock, #3fb950);
      --gh-security: var(--glasshouse-security, #ff5c5c);
      --gh-energy: var(--glasshouse-energy, #f6d365);
      --gh-water: var(--glasshouse-water, #4aa8ff);
      --gh-neutral: var(--glasshouse-neutral, #93a0b5);
      --gh-accent: var(--glasshouse-accent, var(--gh-info));
      --gh-ease: 160ms ease;
      --gh-spring: cubic-bezier(.2, .8, .2, 1);
      display: block;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    ha-card {
      display: block; position: relative;
      container: gh-agenda / inline-size;
      background: var(--gh-surface);
      border: 1px solid var(--gh-border);
      border-radius: var(--gh-radius);
      -webkit-backdrop-filter: blur(var(--gh-blur)) saturate(140%);
      backdrop-filter: blur(var(--gh-blur)) saturate(140%);
      padding: var(--gh-pad);
      color: var(--gh-text);
      font-family: var(--gh-font);
      font-size: 13px; font-weight: 500; line-height: 1.3;
      -webkit-font-smoothing: antialiased;
      overflow: hidden;
    }
    button {
      font: inherit; color: inherit; background: none; border: 0; margin: 0; padding: 0;
      cursor: pointer; text-align: left; -webkit-tap-highlight-color: transparent;
    }
    button:focus { outline: none; }
    button:focus-visible { outline: 2px solid var(--gh-accent); outline-offset: 2px; }
    ha-icon { display: inline-flex; --mdc-icon-size: 20px; }
    .tnum { font-variant-numeric: tabular-nums; }

    /* ---------- header ---------- */
    .head { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; min-height: 44px; padding: 0 2px; margin-bottom: 14px; }
    .titles { flex: 1 1 160px; min-width: 0; }
    .title { font-size: 16px; font-weight: 650; letter-spacing: -0.005em; line-height: 1.25;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .summary { margin-top: 3px; color: var(--gh-text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .summary b { color: var(--gh-text); font-weight: 600; }
    .summary .sep { color: var(--gh-text-3); margin: 0 6px; }
    @container gh-agenda (max-width: 480px) { .summary .opt { display: none; } }
    .counts { display: flex; flex-wrap: wrap; gap: 6px; flex: 0 1 auto; }
    .head.no-title .counts { flex: 1 1 auto; }
    .head.alone { margin-bottom: 0; }
    .cnt { --c: var(--gh-accent); position: relative; display: inline-flex; align-items: center; gap: 7px; height: 34px;
      padding: 0 12px 0 9px; border-radius: 999px; white-space: nowrap;
      background: color-mix(in srgb, var(--c) 13%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 38%, transparent), 0 0 18px -8px var(--c);
      transition: background var(--gh-ease), box-shadow var(--gh-ease); }
    .cnt::before { content: ""; position: absolute; inset: -5px -2px; }
    .cnt ha-icon { --mdc-icon-size: 18px; color: var(--c); }
    .cnt b { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
    .cnt span { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--gh-text-2); }
    .cnt.zero { --c: var(--gh-text-3); background: var(--gh-surface-2); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04); }
    .cnt.zero ha-icon { color: var(--gh-text-2); }
    .cnt.zero b { color: var(--gh-text-2); }
    .cnt.dead { opacity: .45; }

    /* ---------- layout ---------- */
    .body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; }
    .body.two > .cal, .body.cal-under > .cal { padding-top: 16px; border-top: 1px solid var(--gh-border); }
    .body.cal-under { gap: 14px; }
    .body.cal-under > .cal { padding-top: 12px; }
    .body.cal-under > .cal .zone-h { display: none; }
    .zone-h { display: flex; align-items: center; gap: 8px; height: 18px; margin: 0 2px 10px; }
    .label { font-size: 11px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: var(--gh-text-2); white-space: nowrap; }
    .count { min-width: 18px; height: 18px; padding: 0 6px; border-radius: 999px; display: inline-grid; place-items: center;
      font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums;
      color: var(--c, var(--gh-text-2)); background: color-mix(in srgb, var(--c, var(--gh-text-2)) 16%, transparent); }
    .zone-h .rule { flex: 1 1 auto; height: 1px; background: linear-gradient(90deg, var(--gh-border), transparent); }
    /* Today / All switch at the right of the deliveries header */
    .vsw { flex: 0 0 auto; display: inline-flex; padding: 2px; gap: 2px; border-radius: 999px; background: rgba(255,255,255,0.06);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05); }
    .vsw .vs { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 10px; border-radius: 999px; border: 0; cursor: pointer;
      font: inherit; font-size: 11px; font-weight: 650; letter-spacing: .02em; color: var(--gh-text-2); background: none; }
    .vsw .vs b { font-weight: 700; color: var(--gh-text-3); font-variant-numeric: tabular-nums; }
    .vsw .vs[aria-pressed="true"] { color: var(--gh-text); background: color-mix(in srgb, var(--gh-info) 22%, rgba(255,255,255,0.06));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gh-info) 40%, transparent); }
    .vsw .vs[aria-pressed="true"] b { color: var(--gh-info); }
    .zone-h:has(.vsw) { height: 26px; }
    .zone-h .aside { font-size: 11px; font-weight: 600; color: var(--gh-text-3); white-space: nowrap; font-variant-numeric: tabular-nums; }
    .cal { container: gh-cal / inline-size; min-width: 0; }
    .deliv { min-width: 0; }
    .scroll-wrap { position: relative; }

    ${['.body.two.lay-split'].map((p) => splitCss(p)).join('\n')}
    @container gh-agenda (min-width: 606px) {
      ${splitCss('.body.two.lay-auto')}
      .body.one .plist { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
    }
    @container gh-agenda (min-width: 700px) {
      .body.one .days.multi { display: block; columns: 2; column-gap: 28px; }
      .body.one .days .day { break-inside: avoid; border-top: 0; border-bottom: 1px solid rgba(255,255,255,0.06); padding: 8px 0 9px; }
      .body.one .days .day.last { border-bottom: 0; }
    }

    /* ---------- deliveries ---------- */
    .plist { display: flex; flex-direction: column; gap: 6px; }
    .pk { --tone: var(--gh-text-2); border-radius: var(--gh-radius-sm); background: var(--gh-surface-2);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03); overflow: hidden;
      transition: background var(--gh-ease), box-shadow var(--gh-ease); }
    .pk.t-out { --tone: var(--gh-ok);
      background: linear-gradient(90deg, color-mix(in srgb, var(--gh-ok) 12%, transparent), transparent 70%), var(--gh-surface-2);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gh-ok) 26%, transparent); }
    .pk.t-today { --tone: var(--gh-info); }
    .pk.t-alert { --tone: var(--gh-alert);
      background: linear-gradient(90deg, color-mix(in srgb, var(--gh-alert) 11%, transparent), transparent 70%), var(--gh-surface-2);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gh-alert) 22%, transparent); }
    .pk.t-warn { --tone: var(--gh-warn); }
    .pk.t-done { --tone: var(--gh-ok); }
    .pk.t-done .tx .t { color: var(--gh-text-2); }
    .pk .chip.done { border-radius: 50%; color: #fff; background: var(--gh-ok); box-shadow: 0 0 16px -4px var(--gh-ok); }
    .pk .chip.done ha-icon { --mdc-icon-size: 20px; }
    .pk-main { display: flex; align-items: center; gap: 11px; width: 100%; min-height: 56px; padding: 8px 10px 8px 9px; }
    .pk .chip { flex: 0 0 auto; width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center;
      color: var(--tone); background: color-mix(in srgb, var(--tone) 14%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tone) 30%, transparent); }
    /* carrier logos are circular: round chips (all of them, so fallbacks match), no fill behind the image */
    .plist.logos .pk .chip { border-radius: 50%; }
    .pk .chip.logo { background: none; overflow: hidden; padding: 0; }
    .pk .chip.logo img { width: 100%; height: 100%; object-fit: cover; display: block; border-radius: 50%; }
    .pk.t-out .chip { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gh-ok) 50%, transparent), 0 0 18px -6px var(--gh-ok); }
    .pk .chip.logo { box-shadow: 0 0 0 2px color-mix(in srgb, var(--tone) 45%, transparent); }
    .pk.t-alert .chip { animation: gh-pulse 2.4s ease-in-out infinite; }
    @keyframes gh-pulse { 50% { box-shadow: inset 0 0 0 1px var(--gh-alert), 0 0 22px -4px var(--gh-alert); } }
    .tx { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .tx .t { font-size: 14px; font-weight: 600; letter-spacing: -0.005em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tx .m { color: var(--gh-text-2); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tx .m b { font-weight: 650; color: var(--gh-text); opacity: .86; }
    .rt { flex: 0 0 auto; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
    .st { display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 8px; border-radius: 999px;
      font-size: 11px; font-weight: 650; letter-spacing: .02em; white-space: nowrap; font-variant-numeric: tabular-nums;
      color: var(--gh-text-2); background: rgba(255,255,255,0.06); }
    .t-out .st { color: var(--gh-ok); background: color-mix(in srgb, var(--gh-ok) 17%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gh-ok) 45%, transparent), 0 0 14px -4px var(--gh-ok); }
    .t-out .st i { width: 6px; height: 6px; border-radius: 50%; background: var(--gh-ok); box-shadow: 0 0 8px var(--gh-ok);
      animation: gh-live 2.4s ease-in-out infinite; }
    @keyframes gh-live { 50% { opacity: .35; } }
    .t-today .st { color: var(--gh-info); background: color-mix(in srgb, var(--gh-info) 15%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gh-info) 38%, transparent); }
    .t-alert .st { color: var(--gh-alert); background: color-mix(in srgb, var(--gh-alert) 15%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--gh-alert) 40%, transparent); }
    .t-warn .st { color: var(--gh-warn); background: color-mix(in srgb, var(--gh-warn) 14%, transparent); }
    .t-done .st { color: var(--gh-ok); background: color-mix(in srgb, var(--gh-ok) 12%, transparent); }
    .steps { display: flex; gap: 3px; }
    .steps i { width: 12px; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.10); }
    .steps i.on { background: color-mix(in srgb, var(--tone) 70%, transparent); }
    .steps i.cur { background: var(--tone); box-shadow: 0 0 6px 0 var(--tone); }
    .pk-more { display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 12px; border-radius: 10px;
      color: var(--gh-text-3); font-size: 12px; font-weight: 600; }
    button.pk-more.link { border: 0; background: none; font-family: inherit; cursor: pointer; width: 100%; text-align: left; }
    button.pk-more.link:hover { color: var(--gh-info); background: rgba(255,255,255,0.04); }
    .pk-detail { padding: 0 12px 12px 56px; }
    .tl { list-style: none; margin: 0; padding: 0; }
    .tl li { position: relative; padding: 0 0 9px 16px; }
    .tl li::before { content: ""; position: absolute; left: 0; top: 5px; width: 7px; height: 7px; border-radius: 50%;
      background: var(--gh-text-3); }
    .tl li:first-child::before { background: var(--tone); box-shadow: 0 0 8px var(--tone); }
    .tl li:not(:last-child)::after { content: ""; position: absolute; left: 3px; top: 14px; bottom: 0; width: 1px; background: rgba(255,255,255,0.10); }
    .tl .e { font-size: 12.5px; color: var(--gh-text); }
    .tl li:not(:first-child) .e { color: var(--gh-text-2); }
    .tl .w { font-size: 11px; color: var(--gh-text-3); margin-top: 1px; font-variant-numeric: tabular-nums;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pk-foot { display: flex; gap: 10px; font-size: 11px; color: var(--gh-text-3); font-variant-numeric: tabular-nums; letter-spacing: .02em; }
    .pk.open .pk-main .t { white-space: normal; }

    /* ---------- calendar ---------- */
    .days { display: flex; flex-direction: column; }
    .day { display: flex; gap: 12px; padding: 9px 0; }
    .day + .day { border-top: 1px solid rgba(255,255,255,0.06); }
    .day:first-child { padding-top: 2px; }
    .dcol { flex: 0 0 38px; display: flex; flex-direction: column; align-items: center; padding-top: 3px; }
    .dcol .wd { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--gh-text-3); white-space: nowrap; }
    .dcol .dn { font-size: 22px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; font-variant-numeric: tabular-nums; color: var(--gh-text); }
    .day.today .wd { color: var(--gh-accent); }
    .day.today .dn { color: var(--gh-accent); text-shadow: 0 0 18px color-mix(in srgb, var(--gh-accent) 55%, transparent); }
    .day.tmrw .wd { color: var(--gh-text-2); }
    .devs { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .pills { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 2px; }
    .pill { --c: var(--gh-info); max-width: 100%; display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 9px 0 7px;
      border-radius: 8px; font-size: 12px; font-weight: 600; color: var(--gh-text);
      background: color-mix(in srgb, var(--c) 16%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 30%, transparent); }
    .pill .pd { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 2px; background: var(--c); }
    .pill ha-icon { --mdc-icon-size: 14px; color: var(--c); }
    .pill .pt { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pill .ps { flex: 0 0 auto; font-size: 10.5px; color: var(--gh-text-2); font-variant-numeric: tabular-nums; }
    .ev { --c: var(--gh-info); position: relative; display: grid; grid-template-columns: auto 3px minmax(0, 1fr) auto; align-items: center;
      column-gap: 10px; width: 100%; min-height: 40px; padding: 4px 6px 4px 0; border-radius: 10px; overflow: hidden;
      transition: background var(--gh-ease); }
    .ev:hover { background: rgba(255,255,255,0.03); }
    .ev .tm { width: 58px; display: flex; flex-direction: column; align-items: flex-end; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .ev .tm .a { font-size: 13px; font-weight: 600; color: var(--gh-text); }
    .ev .tm .a small { font-size: 9.5px; font-weight: 700; letter-spacing: .02em; color: var(--gh-text-2); }
    .ev .tm .b { font-size: 11px; color: var(--gh-text-3); margin-top: 1px; }
    .ev .tm .r { display: none; font-size: 12.5px; font-weight: 600; color: var(--gh-text-2); }
    @container gh-cal (min-width: 470px) {
      .ev .tm { width: 112px; align-items: flex-start; padding-left: 2px; }
      .ev .tm .a, .ev .tm .b { display: none; }
      .ev .tm .r { display: block; }
    }
    .ev .bar { align-self: stretch; margin: 3px 0; width: 3px; border-radius: 3px; background: var(--c);
      box-shadow: 0 0 10px -2px color-mix(in srgb, var(--c) 70%, transparent); }
    .ev .tx .t { font-size: 13.5px; }
    .ev .tx .m { font-size: 11.5px; }
    .ev .tail { display: flex; align-items: center; gap: 6px; color: var(--gh-text-3); }
    .ev .tail ha-icon { --mdc-icon-size: 16px; color: color-mix(in srgb, var(--c) 75%, var(--gh-text-3)); }
    .tag { height: 20px; padding: 0 7px; border-radius: 999px; display: inline-grid; place-items: center; font-size: 11px; font-weight: 650;
      white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--gh-text-2); background: rgba(255,255,255,0.06); }
    .ev.next .tag { color: var(--gh-accent); background: color-mix(in srgb, var(--gh-accent) 14%, transparent); }
    .ev.now { background: linear-gradient(90deg, color-mix(in srgb, var(--c) 14%, transparent), color-mix(in srgb, var(--c) 4%, transparent)); }
    .ev.now .tag { color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 45%, transparent); }
    .ev.now .tm .a, .ev.now .tm .r { color: var(--gh-text); }
    .prog { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: color-mix(in srgb, var(--c) 18%, transparent); }
    .prog i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--c); box-shadow: 0 0 8px 0 var(--c); border-radius: 2px;
      transition: width 600ms var(--gh-spring); }
    .prog i::after { content: ""; position: absolute; right: -3px; top: -2px; width: 6px; height: 6px; border-radius: 50%;
      background: #fff; box-shadow: 0 0 8px 1px var(--c); }
    .dnone { display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 0 10px; border-radius: 10px;
      font-size: 13px; font-weight: 600; color: var(--gh-text-2); background: rgba(255,255,255,0.03); }
    .dnone ha-icon { --mdc-icon-size: 17px; color: var(--gh-text-3); }
    .dnone.done ha-icon { color: var(--gh-ok); }
    .dmore { font-size: 11.5px; font-weight: 600; color: var(--gh-text-3); padding: 2px 0 0 81px; }
    @container gh-cal (min-width: 470px) { .dmore { padding-left: 125px; } }
    .overflow { display: flex; align-items: center; gap: 8px; padding: 8px 2px 0 50px; font-size: 12px; font-weight: 600; color: var(--gh-text-3); }
    .calm { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 10px 12px; border-radius: var(--gh-radius-sm);
      color: var(--gh-text-2);
      background: radial-gradient(120% 140% at 0% 50%, color-mix(in srgb, var(--gh-ok) 9%, transparent), transparent 60%), var(--gh-surface-2);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03); }
    .calm .ci { flex: 0 0 auto; width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center;
      color: var(--gh-ok); background: color-mix(in srgb, var(--gh-ok) 13%, transparent); }
    .calm .ci ha-icon { --mdc-icon-size: 18px; }
    .calm b { color: var(--gh-text); font-weight: 600; }
    .calm.err { background: var(--gh-surface-2); }
    .calm.err .ci { color: var(--gh-warn); background: color-mix(in srgb, var(--gh-warn) 13%, transparent); }
    .note { display: flex; align-items: center; gap: 6px; margin: 8px 2px 0; font-size: 11.5px; font-weight: 600; color: color-mix(in srgb, var(--gh-warn) 80%, var(--gh-text-2)); }
    .note ha-icon { --mdc-icon-size: 14px; }
    .skel { display: flex; flex-direction: column; gap: 8px; }
    .skel i { display: block; height: 34px; border-radius: 10px;
      background: linear-gradient(90deg, rgba(255,255,255,0.04), rgba(255,255,255,0.08), rgba(255,255,255,0.04));
      background-size: 200% 100%; animation: gh-skel 1.4s ease-in-out infinite; }
    .skel i:nth-child(2) { width: 82%; } .skel i:nth-child(3) { width: 64%; }
    @keyframes gh-skel { from { background-position: 100% 0; } to { background-position: -100% 0; } }

    /* ---------- motion ---------- */
    .enter { animation: gh-in 420ms var(--gh-spring) both; }
    @keyframes gh-in { from { opacity: 0; transform: translateY(6px); } }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { transition: none !important; animation: none !important; }
    }
  `;

  /** Split layout: deliveries ≈40 % | calendar ≈60 %; the calendar scrolls inside the deliveries' height. */
  function splitCss(p) {
    return `
      ${p} { grid-template-columns: minmax(0, 4fr) minmax(0, 6fr); gap: 0; align-items: stretch; }
      ${p} > .deliv { padding-right: 18px; }
      ${p} > .cal { position: relative; display: flex; flex-direction: column; padding: 0 0 0 18px; border-top: 0;
        border-left: 1px solid var(--gh-border); min-height: var(--cal-min, ${CAL_MIN_PX}px); }
      ${p} > .cal .scroll-wrap { flex: 1 1 auto; }
      ${p} > .cal .scroller { position: absolute; inset: 0; overflow-y: auto; overscroll-behavior: contain;
        scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.14) transparent; padding-right: 4px; }
      ${p} > .cal .scroller.more { -webkit-mask-image: linear-gradient(#000 calc(100% - 30px), transparent);
        mask-image: linear-gradient(#000 calc(100% - 30px), transparent); }
      ${p} > .cal .scroller > .calm { min-height: 100%; }
    `;
  }

  /* ---------------------------------------------------------------- helpers */

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'style') el.style.cssText = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    if (children) for (const c of [].concat(children)) if (c !== null && c !== undefined && c !== false) el.append(c);
    return el;
  }

  function icon(name) {
    const el = document.createElement('ha-icon');
    el.setAttribute('icon', name);
    el.icon = name;
    return el;
  }

  /* ------------------------------------------------------------- date math (local, DST-safe) */

  function startOfDay(t) {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function addDays(t, n) {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }
  function dayKey(t) {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  /** Whole calendar days from b to a (local), safe across DST changes. */
  function dayDiff(a, b) {
    return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 864e5);
  }
  /** "YYYY-MM-DD" → local midnight (never UTC). Invalid → null. */
  function parseLocalDate(s) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return valid(d) && d.getDate() === +m[3] ? d : null;
  }
  /** Parcel "YYYY-MM-DD HH:MM:SS" (local wall time) or ISO with a zone. → {date, hasTime} or null. */
  function parseExpected(v) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
    const s = String(v).trim();
    if (DEAD.has(s.toLowerCase())) return null;
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/.exec(s);
    if (m) {
      const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
      if (!valid(d)) return null;
      return { date: d, hasTime: !!m[4] && !(+m[4] === 0 && +m[5] === 0 && +(m[6] || 0) === 0) };
    }
    const t = Date.parse(s);
    return Number.isFinite(t) ? { date: new Date(t), hasTime: true } : null;
  }

  /** A carrier event date in whatever format it comes: ISO-ish, "Saturday, November 14 12:04 PM" (no year), "November 14, 2026 1:52 AM". */
  function parseLoose(v, nowMs) {
    if (v === null || v === undefined) return null;
    // with a year, the normal parser is right; without one, Date.parse would guess 2001
    if (/\b\d{4}\b/.test(String(v))) { const p = parseExpected(v); if (p) return p.date; }
    let str = String(v).trim().replace(/^[A-Za-z]+day,\s*/, '');
    if (!str || /^-/.test(str)) return null;
    let t = Date.parse(str);
    if (!/\b\d{4}\b/.test(str)) {
      // no year: assume this year (or last year when that would put it in the future)
      const y = new Date(nowMs).getFullYear();
      const withYear = str.replace(/^([A-Za-z]+\.?\s+\d{1,2})(,)?/, `$1, ${y}`);
      t = Date.parse(withYear);
      if (Number.isFinite(t) && t > nowMs + 864e5) t = Date.parse(withYear.replace(String(y), String(y - 1)));
    }
    return Number.isFinite(t) ? new Date(t) : null;
  }

  /* ------------------------------------------------------------- locale */

  const fmtCache = new Map();
  function fmt(lang, opts) {
    const key = `${lang}|${JSON.stringify(opts)}`;
    let f = fmtCache.get(key);
    if (!f) {
      try { f = new Intl.DateTimeFormat(lang || undefined, opts); } catch (e) { f = new Intl.DateTimeFormat('en-US', opts); }
      fmtCache.set(key, f);
    }
    return f;
  }

  /** {lang, h12} from hass.locale (time_format 12 / 24 / language / system). */
  function localeOf(hass) {
    const l = (hass && hass.locale) || {};
    const lang = l.language || (hass && hass.language) || (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    const tf = String(l.time_format || 'language');
    let h12;
    if (tf === '12') h12 = true;
    else if (tf === '24') h12 = false;
    else {
      try {
        const ro = fmt(tf === 'system' ? undefined : lang, { hour: 'numeric' }).resolvedOptions();
        h12 = ro.hourCycle ? ro.hourCycle === 'h11' || ro.hourCycle === 'h12' : ro.hour12 !== false;
      } catch (e) { h12 = true; }
    }
    return { lang, h12 };
  }

  /** Time parts: {main: "4:30", period: "PM"} (period '' in 24-h). */
  function timeParts(d, loc) {
    const L = loc || { lang: 'en-US', h12: true };
    try {
      const parts = fmt(L.lang, { hour: 'numeric', minute: '2-digit', hour12: L.h12 }).formatToParts(d);
      const period = (parts.find((p) => p.type === 'dayPeriod') || {}).value || '';
      const main = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
      return { main, period };
    } catch (e) {
      return { main: `${d.getHours()}:${pad(d.getMinutes())}`, period: '' };
    }
  }
  function fmtTime(d, loc) {
    const p = timeParts(d, loc);
    return p.period ? `${p.main} ${p.period}` : p.main;
  }
  function isMidnightNext(end, start) {
    return dayDiff(end, start) === 1 && end.getHours() === 0 && end.getMinutes() === 0;
  }
  /** The two halves of a time range: {a: "4:30", b: "5:30 PM"} (period dropped from a when shared).
   *  End on a later day → {a: "9:00 PM", b: "→ Fri"}. No duration → b ''. */
  function rangeParts(start, end, loc) {
    const ta = timeParts(start, loc);
    const full = (p) => (p.period ? `${p.main} ${p.period}` : p.main);
    if (!end || end.getTime() <= start.getTime()) return { a: full(ta), b: '' };
    if (dayKey(end) !== dayKey(start) && !isMidnightNext(end, start)) {
      return { a: full(ta), b: `→ ${weekdayShort(end, loc)}`, multi: true };
    }
    const tb = timeParts(end, loc);
    return { a: ta.period && ta.period === tb.period ? ta.main : full(ta), b: full(tb) };
  }
  /** "4:30 – 5:30 PM", "11:00 AM – 1:00 PM", "16:30 – 17:30"; end on another day → "9:00 PM → Fri". */
  function fmtRange(start, end, loc) {
    const r = rangeParts(start, end, loc);
    if (!r.b) return r.a;
    return r.multi ? `${r.a} ${r.b}` : `${r.a} – ${r.b}`;
  }
  function weekdayShort(d, loc) {
    try { return fmt((loc && loc.lang) || 'en-US', { weekday: 'short' }).format(d).replace(/\.$/, ''); } catch (e) { return ''; }
  }
  function monthDay(d, loc) {
    try { return fmt((loc && loc.lang) || 'en-US', { month: 'short', day: 'numeric' }).format(d); } catch (e) { return dayKey(d); }
  }
  function fmtIn(min) {
    const m = Math.max(0, Math.round(min));
    if (m < 1) return 'now';
    if (m < 60) return `in ${m} min`;
    const hh = Math.floor(m / 60), mm = m % 60;
    return mm ? `in ${hh}h ${mm}m` : `in ${hh} h`;
  }
  function fmtLeft(min) {
    const m = Math.max(0, Math.round(min));
    if (m < 60) return `${m} min left`;
    const hh = Math.floor(m / 60), mm = m % 60;
    return mm ? `${hh}h ${mm}m left` : `${hh} h left`;
  }

  /* ------------------------------------------------------------- config */

  function normConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`${TAG}: invalid configuration`);
    const calendars = toList(config.calendars !== undefined ? config.calendars : config.entities).map((c, i) => {
      const o = typeof c === 'string' ? { entity: c } : c;
      if (!o || typeof o !== 'object' || typeof o.entity !== 'string' || !/^calendar\.\w+/.test(o.entity)) {
        throw new Error(`${TAG}: calendars item ${i + 1} needs an "entity" like calendar.family`);
      }
      return { entity: o.entity, name: o.name ? String(o.name) : null, color: colorOf(o.color, i),
        icon: typeof o.icon === 'string' ? o.icon : null, idx: i };
    });
    let deliveries = null;
    if (config.deliveries) {
      const d = typeof config.deliveries === 'string' ? { entity: config.deliveries } : config.deliveries;
      if (!d || typeof d !== 'object' || typeof d.entity !== 'string' || !d.entity.includes('.')) {
        throw new Error(`${TAG}: "deliveries" needs an "entity" (a sensor holding the list of deliveries)`);
      }
      deliveries = {
        entity: d.entity, attribute: typeof d.attribute === 'string' && d.attribute ? d.attribute : 'deliveries',
        show_delivered: d.show_delivered === true, max: posInt(d.max, 4, 1, 50), name: d.name ? String(d.name) : 'Deliveries',
        // default_view: today | all. Set → a Today / All switch appears in the header (all = old behaviour, no switch)
        view: d.default_view === 'today' || d.default_view === 'all' ? d.default_view : null,
        // carrier_icons: 'parcelapp' (logos the ParcelApp integration serves) or {carrier_code: image url}
        logos: d.carrier_icons === 'parcelapp' ? 'parcelapp'
          : (d.carrier_icons && typeof d.carrier_icons === 'object' && !Array.isArray(d.carrier_icons) ? { ...d.carrier_icons } : null),
      };
    }
    const counts = toList(config.counts).map((c, i) => {
      const o = typeof c === 'string' ? { entity: c } : c;
      if (!o || typeof o !== 'object' || typeof o.entity !== 'string' || !o.entity.includes('.')) {
        throw new Error(`${TAG}: counts item ${i + 1} needs an "entity"`);
      }
      return { entity: o.entity, name: o.name ? String(o.name) : null, icon: typeof o.icon === 'string' ? o.icon : 'mdi:package-variant',
        color: o.color ? colorOf(o.color, i) : null };
    });
    if (!calendars.length && !deliveries && !counts.length) {
      throw new Error(`${TAG}: add at least one of "calendars", "deliveries" or "counts"`);
    }
    const layout = String(config.layout || 'auto').toLowerCase();
    if (!['auto', 'stacked', 'split'].includes(layout)) throw new Error(`${TAG}: layout must be auto, stacked or split`);
    return {
      title: config.title === false ? false : config.title === undefined || config.title === null ? 'Coming up' : String(config.title),
      days: posInt(config.days, 7, 1, 31),
      max_events: posInt(config.max_events, 14, 1, 200),
      event_days: config.event_days === undefined ? 0 : posInt(config.event_days, 5, 1, 31),
      always_today: config.always_today !== false,
      calendars, deliveries, counts, layout,
    };
  }

  /* ------------------------------------------------------------- calendar */

  /** HA calendar API event → {summary, start, end, allDay, …}. null when unusable. */
  function normEvent(raw, cal) {
    if (!raw || typeof raw !== 'object') return null;
    const rs = raw.start, re = raw.end;
    const sObj = rs && typeof rs === 'object' ? rs : { dateTime: rs };
    const eObj = re && typeof re === 'object' ? re : { dateTime: re };
    const sDate = sObj.date || (typeof sObj.dateTime === 'string' && /^\d{4}-\d{1,2}-\d{1,2}$/.test(sObj.dateTime) ? sObj.dateTime : null);
    let start, end, allDay = false;
    if (sDate && !(sObj.dateTime && sObj.dateTime !== sDate)) {
      allDay = true;
      start = parseLocalDate(sDate);
      if (!start) return null;
      end = parseLocalDate(eObj.date || eObj.dateTime);
      if (!end || end.getTime() <= start.getTime()) end = addDays(start, 1);
    } else {
      start = new Date(sObj.dateTime);
      if (!valid(start)) return null;
      end = eObj.dateTime ? new Date(eObj.dateTime) : eObj.date ? parseLocalDate(eObj.date) : null;
      if (!valid(end) || end.getTime() < start.getTime()) end = new Date(start.getTime());
    }
    const summary = String(raw.summary || raw.message || raw.title || 'Busy').trim() || 'Busy';
    return {
      summary, start, end, allDay,
      location: raw.location ? String(raw.location).replace(/\s+/g, ' ').trim() : '',
      cal: cal || { entity: '', color: 'var(--gh-info)', idx: 0 },
      key: `${cal ? cal.entity : ''}|${start.getTime()}|${summary}`,
    };
  }

  /**
   * Group events into visible days. Ended timed events are dropped; all-day events cover every day they span;
   * a timed event that began before today and is still running shows on today. max_events caps the total.
   */
  function buildAgenda(events, nowMs, days, maxEvents, eventDays = 0) {
    const today = startOfDay(nowMs);
    const out = [];
    const seen = new Set();
    const list = (events || []).filter((e) => {
      if (!e || seen.has(e.key)) return false;
      seen.add(e.key);
      return true;
    });
    for (let i = 0; i < days; i += 1) {
      const d0 = addDays(today, i), d1 = addDays(today, i + 1);
      const allDay = [], timed = [];
      for (const ev of list) {
        const s = ev.start.getTime(), e = ev.end.getTime();
        if (ev.allDay) {
          if (s < d1.getTime() && e > d0.getTime()) {
            const total = Math.max(1, dayDiff(ev.end, ev.start));
            allDay.push({ ev, part: total > 1 ? dayDiff(d0, ev.start) + 1 : 0, total });
          }
          continue;
        }
        if (e <= nowMs && s < nowMs) continue; // ended
        if (s >= d0.getTime() && s < d1.getTime()) timed.push({ ev, cont: false });
        else if (i === 0 && s < d0.getTime() && e > nowMs) timed.push({ ev, cont: true });
      }
      if (!allDay.length && !timed.length) continue;
      allDay.sort((a, b) => a.ev.start - b.ev.start || a.ev.cal.idx - b.ev.cal.idx || a.ev.summary.localeCompare(b.ev.summary));
      timed.sort((a, b) => a.ev.start - b.ev.start || a.ev.end - b.ev.end || a.ev.cal.idx - b.ev.cal.idx);
      out.push({ date: d0, key: dayKey(d0), offset: i, allDay, timed });
      if (eventDays && out.length >= eventDays) break; // event_days: the first N days that have something on
    }
    let budget = maxEvents, hidden = 0, hiddenUntil = null, total = 0;
    const shown = [];
    for (const day of out) {
      const n = day.allDay.length + day.timed.length;
      total += n;
      if (budget <= 0) { hidden += n; hiddenUntil = day.date; continue; }
      const a = day.allDay.slice(0, budget); budget -= a.length;
      const t = day.timed.slice(0, Math.max(0, budget)); budget -= t.length;
      shown.push({ ...day, allDay: a, timed: t, more: n - a.length - t.length });
    }
    return { days: shown, hidden, hiddenUntil, total };
  }

  /* ------------------------------------------------------------- deliveries */

  const PARCELAPP_LOGOS = {
    ups: 'ups.png', usps: 'usps.jpg', fedex: 'fedex.png', amzlus: 'amazon_orange_v3.png', amazon: 'amazon_orange_v3.png',
    gofous: 'gofous.png', abf: 'abf.png', speedx: 'speedx_v2.png', uniuni: 'uniuni.png', ontrac: 'ontrac.png', ont: 'ontrac.png',
    gso: 'gls.png', gls: 'gls.png', yun: 'yunexpress.png', yunexpress: 'yunexpress.png', veho: 'veho.png', cp: 'canadapost.png',
    aliex: 'aliexpress.png',
  };

  /** Logo URL for a delivery's carrier, or null (the status icon is used then). */
  function carrierLogo(code, logos, delivered) {
    if (!logos) return null;
    const c = String(code || '').toLowerCase().trim();
    if (logos === 'parcelapp') {
      if (delivered) return '/parcelapp/images/delivered.png';
      return PARCELAPP_LOGOS[c] ? `/parcelapp/images/${PARCELAPP_LOGOS[c]}` : '/parcelapp/images/package.png';
    }
    return typeof logos[c] === 'string' ? logos[c] : (typeof logos.default === 'string' ? logos.default : null);
  }

  function carrierLabel(code) {
    const c = String(code || '').trim();
    if (!c) return '';
    const k = c.toLowerCase().replace(/[\s_-]/g, '');
    if (CARRIERS[k]) return CARRIERS[k];
    if (/^amzn?l/.test(k) || k.startsWith('amazon')) return 'Amazon';
    return c.toUpperCase();
  }

  function last4(tn) {
    const s = String(tn || '').replace(/\s+/g, '');
    return s.length >= 4 ? s.slice(-4) : '';
  }

  /** Days until the expected delivery (calendar days, local). null when unknown. */
  function deliveryDays(item, nowMs) {
    if (isNum(item.days_to_delivery)) return Math.round(Number(item.days_to_delivery));
    const ex = parseExpected(item.date_expected);
    return ex ? dayDiff(ex.date, nowMs) : null;
  }

  /** {kind, word, label, tone, step, icon, days, rank, expected}. tone: out | today | alert | warn | done | neutral. */
  function deliveryStatus(item, nowMs) {
    const it = item && typeof item === 'object' ? item : {};
    const code = isNum(it.status_code) ? Number(it.status_code) : null;
    let base = STATUS[code] || STATUS[2];
    if (it.delivered === true || it.delivered === 'true') base = STATUS[0];
    const days = deliveryDays(it, nowMs);
    const ex = parseExpected(it.date_expected);
    let label = base.word, tone = base.tone;
    if (base.kind === 'transit' || base.kind === 'info' || base.kind === 'frozen' || base.kind === 'notfound') {
      if (days === 0) { label = 'Today'; tone = 'today'; }
      else if (days === 1) label = 'Tomorrow';
      else if (days > 1) label = `in ${days} d`;
      else if (days !== null && days < 0) { label = 'Late'; tone = 'warn'; }
      else if (base.kind === 'transit') label = 'In transit';
    }
    let rank, deliveredAt = null, dDays = days;
    if (base.kind === 'out') rank = -1000;
    else if (base.kind === 'delivered') {
      const ev0 = Array.isArray(it.events) && it.events[0] && typeof it.events[0] === 'object' ? it.events[0] : null;
      deliveredAt = ev0 ? parseLoose(ev0.date, nowMs) : null;
      if (deliveredAt) dDays = dayDiff(deliveredAt, nowMs);
      // newest delivery first among the delivered
      rank = 1e6 + (deliveredAt ? Math.max(0, (nowMs - deliveredAt.getTime()) / 6e4) : 1e5);
    } else rank = days === null ? 5000 : days;
    return {
      kind: base.kind, word: base.word, label, tone, step: base.step, icon: base.icon, days: dDays, rank, deliveredAt,
      expected: ex && ex.hasTime && days === 0 ? ex.date : null,
    };
  }

  /** Read, filter and sort the delivery list: out for delivery first, then by days to delivery. */
  function readDeliveries(st, cfg, nowMs) {
    if (!st || !cfg) return { items: [], ok: false };
    const raw = (st.attributes || {})[cfg.attribute];
    let list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? Object.values(raw) : [];
    if (!Array.isArray(raw) && typeof raw === 'string') {
      try { const j = JSON.parse(raw); list = Array.isArray(j) ? j : []; } catch (e) { list = []; }
    }
    const items = [];
    list.forEach((it, i) => {
      if (!it || typeof it !== 'object') return;
      const s = deliveryStatus(it, nowMs);
      if (s.kind === 'delivered' && !cfg.show_delivered) return;
      items.push({ it, s, i, key: `p${hash(String(it.tracking_number || '') + '|' + String(it.description || '') + '|' + (it.tracking_number ? '' : i))}` });
    });
    const alertFirst = (x) => (x.s.tone === 'alert' ? 0 : 1);
    items.sort((a, b) => a.s.rank - b.s.rank || alertFirst(a) - alertFirst(b) || a.i - b.i);
    return { items, ok: !DEAD.has(String(st.state).toLowerCase()) || items.length > 0 };
  }

  function hash(s) {
    let x = 5381;
    for (let i = 0; i < s.length; i += 1) x = ((x << 5) + x + s.charCodeAt(i)) | 0;
    return (x >>> 0).toString(36);
  }

  function fmtEventWhen(v, nowMs, loc) {
    const ex = parseExpected(v);
    if (!ex) return v ? String(v) : '';
    const d = ex.date, dd = dayDiff(d, nowMs);
    const day = dd === 0 ? 'Today' : dd === -1 ? 'Yesterday' : dd === 1 ? 'Tomorrow' : `${weekdayShort(d, loc)} ${monthDay(d, loc)}`;
    return ex.hasTime ? `${day}, ${fmtTime(d, loc)}` : day;
  }

  /* ------------------------------------------------------------- interaction */

  function bindTap(el, onTap, onHold) {
    let timer = null, held = false;
    const cancel = () => { clearTimeout(timer); timer = null; };
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      held = false;
      cancel();
      if (onHold) timer = setTimeout(() => { held = true; onHold(); }, HOLD_MS);
    });
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
    if (onHold) el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('click', (e) => {
      if (held) { held = false; e.preventDefault(); return; }
      onTap(e);
    });
  }

  /* ================================================================ card */

  class GlasshouseAgendaCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._cache = new Map();
      this._expanded = new Set();
      this._seen = new Map();
      this._token = 0;
      this._lastFetch = 0;
      this._fetchDay = '';
      this._loading = false;
      this._connected = false;
      this._animDeliv = true;
      this._animCal = true;
      this._now = () => Date.now();
    }

    static getStubConfig(hass) {
      const ids = Object.keys((hass && hass.states) || {});
      const cals = ids.filter((id) => id.startsWith('calendar.')).slice(0, 3);
      const cfg = { title: 'Coming up', days: 7, calendars: cals.length ? cals.map((entity) => ({ entity })) : [{ entity: 'calendar.family' }] };
      const parcel = ids.find((id) => id.startsWith('sensor.') && /parcel|deliver|package/.test(id)
        && hass.states[id].attributes && Array.isArray(hass.states[id].attributes.deliveries));
      if (parcel) cfg.deliveries = { entity: parcel };
      return cfg;
    }

    setConfig(config) {
      const c = normConfig(config);
      this._config = c;
      this._watch = [...(c.deliveries ? [c.deliveries.entity] : []), ...c.counts.map((x) => x.entity)];
      this._cache.clear();
      this._seen.clear();
      this._expanded.clear();
      this._lastFetch = 0;
      this._token += 1;
      this._built = false;
      this._loading = false;
      this._animDeliv = true;
      this._animCal = true;
      if (this._hass) this.hass = this._hass;
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._config || !hass) return;
      try {
        if (!this._built) this._build();
        let changed = !this._primed;
        const states = hass.states || {};
        for (const id of this._watch) {
          if (!this._seen.has(id) || states[id] !== this._seen.get(id)) { this._seen.set(id, states[id]); changed = true; }
        }
        const locKey = JSON.stringify(hass.locale || {});
        if (locKey !== this._locKey) { this._locKey = locKey; this._loc = localeOf(hass); changed = true; }
        if (!this._lastFetch && !this._loading) this._fetchAll();
        if (changed) { this._primed = true; this._render(); }
      } catch (e) {
        this._warn(e);
      }
    }

    get hass() { return this._hass; }

    connectedCallback() {
      this._connected = true;
      if (!this._tick) this._tick = setInterval(() => this._onTick(), TICK_MS);
      if (this._hass && this._config && this._lastFetch && this._now() - this._lastFetch > STALE_MS) this._fetchAll();
      this._observe();
      if (this._built) this._render();
    }

    disconnectedCallback() {
      this._connected = false;
      clearInterval(this._tick);
      this._tick = null;
      if (this._ro) this._ro.disconnect();
    }

    _observe() {
      if (!this._built || typeof ResizeObserver !== 'function') return;
      try {
        if (!this._ro) this._ro = new ResizeObserver(() => this._fitCal());
        this._ro.disconnect();
        this._ro.observe(this._el.calInner);
        this._ro.observe(this._el.deliv);
      } catch (e) { /* optional */ }
    }

    getCardSize() {
      const c = this._config;
      if (!c) return 4;
      const d = this._lastDeliv ? Math.min(this._lastDeliv, c.deliveries ? c.deliveries.max : 0) : 0;
      const e = this._lastEvents !== undefined ? this._lastEvents : Math.min(c.max_events, 6);
      return Math.max(2, 1 + Math.ceil(d * 1.3) + Math.ceil(e * 0.9));
    }

    getGridOptions() {
      return { columns: 12, min_columns: 6, rows: 'auto' };
    }

    _warn(e) {
      if (this._warned) return;
      this._warned = true;
      // eslint-disable-next-line no-console
      console.warn(`${TAG}:`, e);
    }

    _onTick() {
      try {
        const now = this._now();
        if (dayKey(now) !== this._fetchDay || now - this._lastFetch >= REFRESH_MS) this._fetchAll();
        else this._renderCal();
        if (this._config && this._config.deliveries) this._renderDeliv();
      } catch (e) { this._warn(e); }
    }

    /* ------------------------------------------------------------ fetching */

    _fetchAll() {
      const c = this._config, hass = this._hass;
      if (!c || !hass || !c.calendars.length) return Promise.resolve();
      const token = ++this._token;
      const now = this._now();
      const start = startOfDay(now), end = addDays(start, c.days);
      const qs = `start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;
      this._lastFetch = now;
      this._fetchDay = dayKey(now);
      this._loading = true;
      const jobs = c.calendars.map((cal) => {
        let p;
        try {
          if (typeof hass.callApi !== 'function') throw new Error('callApi unavailable');
          p = Promise.resolve(hass.callApi('GET', `calendars/${cal.entity}?${qs}`));
        } catch (e) {
          p = Promise.reject(e);
        }
        return p.then((res) => {
          if (token !== this._token) return;
          const evs = (Array.isArray(res) ? res : []).map((r) => normEvent(r, cal)).filter(Boolean);
          this._cache.set(cal.entity, { events: evs, ok: true, at: now });
          this._scheduleCal();
        }, (err) => {
          if (token !== this._token) return;
          const prev = this._cache.get(cal.entity);
          this._cache.set(cal.entity, { events: prev ? prev.events : [], ok: false, at: now, err: String((err && (err.message || err.body || err)) || 'error') });
          this._scheduleCal();
        });
      });
      return Promise.all(jobs).then(() => {
        if (token !== this._token) return;
        this._loading = false;
        this._renderCal();
      });
    }

    _scheduleCal() {
      if (this._calQueued) return;
      this._calQueued = true;
      Promise.resolve().then(() => { this._calQueued = false; try { this._renderCal(); } catch (e) { this._warn(e); } });
    }

    /* ------------------------------------------------------------ build */

    _build() {
      const root = this.shadowRoot;
      root.innerHTML = '';
      root.append(h('style', { text: STYLE }));
      const card = document.createElement('ha-card');
      const E = (this._el = {});
      const c = this._config;
      E.title = h('div', { class: 'title' });
      E.sum = h('div', { class: 'summary', role: 'status' });
      E.counts = h('div', { class: 'counts' });
      E.head = h('div', { class: 'head' }, [h('div', { class: 'titles' }, [E.title, E.sum]), E.counts]);

      E.delivCount = h('span', { class: 'count' });
      E.plist = h('div', { class: c.deliveries && c.deliveries.logos ? 'plist logos' : 'plist' });
      const dz = h('div', { class: 'zone-h' }, [h('span', { class: 'label', text: c.deliveries ? c.deliveries.name : 'Deliveries' }), E.delivCount, h('span', { class: 'rule' })]);
      E.vsw = null;
      if (c.deliveries && c.deliveries.view) {
        if (!this._dview) this._dview = c.deliveries.view;
        const mk = (v, t) => {
          const b = h('button', { class: 'vs', type: 'button', 'data-v': v, 'aria-pressed': 'false' }, [h('span', { text: t }), h('b')]);
          b.addEventListener('click', (e) => { e.stopPropagation(); if (this._dview === v) return; this._dview = v; this._delivSig = null; this._animDeliv = true; this._renderDeliv(); });
          return b;
        };
        E.vsw = h('div', { class: 'vsw', role: 'group', 'aria-label': 'Show deliveries' }, [mk('today', 'Today'), mk('all', 'All')]);
        dz.append(E.vsw);
      }
      E.deliv = h('section', { class: 'deliv', 'aria-label': c.deliveries ? c.deliveries.name : 'Deliveries' }, [dz, E.plist]);

      E.range = h('span', { class: 'aside' });
      E.days = h('div', { class: 'days' });
      E.calInner = h('div', { class: 'cal-inner' }, [E.days]);
      E.scroller = h('div', { class: 'scroller' }, [E.calInner]);
      E.cal = h('section', { class: 'cal', 'aria-label': 'Calendar' }, [
        h('div', { class: 'zone-h' }, [h('span', { class: 'label', text: 'Calendar' }), h('span', { class: 'rule' }), E.range]),
        h('div', { class: 'scroll-wrap' }, [E.scroller]),
      ]);
      E.scroller.addEventListener('scroll', () => this._updateFade(), { passive: true });

      E.body = h('div', { class: `body lay-${c.layout}` }, [E.deliv, E.cal]);
      card.append(E.head, E.body);
      root.append(card);
      this._card = card;
      this._built = true;
      this._primed = false;
      this._calSig = null;
      this._delivSig = null;
      this._observe();
    }

    /* ------------------------------------------------------------ render */

    _render() {
      if (!this._built || !this._config || !this._hass) return;
      try { this._renderDeliv(); } catch (e) { this._warn(e); }
      try { this._renderCal(); } catch (e) { this._warn(e); }
    }

    _layoutClasses() {
      const c = this._config, E = this._el;
      const hasCal = c.calendars.length > 0;
      const hasDeliv = !!c.deliveries && (this._delivN > 0 || !hasCal);
      E.deliv.hidden = !hasDeliv;
      E.cal.hidden = !hasCal;
      E.body.hidden = !hasDeliv && !hasCal;
      // An empty week needs no column of its own: stack a compact line under the deliveries instead.
      const two = hasDeliv && hasCal && !this._calEmpty;
      E.head.classList.toggle('alone', E.body.hidden);
      const cls = `body lay-${c.layout} ${two ? 'two' : 'one'}${hasDeliv && hasCal && !two ? ' cal-under' : ''}`;
      if (E.body.className !== cls) E.body.className = cls;
    }

    _renderHead() {
      const c = this._config, E = this._el, states = this._hass.states || {};
      const hasTitle = c.title !== false;
      E.title.hidden = !hasTitle;
      E.sum.hidden = !hasTitle;
      E.title.textContent = hasTitle ? c.title : '';
      E.head.classList.toggle('no-title', !hasTitle);
      E.head.hidden = !hasTitle && !c.counts.length;

      // counts chips
      const chips = c.counts.map((x) => {
        const st = states[x.entity];
        const dead = !st || DEAD.has(String(st.state).toLowerCase());
        const n = st && isNum(st.state) ? Number(st.state) : null;
        const val = dead ? '—' : n !== null ? String(Math.round(n)) : String(st.state);
        const name = x.name || (st && st.attributes && st.attributes.friendly_name) || x.entity.split('.').pop().replace(/_/g, ' ');
        const b = h('button', {
          class: `cnt${n === 0 ? ' zero' : ''}${dead ? ' dead' : ''}`, 'aria-label': `${name}: ${val}`,
          style: x.color ? `--c:${x.color}` : null,
        }, [icon(x.icon), h('b', { text: val }), h('span', { text: name })]);
        b.addEventListener('click', () => this._moreInfo(x.entity));
        return b;
      });
      const sig = chips.map((b) => b.className + b.getAttribute('aria-label')).join('|');
      if (sig !== this._chipSig) { this._chipSig = sig; E.counts.replaceChildren(...chips); }
      E.counts.hidden = !chips.length;

      if (!hasTitle) return;
      // summary line
      const parts = [];
      const d = this._delivStats;
      if (d && c.deliveries) {
        if (d.today > 0) parts.push([String(d.today), ` ${plural(d.today, 'package')} today`]);
        else if (d.active > 0) parts.push([String(d.active), ' on the way']);
        if (d.alert > 0) parts.push([String(d.alert), ` ${plural(d.alert, 'problem')}`]);
      }
      const a = this._calStats;
      if (a && c.calendars.length) {
        if (a.today > 0) parts.push([String(a.today), ` ${plural(a.today, 'event')} today`]);
        else if (a.loaded) parts.push(['', a.endedToday ? 'Nothing else today' : 'Nothing today']);
        if (a.next) parts.push(['', `Next at ${a.next}`, true]);
      }
      const frag = [];
      parts.forEach(([b, t, opt], i) => {
        const span = h('span', { class: opt ? 'opt' : null }, [i ? h('span', { class: 'sep', text: '·' }) : null, b ? h('b', { text: b }) : null, t]);
        frag.push(span);
      });
      const ssig = parts.map((p) => p.join('')).join('|');
      if (ssig !== this._sumSig) { this._sumSig = ssig; E.sum.replaceChildren(...frag); }
    }

    /* ---------------- deliveries */

    _renderDeliv() {
      if (!this._built) return;
      const c = this._config, E = this._el;
      const now = this._now();
      if (!c.deliveries) { this._delivN = 0; this._delivStats = null; this._layoutClasses(); this._renderHead(); return; }
      const st = (this._hass.states || {})[c.deliveries.entity];
      const { items } = readDeliveries(st, c.deliveries, now);
      const active = items.filter((x) => x.s.kind !== 'delivered');
      this._delivStats = {
        active: active.length,
        today: active.filter((x) => x.s.kind === 'out' || x.s.days === 0).length,
        alert: active.filter((x) => x.s.tone === 'alert').length,
      };
      const isToday = (x) => x.s.kind === 'out' || x.s.days === 0 || (x.s.kind === 'delivered' && x.s.days === 0);
      const view = c.deliveries.view ? this._dview : 'all';
      const todays = items.filter(isToday);
      const list = view === 'today' ? todays : items;
      if (E.vsw) {
        for (const b of E.vsw.children) {
          const on = b.dataset.v === view;
          b.setAttribute('aria-pressed', String(on));
          b.lastChild.textContent = String(b.dataset.v === 'today' ? todays.length : items.length);
        }
      }
      this._delivN = items.length;
      this._lastDeliv = list.length;
      const shown = list.slice(0, c.deliveries.max);
      const loc = this._loc;
      const sig = JSON.stringify([shown.map((x) => [x.key, x.s, x.it.description, x.it.latest_event, x.it.carrier_code,
        this._expanded.has(x.key) ? x.it.events : 0]), items.length, list.length, view, dayKey(now), loc]);
      E.delivCount.textContent = String(active.length || items.length);
      E.delivCount.style.setProperty('--c', this._delivStats.alert ? 'var(--gh-alert)' : this._delivStats.today ? 'var(--gh-ok)' : 'var(--gh-text-2)');
      if (sig !== this._delivSig) {
        this._delivSig = sig;
        const anim = this._animDeliv && shown.length > 0;
        const rows = shown.map((x, i) => this._pkRow(x, now, anim ? i : -1));
        if (items.length && !list.length) {
          // Today view, nothing due today: say so, and offer the rest
          const more = h('button', { class: 'pk-more link', type: 'button', text: `${active.length} ${plural(active.length, 'package')} on the way · show all` });
          more.addEventListener('click', (e) => { e.stopPropagation(); this._dview = 'all'; this._delivSig = null; this._renderDeliv(); });
          rows.push(h('div', { class: 'calm' }, [
            h('span', { class: 'ci' }, [icon('mdi:package-variant-closed-check')]),
            h('span', null, [h('b', { text: 'Nothing arriving' }), ' today']),
          ]), more);
        }
        if (!items.length) {
          const dead = !st || DEAD.has(String(st.state).toLowerCase());
          rows.push(h('div', { class: `calm${dead && !st ? ' err' : ''}` }, [
            h('span', { class: 'ci' }, [icon(!st ? 'mdi:alert-circle-outline' : 'mdi:package-variant-closed-check')]),
            h('span', null, [h('b', { text: !st ? 'Deliveries unavailable' : 'No packages' }), !st ? '' : ' on the way']),
          ]));
        }
        if (list.length > shown.length) {
          const n = list.length - shown.length;
          rows.push(h('div', { class: 'pk-more' }, [`+${n} more ${plural(n, 'package')}${view === 'today' ? ' today' : ' on the way'}`]));
        } else if (view === 'today' && list.length && items.length > list.length) {
          const n = items.filter((x) => !isToday(x) && x.s.kind !== 'delivered').length;
          if (n) {
            const more = h('button', { class: 'pk-more link', type: 'button', text: `+${n} more on the way · show all` });
            more.addEventListener('click', (e) => { e.stopPropagation(); this._dview = 'all'; this._delivSig = null; this._renderDeliv(); });
            rows.push(more);
          }
        }
        E.plist.replaceChildren(...rows);
        if (anim) this._animDeliv = false;
      }
      this._layoutClasses();
      this._renderHead();
      this._fitCal();
    }

    _pkRow(x, now, animIdx) {
      const { it, s } = x;
      const loc = this._loc;
      const open = this._expanded.has(x.key);
      const tone = s.tone === 'out' ? 't-out' : s.tone === 'today' ? 't-today' : s.tone === 'alert' ? 't-alert'
        : s.tone === 'warn' ? 't-warn' : s.tone === 'done' ? 't-done' : 't-neutral';
      const desc = String(it.description || it.name || '').trim() || (carrierLabel(it.carrier_code) ? `${carrierLabel(it.carrier_code)} package` : 'Package');
      const carrier = carrierLabel(it.carrier_code);
      let label = s.label;
      if (s.kind === 'delivered' && s.deliveredAt) {
        const t = fmtTime(s.deliveredAt, loc);
        label = s.days === 0 ? (loc && loc.h12 === false ? t : t.replace(/:00(?=\s|$)/, ''))
          : s.days === -1 ? 'Yesterday' : s.days > -7 ? weekdayShort(s.deliveredAt, loc) : `${monthDay(s.deliveredAt, loc)}`;
      }
      if (s.expected && s.kind !== 'out') {
        const t = fmtTime(s.expected, loc);
        label = `Today · ${loc && loc.h12 === false ? t : t.replace(/:00(?=\s|$)/, '')}`;
      }
      let latest = String(it.latest_event || '').trim();
      if (!latest && Array.isArray(it.events) && it.events[0]) latest = String(it.events[0].event || '').trim();
      let metaText = latest || s.word;
      const ev0 = Array.isArray(it.events) && it.events[0] && typeof it.events[0] === 'object' ? it.events[0] : null;
      const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z]/g, '');
      if (norm(metaText) === norm(s.word) || norm(metaText) === norm(label)) {
        // The pill already says it: use where/when instead of repeating the status.
        const when = ev0 && parseExpected(ev0.date);
        const bits = [ev0 && ev0.location ? String(ev0.location) : '', when ? `since ${fmtTime(when.date, loc)}` : ''].filter(Boolean);
        if (bits.length) metaText = bits.join(' · ');
      }
      const meta = h('span', { class: 'm' }, [carrier ? h('b', { text: carrier }) : null, carrier ? ' · ' : null, metaText]);
      const steps = h('span', { class: 'steps', 'aria-hidden': 'true' }, [0, 1, 2, 3].map((k) =>
        h('i', { class: k < s.step ? 'on' : k === s.step ? 'cur' : null })));
      const main = h('button', {
        class: 'pk-main', 'aria-expanded': open ? 'true' : 'false',
        'aria-label': `${desc}, ${s.word}${carrier ? `, ${carrier}` : ''}, ${label}. ${STEP_NAMES[s.step]}.`,
      }, [
        this._chip(it, s),
        h('span', { class: 'tx' }, [h('span', { class: 't', text: desc }), meta]),
        h('span', { class: 'rt' }, [h('span', { class: 'st' }, [s.tone === 'out' ? h('i') : null, label]), steps]),
      ]);
      const row = h('div', { class: `pk ${tone}${open ? ' open' : ''}${animIdx >= 0 ? ' enter' : ''}`, style: animIdx > 0 ? `animation-delay:${animIdx * 45}ms` : null }, [main]);
      if (open) row.append(this._pkDetail(it, now));
      bindTap(main, () => {
        if (this._expanded.has(x.key)) this._expanded.delete(x.key); else this._expanded.add(x.key);
        this._delivSig = null;
        this._renderDeliv();
      }, () => this._moreInfo(this._config.deliveries.entity));
      return row;
    }

    _chip(it, s) {
      if (s.kind === 'delivered') return h('span', { class: 'chip done' }, [icon('mdi:check-bold')]);
      const url = carrierLogo(it.carrier_code, this._config.deliveries.logos, false);
      if (!url) return h('span', { class: 'chip' }, [icon(s.icon)]);
      const img = h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' });
      // a missing logo falls back to the status icon
      img.addEventListener('error', () => { const ch = img.parentNode; if (ch) { ch.classList.remove('logo'); ch.replaceChildren(icon(s.icon)); } }, { once: true });
      return h('span', { class: 'chip logo' }, [img]);
    }

    _pkDetail(it, now) {
      const loc = this._loc;
      const evs = (Array.isArray(it.events) ? it.events : []).filter((e) => e && typeof e === 'object');
      const shown = evs.slice(0, 6);
      const lis = shown.map((e) => {
        const where = [fmtEventWhen(e.date, now, loc), e.location ? String(e.location) : ''].filter(Boolean).join(' · ');
        return h('li', null, [h('div', { class: 'e', text: String(e.event || e.status || '—') }), where ? h('div', { class: 'w', text: where }) : null]);
      });
      const foot = [];
      if (evs.length > shown.length) foot.push(h('span', { text: `+${evs.length - shown.length} earlier` }));
      const l4 = last4(it.tracking_number);
      if (l4) foot.push(h('span', { text: `Tracking ···${l4}` }));
      const ex = parseExpected(it.date_expected);
      if (ex) foot.push(h('span', { text: `Expected ${fmtEventWhen(it.date_expected, now, loc)}` }));
      return h('div', { class: 'pk-detail' }, [
        lis.length ? h('ul', { class: 'tl' }, lis) : h('div', { class: 'tl w', text: 'No tracking events yet' }),
        foot.length ? h('div', { class: 'pk-foot' }, foot) : null,
      ]);
    }

    /* ---------------- calendar */

    _renderCal() {
      if (!this._built || !this._config || !this._hass) return;
      const c = this._config, E = this._el;
      if (!c.calendars.length) { this._calStats = null; this._lastEvents = 0; this._renderHead(); return; }
      const now = this._now();
      const loc = this._loc || localeOf(this._hass);
      const all = [];
      const failed = [];
      let loaded = 0;
      for (const cal of c.calendars) {
        const entry = this._cache.get(cal.entity);
        if (!entry) continue;
        loaded += 1;
        all.push(...entry.events);
        if (!entry.ok) failed.push(cal);
      }
      const agenda = buildAgenda(all, now, c.days, c.max_events, c.event_days);
      const today0 = startOfDay(now);
      const t0 = today0.getTime(), nowMs = now;
      const endedToday = all.some((e) => !e.allDay && e.start.getTime() >= t0 && e.start.getTime() < addDays(today0, 1).getTime() && e.end.getTime() <= nowMs);
      // Today always gets a row (when later days have events), saying it's clear or all done
      if (c.always_today && agenda.days.length && agenda.days[0].offset !== 0) {
        agenda.days.unshift({ date: today0, key: dayKey(today0), offset: 0, allDay: [], timed: [], more: 0, empty: endedToday ? 'done' : 'none' });
      }
      const lastDay = c.event_days && agenda.days.length ? agenda.days[agenda.days.length - 1].date : addDays(today0, c.days - 1);
      E.range.textContent = c.days === 1 ? 'Today' : `${monthDay(today0, loc)} – ${monthDay(lastDay, loc)}`;

      // stats for the header
      const tday = agenda.days.find((d) => d.offset === 0);
      let nextTxt = null;
      const allToday = buildAgenda(all, now, 1, 1000).days[0];
      const upcoming = allToday ? allToday.timed.filter((x) => x.ev.start.getTime() > now) : [];
      if (upcoming[0]) nextTxt = fmtTime(upcoming[0].ev.start, loc);
      this._calStats = { today: allToday ? allToday.allDay.length + allToday.timed.length : 0, next: nextTxt,
        loaded: loaded === c.calendars.length, endedToday };
      const wasEmpty = this._calEmpty;
      this._calEmpty = loaded > 0 && !agenda.days.length && failed.length < c.calendars.length;
      if (wasEmpty !== this._calEmpty) this._layoutClasses();
      this._lastEvents = agenda.days.reduce((n, d) => n + d.allDay.length + d.timed.length, 0);

      const minute = Math.floor(now / 60000);
      const sig = JSON.stringify([agenda.days.map((d) => [d.key, d.more, d.empty || 0, d.allDay.map((x) => [x.ev.key, x.part]), d.timed.map((x) => x.ev.key)]),
        agenda.hidden, failed.map((f) => f.entity), loaded, minute, loc]);
      if (sig !== this._calSig) {
        this._calSig = sig;
        const keepScroll = E.scroller.scrollTop;
        const anim = this._animCal && agenda.days.length > 0;
        const nodes = [];
        if (!loaded) {
          nodes.push(h('div', { class: 'skel', 'aria-hidden': 'true' }, [h('i'), h('i'), h('i')]));
        } else if (!agenda.days.length) {
          const allFailed = failed.length === c.calendars.length;
          const span = c.days === 7 ? 'this week' : c.days === 1 ? 'today' : `in the next ${c.days} days`;
          nodes.push(h('div', { class: `calm${allFailed ? ' err' : ''}` }, [
            h('span', { class: 'ci' }, [icon(allFailed ? 'mdi:calendar-alert' : 'mdi:calendar-check-outline')]),
            h('span', null, allFailed ? [h('b', { text: 'Calendar unavailable' }), ' · will retry'] : [h('b', { text: 'Nothing on the calendar' }), ` ${span}`]),
          ]));
        } else {
          let nextMarked = false;
          agenda.days.forEach((d, i) => {
            const dayEl = this._dayEl(d, now, loc, () => {
              if (nextMarked) return false;
              nextMarked = true;
              return true;
            });
            if (anim) { dayEl.classList.add('enter'); if (i) dayEl.style.animationDelay = `${Math.min(i, 8) * 40}ms`; }
            if (i === agenda.days.length - 1) dayEl.classList.add('last');
            nodes.push(dayEl);
          });
          if (agenda.hidden > 0) {
            nodes.push(h('div', { class: 'overflow' }, [`+${agenda.hidden} more ${plural(agenda.hidden, 'event')} through ${weekdayShort(agenda.hiddenUntil, loc)} ${agenda.hiddenUntil.getDate()}`]));
          }
          if (anim) this._animCal = false;
        }
        if (loaded && failed.length && (agenda.days.length || failed.length < c.calendars.length)) {
          const names = failed.map((f) => this._calName(f)).join(', ');
          nodes.push(h('div', { class: 'note', role: 'note' }, [icon('mdi:alert-circle-outline'), `${names} unavailable`]));
        }
        E.days.replaceChildren(...nodes);
        E.days.classList.toggle('multi', agenda.days.length > 1);
        E.scroller.scrollTop = keepScroll;
      }
      this._renderHead();
      this._fitCal();
    }

    _calName(cal) {
      const st = (this._hass.states || {})[cal.entity];
      return cal.name || (st && st.attributes && st.attributes.friendly_name) || cap(cal.entity.split('.').pop().replace(/_/g, ' '));
    }

    _dayEl(d, now, loc, claimNext) {
      const off = d.offset;
      const wd = off === 0 ? 'Today' : off === 1 ? 'Tmrw' : weekdayShort(d.date, loc);
      const full = off === 0 ? 'Today' : off === 1 ? 'Tomorrow' : `${weekdayShort(d.date, loc)} ${d.date.getDate()}`;
      const dcol = h('div', { class: 'dcol', 'aria-label': full }, [h('span', { class: 'wd', text: wd }), h('span', { class: 'dn', text: String(d.date.getDate()) })]);
      const devs = h('div', { class: 'devs' });
      if (d.allDay.length) {
        devs.append(h('div', { class: 'pills' }, d.allDay.map((x) => {
          const ev = x.ev;
          const p = h('button', { class: 'pill', style: `--c:${ev.cal.color}`, title: ev.summary,
            'aria-label': `${ev.summary}, all day${x.total > 1 ? `, day ${x.part} of ${x.total}` : ''}` }, [
            ev.cal.icon ? icon(ev.cal.icon) : h('i', { class: 'pd' }),
            h('span', { class: 'pt', text: ev.summary }),
            x.total > 1 ? h('span', { class: 'ps', text: `${x.part}/${x.total}` }) : null,
          ]);
          p.addEventListener('click', () => this._moreInfo(ev.cal.entity));
          return p;
        })));
      }
      if (d.empty) {
        devs.append(h('div', { class: `dnone ${d.empty}` }, [
          icon(d.empty === 'done' ? 'mdi:check-circle-outline' : 'mdi:calendar-blank-outline'),
          h('span', { text: d.empty === 'done' ? 'All done for today' : 'Nothing on today' }),
        ]));
      }
      for (const x of d.timed) devs.append(this._evRow(x, d, now, loc, claimNext));
      if (d.more > 0) devs.append(h('div', { class: 'dmore', text: `+${d.more} more` }));
      return h('div', { class: `day${off === 0 ? ' today' : ''}${off === 1 ? ' tmrw' : ''}` }, [dcol, devs]);
    }

    _evRow(x, d, now, loc, claimNext) {
      const ev = x.ev;
      const s = ev.start.getTime(), e = ev.end.getTime();
      const running = s <= now && e > now;
      let a, per = '', b, r;
      if (x.cont) {
        a = 'until'; b = fmtTime(ev.end, loc); r = `until ${b}`;
      } else {
        const rp = rangeParts(ev.start, ev.end, loc);
        const tp = timeParts(ev.start, loc);
        a = tp.main;
        per = rp.multi || !rp.b || rp.a !== tp.main ? tp.period : '';
        b = rp.b;
        r = fmtRange(ev.start, ev.end, loc);
      }
      const tail = [];
      let tag = null, isNext = false;
      if (running) {
        tag = e - s > 0 ? fmtLeft((e - now) / 60000) : 'Now';
      } else if (d.offset === 0 && s > now && (s - now) <= 6 * 3600e3 && claimNext()) {
        isNext = true;
        tag = cap(fmtIn((s - now) / 60000));
      }
      if (ev.cal.icon) tail.push(icon(ev.cal.icon));
      if (tag) tail.push(h('span', { class: 'tag', text: tag }));
      const meta = [ev.location, this._config.calendars.length > 1 && !ev.location ? this._calName(ev.cal) : ''].filter(Boolean)[0] || '';
      const row = h('button', {
        class: `ev${running ? ' now' : ''}${isNext ? ' next' : ''}`, style: `--c:${ev.cal.color}`,
        'aria-label': `${ev.summary}, ${r}${ev.location ? `, ${ev.location}` : ''}${running ? ', happening now' : ''}`,
      }, [
        h('span', { class: 'tm' }, [h('span', { class: 'a' }, [a, per ? h('small', { text: ` ${per}` }) : null]),
          b ? h('span', { class: 'b', text: b }) : null, h('span', { class: 'r', text: r })]),
        h('span', { class: 'bar' }),
        h('span', { class: 'tx' }, [h('span', { class: 't', text: ev.summary }), meta ? h('span', { class: 'm', text: meta }) : null]),
        tail.length ? h('span', { class: 'tail' }, tail) : h('span'),
      ]);
      if (running && e > s) {
        const pct = Math.max(0, Math.min(100, ((now - s) / (e - s)) * 100));
        row.append(h('span', { class: 'prog', 'aria-hidden': 'true' }, [h('i', { style: `width:${pct.toFixed(1)}%` })]));
      }
      row.addEventListener('click', () => this._moreInfo(ev.cal.entity));
      return row;
    }

    /* ---------------- split balancing */

    /** In split mode the calendar column needs only min(260 px, its content); the rest scrolls. */
    _fitCal() {
      const E = this._el;
      if (!E || !E.cal) return;
      try {
        const head = 28;
        const content = E.calInner.scrollHeight || 0;
        const min = content ? Math.min(CAL_MIN_PX, head + content) : CAL_MIN_PX;
        const v = `${Math.round(min)}px`;
        if (E.cal.style.getPropertyValue('--cal-min') !== v) E.cal.style.setProperty('--cal-min', v);
        this._updateFade();
      } catch (e) { /* layout not available */ }
    }

    _updateFade() {
      const sc = this._el && this._el.scroller;
      if (!sc) return;
      const more = sc.scrollHeight - sc.clientHeight - sc.scrollTop > 6 && getComputedStyle(sc).overflowY === 'auto';
      if (sc.classList.contains('more') !== more) sc.classList.toggle('more', more);
    }

    _moreInfo(entityId) {
      if (!entityId) return;
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
    }
  }

  GlasshouseAgendaCard.helpers = {
    parseLoose,
    VERSION, normConfig, colorOf, startOfDay, addDays, dayKey, dayDiff, parseLocalDate, parseExpected, normEvent, buildAgenda,
    carrierLabel, deliveryStatus, deliveryDays, readDeliveries, last4, fmtRange, fmtTime, localeOf, fmtIn,
  };

  if (!customElements.get(TAG)) {
    customElements.define(TAG, GlasshouseAgendaCard);
    window.customCards = window.customCards || [];
    window.customCards.push({
      type: TAG,
      name: 'Glasshouse Agenda Card',
      description: "What's coming: today's deliveries and the week ahead from your calendars, in one dense card.",
      preview: true,
      documentationURL: 'https://github.com/petergCA/glasshouse-agenda-card',
    });
    // eslint-disable-next-line no-console
    console.info(
      `%c GLASSHOUSE-AGENDA-CARD %c v${VERSION} `,
      'color:#0a0f18;background:#58a6ff;font-weight:700;border-radius:4px 0 0 4px;padding:2px 4px',
      'color:#e9eef6;background:#1b2333;font-weight:600;border-radius:0 4px 4px 0;padding:2px 4px',
    );
  }
})();
