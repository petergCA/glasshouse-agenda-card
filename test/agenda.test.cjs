/* Tests for glasshouse-agenda-card, run with node + jsdom (not a repo dependency):
 *   mkdir /tmp/ghtest && cd /tmp/ghtest && npm i jsdom
 *   node /path/to/repo/test/agenda.test.cjs
 * Run it under a few time zones to check the date math, e.g.
 *   for z in UTC America/Los_Angeles Pacific/Auckland Asia/Kolkata; do TZ=$z node …/agenda.test.cjs; done
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(require.resolve('jsdom', { paths: [process.cwd(), __dirname] }));

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN = 60000;

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed += 1; console.log('  ✓', msg); }
  else { failed += 1; console.log('  ✗', msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)})`); }
function throws(fn, re, msg) {
  try { fn(); ok(false, `${msg} (did not throw)`); } catch (e) { ok(re.test(e.message), `${msg} (${e.message})`); }
}

function makeWindow() {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.eval(`
    customElements.define('ha-card', class extends HTMLElement {});
    customElements.define('ha-icon', class extends HTMLElement {});
  `);
  w.console.info = () => {};
  w.eval(read('test/mock-hass.js'));
  w.eval(read('glasshouse-agenda-card.js'));
  return w;
}

/** Today at hh:mm local, as the card's clock. */
function todayAt(w, hh, mm) {
  const d = new w.Date();
  d.setHours(hh, mm || 0, 0, 0);
  return d.getTime();
}

async function setup(mockOpts, configPatch, clock) {
  const w = makeWindow();
  const mock = w.GHAgendaMock.createHass({ delay: 1, ...(mockOpts || {}) });
  const card = w.document.createElement('glasshouse-agenda-card');
  const now = clock || todayAt(w, 15, 10);
  card._now = () => now;
  const cfg = { ...w.GHAgendaMock.demoConfig(), ...(configPatch || {}) };
  for (const k of Object.keys(cfg)) if (cfg[k] === undefined) delete cfg[k];
  card.setConfig(cfg);
  w.document.body.append(card);
  mock.subscribe((hass) => { card.hass = hass; });
  await sleep(30);
  const events = [];
  card.addEventListener('hass-more-info', (e) => events.push(e.detail.entityId));
  const $ = (sel) => card.shadowRoot.querySelector(sel);
  const $$ = (sel) => [...card.shadowRoot.querySelectorAll(sel)];
  return { w, mock, card, events, $, $$, now };
}

(async () => {
  const w0 = makeWindow();
  const H = w0.customElements.get('glasshouse-agenda-card').helpers;
  const D = (y, m, d, hh, mm) => new w0.Date(y, m - 1, d, hh || 0, mm || 0);
  const loc12 = { lang: 'en-US', h12: true };
  const loc24 = { lang: 'en-US', h12: false };
  console.log(`TZ=${process.env.TZ || '(system)'}  offset=${new Date().getTimezoneOffset()}`);

  console.log('config');
  {
    const c = H.normConfig({ calendars: ['calendar.a', { entity: 'calendar.b', color: 'ok', icon: 'mdi:x' }] });
    eq([c.title, c.days, c.max_events, c.layout], ['Coming up', 7, 14, 'auto'], 'defaults');
    eq(c.calendars.map((x) => x.color), ['var(--gh-info)', 'var(--gh-ok)'], 'accent names and palette default');
    eq(H.normConfig({ title: false, calendars: ['calendar.a'] }).title, false, 'title false hides header');
    eq(H.normConfig({ calendars: ['calendar.a'], days: 99, max_events: 0 }).days, 31, 'days clamped');
    eq(H.colorOf('#ff00aa'), '#ff00aa', 'CSS colour passes through');
    ok(!/;/.test(H.colorOf('red; background:url(x)')), 'unsafe colour rejected');
    eq(H.normConfig({ deliveries: 'sensor.p' }).deliveries, { entity: 'sensor.p', attribute: 'deliveries', show_delivered: false, max: 4, name: 'Deliveries', view: null, logos: null }, 'deliveries shorthand + defaults');
    throws(() => H.normConfig({}), /at least one/, 'empty config');
    throws(() => H.normConfig({ calendars: ['sensor.x'] }), /calendars item 1/, 'non-calendar entity');
    throws(() => H.normConfig({ calendars: ['calendar.a'], layout: 'grid' }), /layout/, 'bad layout');
    throws(() => H.normConfig({ deliveries: { attribute: 'x' } }), /deliveries/, 'deliveries without entity');
    const gw = makeWindow();
    const el = gw.document.createElement('glasshouse-agenda-card');
    eq(el.getGridOptions(), { columns: 12, min_columns: 6, rows: 'auto' }, 'getGridOptions');
  }

  console.log('timezone-safe date math');
  {
    eq(H.dayKey(H.parseLocalDate('2026-03-08')), '2026-03-08', 'all-day date stays on its day (no UTC shift)');
    eq(H.parseLocalDate('2026-02-30'), null, 'invalid date rejected');
    const dst1 = H.addDays(D(2026, 3, 7), 1);
    eq([H.dayKey(dst1), dst1.getHours()], ['2026-03-08', 0], 'addDays across US spring-forward lands on midnight');
    const dst2 = H.addDays(D(2026, 10, 31), 2);
    eq([H.dayKey(dst2), dst2.getHours()], ['2026-11-02', 0], 'addDays across US fall-back lands on midnight');
    eq(H.dayDiff(D(2026, 3, 9, 0, 30), D(2026, 3, 8, 23, 50)), 1, 'dayDiff counts calendar days');
    eq(H.dayDiff(D(2026, 4, 6), D(2026, 4, 4)), 2, 'dayDiff across southern DST change');
    const ex = H.parseExpected('2026-03-14 18:30:00');
    eq([H.dayKey(ex.date), ex.date.getHours(), ex.hasTime], ['2026-03-14', 18, true], 'parcel date is local wall time');
    eq(H.parseExpected('2026-03-14 00:00:00').hasTime, false, 'midnight = date only');
    eq(H.parseExpected('unknown'), null, 'unknown expected date');
  }

  console.log('events');
  {
    const cal = { entity: 'calendar.a', color: 'x', idx: 0 };
    const ad = H.normEvent({ summary: 'Trip', start: { date: '2026-03-14' }, end: { date: '2026-03-16' } }, cal);
    eq([ad.allDay, H.dayKey(ad.start), H.dayKey(ad.end)], [true, '2026-03-14', '2026-03-16'], 'all-day event parsed as local dates');
    const ad2 = H.normEvent({ summary: 'X', start: { date: '2026-03-14' } }, cal);
    eq(H.dayKey(ad2.end), '2026-03-15', 'all-day without end lasts one day');
    const tm = H.normEvent({ summary: 'Y', start: { dateTime: '2026-03-14T16:30:00Z' }, end: { dateTime: '2026-03-14T17:30:00Z' } }, cal);
    eq([tm.allDay, tm.end - tm.start], [false, 3600000], 'timed event with zone');
    eq(H.normEvent({ start: { dateTime: 'nope' } }, cal), null, 'bad start dropped');
    eq(H.normEvent({ start: { date: '2026-03-14' } }, cal).summary, 'Busy', 'missing summary → Busy');

    const now = D(2026, 3, 14, 15, 10).getTime();
    const ev = (summary, s, e, allDay) => H.normEvent(allDay ? { summary, start: { date: s }, end: { date: e } }
      : { summary, start: { dateTime: s.toISOString() }, end: { dateTime: e.toISOString() } }, cal);
    const list = [
      ev('Past', D(2026, 3, 14, 9), D(2026, 3, 14, 10)),
      ev('Running', D(2026, 3, 14, 14, 30), D(2026, 3, 14, 15, 30)),
      ev('Later', D(2026, 3, 14, 18), D(2026, 3, 14, 19)),
      ev('Earlier', D(2026, 3, 14, 16), D(2026, 3, 14, 17)),
      ev('Overnight', D(2026, 3, 13, 22), D(2026, 3, 14, 16)),
      ev('Holiday', '2026-03-14', '2026-03-15', true),
      ev('Trip', '2026-03-15', '2026-03-18', true),
      ev('Dentist', D(2026, 3, 16, 10), D(2026, 3, 16, 11)),
      ev('Far', D(2026, 3, 25, 10), D(2026, 3, 25, 11)),
    ];
    list.push(list[2]); // duplicate is ignored
    const ag = H.buildAgenda(list, now, 7, 50);
    eq(ag.days.map((d) => d.key), ['2026-03-14', '2026-03-15', '2026-03-16', '2026-03-17'], 'grouped by local day; empty days and out-of-range skipped');
    const t = ag.days[0];
    eq(t.allDay.map((x) => x.ev.summary), ['Holiday'], 'all-day separated');
    eq(t.timed.map((x) => x.ev.summary), ['Overnight', 'Running', 'Earlier', 'Later'], 'ended dropped, sorted by start, ongoing-from-yesterday kept');
    ok(t.timed[0].cont === true, 'overnight event marked as continuing');
    eq(ag.days[1].allDay.map((x) => [x.ev.summary, x.part, x.total]), [['Trip', 1, 3]], 'multi-day all-day: part 1/3');
    eq(ag.days[3].allDay.map((x) => [x.part, x.total]), [[3, 3]], 'multi-day all-day: part 3/3');
    const capped = H.buildAgenda(list, now, 7, 4);
    eq(capped.days.map((d) => [d.key, d.allDay.length + d.timed.length, d.more]), [['2026-03-14', 4, 1]], 'cap: budget fills today, +1 more');
    eq([capped.hidden, H.dayKey(capped.hiddenUntil)], [4, '2026-03-17'], 'cap: hidden days counted');
    eq(H.buildAgenda([], now, 7, 14).days, [], 'empty range');
  }

  console.log('time formatting');
  {
    const s = D(2026, 3, 14, 16, 30), e = D(2026, 3, 14, 17, 30);
    eq(H.fmtRange(s, e, loc12), '4:30 – 5:30 PM', '12-h shared period');
    eq(H.fmtRange(D(2026, 3, 14, 11), D(2026, 3, 14, 13), loc12), '11:00 AM – 1:00 PM', '12-h across noon');
    eq(H.fmtRange(s, e, loc24), '16:30 – 17:30', '24-h');
    eq(H.fmtRange(D(2026, 3, 14, 21), D(2026, 3, 15, 0), loc12), '9:00 PM – 12:00 AM', 'ends at midnight');
    ok(/^9:00 PM → /.test(H.fmtRange(D(2026, 3, 14, 21), D(2026, 3, 15, 2), loc12)), 'overnight → next day');
    eq(H.localeOf({ locale: { language: 'en-GB', time_format: 'language' } }).h12, false, 'en-GB language → 24 h');
    eq(H.localeOf({ locale: { language: 'en-US', time_format: 'language' } }).h12, true, 'en-US language → 12 h');
    eq(H.localeOf({ locale: { language: 'en-GB', time_format: '12' } }).h12, true, 'explicit 12');
    eq(H.fmtIn(25), 'in 25 min', 'fmtIn minutes');
    eq(H.fmtIn(80), 'in 1h 20m', 'fmtIn hours');
  }

  console.log('deliveries');
  {
    eq(['amzlus', 'AMAZON', 'ups', 'fedex', 'usps', 'dhl', 'pnl', ''].map(H.carrierLabel),
      ['Amazon', 'Amazon', 'UPS', 'FedEx', 'USPS', 'DHL', 'PNL', ''], 'carrier labels');
    const now = D(2026, 3, 14, 12).getTime();
    const st = (o) => H.deliveryStatus(o, now);
    eq([st({ status_code: 4 }).kind, st({ status_code: 4 }).label, st({ status_code: 4 }).tone], ['out', 'Out for delivery', 'out'], 'out for delivery');
    eq([st({ status_code: 2, days_to_delivery: 0 }).label, st({ status_code: 2, days_to_delivery: 0 }).tone], ['Today', 'today'], 'today');
    eq(st({ status_code: 2, days_to_delivery: 1 }).label, 'Tomorrow', 'tomorrow');
    eq(st({ status_code: 2, days_to_delivery: 5 }).label, 'in 5 d', 'in 5 d');
    eq(st({ status_code: 2, date_expected: '2026-03-16 00:00:00' }).label, 'in 2 d', 'days from date_expected when days_to_delivery missing');
    eq([st({ status_code: 2, days_to_delivery: -1 }).label, st({ status_code: 2, days_to_delivery: -1 }).tone], ['Late', 'warn'], 'late');
    eq([st({ status_code: 7 }).tone, st({ status_code: 6 }).tone, st({ status_code: 6 }).label], ['alert', 'alert', 'Failed attempt'], 'exception / failed = alert');
    eq([st({ status_code: 3 }).label, st({ status_code: 8 }).step, st({ status_code: 0 }).step], ['Ready for pickup', 0, 3], 'pickup, info step 0, delivered step 3');
    eq(st({ status_code: 2, delivered: true }).kind, 'delivered', 'delivered flag wins');
    eq(st({}).label, 'In transit', 'empty item is forgiving');
    eq(st({ status_code: 2, days_to_delivery: 0, date_expected: '2026-03-14 20:00:00' }).expected.getHours(), 20, 'expected time today');
    eq(H.last4('1Z999AA10123456784'), '6784', 'last 4 only');

    const list = [
      { description: 'C', status_code: 2, days_to_delivery: 3 },
      { description: 'Done', status_code: 0, delivered: true },
      { description: 'A', status_code: 2, days_to_delivery: 0 },
      { description: 'Out', status_code: 4, days_to_delivery: 0 },
      { description: 'Unknown', status_code: 8 },
      { description: 'Ex', status_code: 7, days_to_delivery: 3 },
      null, 'junk',
    ];
    const cfg = { attribute: 'deliveries', show_delivered: false };
    const r = H.readDeliveries({ state: '5', attributes: { deliveries: list } }, cfg, now);
    eq(r.items.map((x) => x.it.description), ['Out', 'A', 'Ex', 'C', 'Unknown'], 'sorted: out first, then days (alerts before ties), unknown last; delivered hidden');
    const r2 = H.readDeliveries({ state: '5', attributes: { deliveries: list } }, { ...cfg, show_delivered: true }, now);
    eq(r2.items[r2.items.length - 1].it.description, 'Done', 'show_delivered puts delivered last');
    eq(H.readDeliveries({ state: 'unavailable', attributes: {} }, cfg, now).items, [], 'missing attribute → empty');
    eq(H.readDeliveries({ state: '1', attributes: { pk: { a: { description: 'Obj', status_code: 4 } } } }, { ...cfg, attribute: 'pk' }, now).items.length, 1, 'object map accepted');
  }

  console.log('card: full render');
  {
    const { card, $, $$, mock, events } = await setup();
    eq(mock.apiCalls.length, 4, 'one API call per calendar');
    ok(/^calendars\/calendar\.family\?start=.+&end=.+/.test(mock.apiCalls[0].path), 'API path shape');
    const q = new URLSearchParams(mock.apiCalls[0].path.split('?')[1]);
    eq(Math.round((Date.parse(q.get('end')) - Date.parse(q.get('start'))) / 864e5), 7, 'range = days');
    ok($$('.day').length >= 4, `day groups rendered (${$$('.day').length})`);
    ok($('.day.today .wd').textContent === 'Today', 'today label');
    ok($('.ev.now .prog i') && /width:\s*\d/.test($('.ev.now .prog i').getAttribute('style')), 'running event has progress line');
    ok($('.ev.now').textContent.includes('Design review'), 'running event is the 2:30 design review');
    ok(!card.shadowRoot.textContent.includes('Team standup'), 'ended events hidden');
    ok($('.ev.next .tag') && /^In 1h 20m$/.test($('.ev.next .tag').textContent), `next event countdown (${$('.ev.next .tag') && $('.ev.next .tag').textContent})`);
    ok($('.pills .pill').textContent.includes('Recycling'), 'all-day pill first');
    eq($$('.pk').length, 5, 'deliveries capped at max');
    ok($('.pk-more').textContent.includes('+1 more'), '+N more packages');
    ok($$('.pk')[0].classList.contains('t-out'), 'out-for-delivery first');
    ok($$('.pk')[3].classList.contains('t-alert'), 'exception is alert');
    ok(!/TEST0000000000\d{4}/.test(card.shadowRoot.innerHTML), 'no full tracking numbers in the DOM');
    ok($('.body').classList.contains('two'), 'two sections → two-column capable layout');
    eq($$('.cnt').map((b) => b.textContent), ['1Amazon', '3Mail'], 'count chips');
    ok(/2 packages today/.test($('.summary').textContent), `summary (${$('.summary').textContent})`);
    ok($('.dmore') || $('.overflow'), 'cap shows +N more');

    // expand / collapse a delivery
    $('.pk-main').click();
    ok($('.pk.open .tl li') && $$('.pk.open .tl li').length === 3, 'tap expands the events timeline');
    ok(/Tracking ···5678/.test($('.pk.open .pk-foot').textContent), 'last 4 of tracking in detail');
    $('.pk.open .pk-main').click();
    ok(!$('.pk.open'), 'second tap collapses');
    // hold → more-info
    const main = $('.pk-main');
    main.dispatchEvent(new card.ownerDocument.defaultView.Event('pointerdown'));
    await sleep(560);
    main.dispatchEvent(new card.ownerDocument.defaultView.Event('pointerup'));
    main.click();
    eq(events, ['sensor.parcel_deliveries'], 'hold opens more-info, click after hold ignored');
    ok(!$('.pk.open'), 'hold did not expand');
    $('.ev').click();
    eq(events[1], 'calendar.work', 'event tap opens its calendar');
    ok(card.getCardSize() > 3, 'getCardSize');
  }

  console.log('card: refresh and reconnect');
  {
    const ctx = await setup();
    const n0 = ctx.mock.apiCalls.length;
    const t = ctx.now;
    ctx.card._now = () => t + 5 * MIN;
    ctx.card._onTick();
    eq(ctx.mock.apiCalls.length, n0, 'no refetch before 15 min');
    ctx.card._now = () => t + 16 * MIN;
    ctx.card._onTick();
    eq(ctx.mock.apiCalls.length, n0 + 4, 'refetch after 15 min');
    await sleep(20);
    ctx.card._now = () => t + 19 * MIN;
    ctx.card.remove();
    ctx.w.document.body.append(ctx.card);
    eq(ctx.mock.apiCalls.length, n0 + 8, 'refetch on reconnect when stale');
    await sleep(20);
    ok(ctx.$$('.day').length >= 4, 'still rendered after reconnect');
  }

  console.log('card: partial failure');
  {
    const { $, $$, card } = await setup({ fail: ['calendar.work'] });
    ok(card.shadowRoot.textContent.includes('Soccer practice'), 'other calendars still render');
    ok(!card.shadowRoot.textContent.includes('Design review'), 'failed calendar events absent');
    ok($('.note') && /Work unavailable/.test($('.note').textContent), 'note names the failed calendar');
    ok($$('.day').length >= 3, 'days rendered');
  }
  {
    const { $, card } = await setup({ fail: ['calendar.family', 'calendar.work', 'calendar.garbage_collection', 'calendar.holidays'] });
    ok($('.calm.err') && /Calendar unavailable/.test($('.calm.err').textContent), 'all failing → calm error line');
    ok(card.shadowRoot.querySelectorAll('.pk').length === 5, 'deliveries unaffected');
  }
  {
    const w = makeWindow();
    const card = w.document.createElement('glasshouse-agenda-card');
    card.setConfig({ calendars: ['calendar.a', 'calendar.b'] });
    w.document.body.append(card);
    let threw = false;
    try {
      card.hass = { states: {}, callApi(m, p) { if (p.includes('calendar.a')) throw new Error('boom'); return Promise.resolve([{ summary: 'Fine', start: { date: H.dayKey(new w.Date()) } }]); } };
      await sleep(20);
      card.hass = { states: {} }; // no callApi at all
      await sleep(10);
    } catch (e) { threw = true; }
    ok(!threw, 'sync throw / missing callApi never throws');
    ok(card.shadowRoot.textContent.includes('Fine'), 'healthy calendar renders beside a throwing one');
  }

  console.log('card: variants');
  {
    const { $ } = await setup({ scenario: 'nodeliveries' }, { deliveries: undefined });
    ok($('.body').classList.contains('one') && $('.deliv').hidden, 'no deliveries → calendar full width');
  }
  {
    const { $, card } = await setup({ scenario: 'empty' });
    ok($('.calm') && /Nothing on the calendar/.test($('.calm').textContent) && /this week/.test($('.calm').textContent), 'empty week line');
    ok($('.body').classList.contains('cal-under'), 'empty week stacks under deliveries (no blank column)');
    ok(card.shadowRoot.querySelectorAll('.pk').length === 5, 'deliveries still shown');
  }
  {
    const { $, card } = await setup({ scenario: 'quiet' });
    ok($('.deliv').hidden, 'empty delivery list hidden when calendars exist');
    ok(/Nothing today/.test($('.summary').textContent), `quiet summary (${$('.summary').textContent})`);
    ok(!card.shadowRoot.querySelector('.pk'), 'no delivery rows');
  }
  {
    const { $, $$ } = await setup({}, { calendars: undefined, title: false });
    ok($('.cal').hidden && !$('.deliv').hidden, 'deliveries-only card');
    ok($('.title').hidden && !$('.head').hidden, 'title hidden, counts strip kept');
    ok($$('.cnt').length === 2, 'counts present');
  }
  {
    const { $$ } = await setup({ time_format: '24' });
    ok($$('.ev .tm .r').some((r) => /^16:30 – 17:30$/.test(r.textContent)), '24-h ranges from hass.locale');
  }
  {
    const { $, mock, card } = await setup();
    mock.setAttr('sensor.parcel_deliveries', { deliveries: 'garbage' });
    ok(!$('.pk') && $('.deliv').hidden, 'malformed delivery attribute is tolerated');
    mock.setState('sensor.mail_usps_mail', 'unavailable');
    ok($$q(card, '.cnt.dead').length === 1, 'unavailable count chip dimmed');
  }

  console.log('card: deliveries view switch + carrier logos');
  {
    const base = (await setup()).w.GHAgendaMock.demoConfig().deliveries;
    const dcfg = { ...(typeof base === 'string' ? { entity: base } : base), default_view: 'today', carrier_icons: 'parcelapp', max: 8 };
    const { $, $$ } = await setup({}, { deliveries: dcfg });
    const names = () => $$('.pk .tx .t').map((x) => x.textContent);
    ok(!!$('.vsw'), 'switch shown when default_view is set');
    eq($('.vsw .vs[aria-pressed="true"]').dataset.v, 'today', 'defaults to today');
    eq(names().sort(), ['Running shoes', 'Wireless earbuds and a charging case'], 'today view lists only today');
    const ups = $$('.pk').find((r) => r.textContent.includes('Running shoes'));
    eq(ups.querySelector('.chip.logo img').getAttribute('src'), '/parcelapp/images/ups.png', 'UPS logo from ParcelApp');
    const amz = $$('.pk').find((r) => r.textContent.includes('earbuds'));
    eq(amz.querySelector('.chip.logo img').getAttribute('src'), '/parcelapp/images/amazon_orange_v3.png', 'Amazon logo');
    ok(!!$('button.pk-more.link'), 'link to the rest');
    $('.vsw .vs[data-v="all"]').click();
    await sleep(20);
    eq($('.vsw .vs[aria-pressed="true"]').dataset.v, 'all', 'switch to all');
    ok(names().includes('Vitamins') && names().includes('Phone case'), 'all view lists every package');
    const dhl = $$('.pk').find((r) => r.textContent.includes('Phone case'));
    eq(dhl.querySelector('.chip.logo img').getAttribute('src'), '/parcelapp/images/package.png', 'unknown carrier gets the generic box');
  }
  {
    const { $ } = await setup();
    ok(!$('.vsw'), 'no switch without default_view');
    ok(!$('.chip.logo'), 'no logos without carrier_icons');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

function $$q(card, sel) { return [...card.shadowRoot.querySelectorAll(sel)]; }
