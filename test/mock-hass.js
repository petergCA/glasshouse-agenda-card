/* Mock Home Assistant `hass` for the Glasshouse Agenda card harness and node tests.
 * Generic demo data only. Everything is relative to "now" (local time) when the mock is created.
 * - callApi('GET', 'calendars/<entity>?start=…&end=…') serves the demo events that overlap the range,
 *   after a short delay, like HA's REST calendar API. Calendars in `fail` reject.
 * - A parcel-style delivery sensor and two count sensors.
 * Scenarios: full (default) | nodeliveries | empty (no calendar events) | quiet (nothing at all) | fail */
(function (root) {
  'use strict';

  const MIN = 60000;
  const pad = (n) => String(n).padStart(2, '0');

  function localIso(d) {
    const off = -d.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const a = Math.abs(off);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
  }
  function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function day(offset) { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate() + offset); }
  function at(offset, hh, mm) { const d = day(offset); d.setHours(hh, mm || 0, 0, 0); return d; }
  function parcelDate(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  }

  /** Demo events per calendar. timed(offset, h, m, durMin, summary, location?) / allDay(offset, days, summary) */
  function demoEvents() {
    const timed = (o, hh, mm, dur, summary, location) => ({
      summary, location, start: { dateTime: localIso(at(o, hh, mm)) }, end: { dateTime: localIso(new Date(at(o, hh, mm).getTime() + dur * MIN)) },
    });
    const allDay = (o, n, summary) => ({ summary, start: { date: ymd(day(o)) }, end: { date: ymd(day(o + n)) } });
    return {
      'calendar.family': [
        timed(0, 8, 0, 30, 'School drop-off'),
        timed(0, 16, 30, 60, 'Soccer practice', 'Riverside Park'),
        timed(0, 19, 0, 120, 'Dinner with friends', 'Harbor Grill'),
        timed(1, 10, 0, 45, 'Dentist', 'Main St Dental'),
        timed(1, 19, 0, 90, 'Book club'),
        timed(2, 7, 30, 60, 'Yoga'),
        allDay(4, 2, 'Ski trip'),
        timed(4, 9, 0, 120, 'Farmers market', 'Town Square'),
        timed(5, 11, 0, 60, 'Brunch'),
        timed(6, 15, 0, 60, 'Piano recital', 'Community Hall'),
        timed(6, 18, 30, 60, 'Movie night'),
      ],
      'calendar.work': [
        timed(0, 9, 0, 15, 'Team standup'),
        timed(0, 14, 30, 60, 'Design review', 'Room 4B'),
        timed(1, 13, 0, 90, 'Quarterly planning'),
        timed(2, 11, 0, 30, '1:1 check-in'),
        timed(3, 10, 0, 60, 'Customer demo'),
        timed(6, 9, 0, 30, 'Sprint kickoff'),
      ],
      'calendar.garbage_collection': [
        allDay(0, 1, 'Recycling'),
        allDay(3, 1, 'Garbage'),
        allDay(3, 1, 'Yard waste'),
      ],
      'calendar.holidays': [
        allDay(2, 1, 'Library closed'),
      ],
    };
  }

  function demoDeliveries(scenario) {
    if (scenario === 'quiet') return [];
    const ev = (agoMin, event, location) => ({ event, date: parcelDate(new Date(Date.now() - agoMin * MIN)), location });
    return [
      { tracking_number: 'TEST00000000001234', carrier_code: 'ups', description: 'Running shoes', status_code: 2,
        date_expected: parcelDate(at(0, 20, 0)), days_to_delivery: 0, latest_event: 'Arrived at local facility', delivered: false,
        events: [ev(95, 'Arrived at local facility', 'Springfield'), ev(60 * 14, 'Departed facility', 'Hub City'), ev(60 * 30, 'Shipment picked up', 'Hub City'), ev(60 * 40, 'Label created')] },
      { tracking_number: 'TEST00000000005678', carrier_code: 'amzlus', description: 'Wireless earbuds and a charging case', status_code: 4,
        date_expected: parcelDate(at(0, 0, 0)), days_to_delivery: 0, latest_event: 'Out for delivery', delivered: false,
        events: [ev(140, 'Out for delivery', 'Springfield'), ev(60 * 9, 'Arrived at delivery station', 'Springfield'), ev(60 * 26, 'Shipped')] },
      { tracking_number: 'TEST00000000009012', carrier_code: 'usps', description: 'Vitamins', status_code: 2,
        date_expected: parcelDate(at(1, 0, 0)), days_to_delivery: 1, latest_event: 'In transit to next facility', delivered: false,
        events: [ev(60 * 5, 'In transit to next facility'), ev(60 * 22, 'Accepted at origin', 'Lakeside')] },
      { tracking_number: 'TEST00000000003456', carrier_code: 'fedex', description: 'Camera tripod', status_code: 7,
        date_expected: parcelDate(at(2, 0, 0)), days_to_delivery: 2, latest_event: 'Delivery exception: address issue', delivered: false,
        events: [ev(60 * 3, 'Delivery exception: address issue', 'Hub City'), ev(60 * 20, 'At local facility', 'Hub City')] },
      { tracking_number: 'TEST00000000007890', carrier_code: 'dhl', description: 'Phone case', status_code: 2,
        date_expected: parcelDate(at(5, 0, 0)), days_to_delivery: 5, latest_event: 'Processed at export hub', delivered: false,
        events: [ev(60 * 30, 'Processed at export hub')] },
      { tracking_number: 'TEST00000000002468', carrier_code: 'ontrac', description: 'Desk lamp', status_code: 8,
        date_expected: null, latest_event: 'Shipping label created', delivered: false, events: [] },
      { tracking_number: 'TEST00000000001357', carrier_code: 'ups', description: 'Coffee beans', status_code: 0,
        date_expected: parcelDate(at(0, 0, 0)), days_to_delivery: 0, latest_event: 'Delivered, front door', delivered: true, events: [] },
    ];
  }

  function s(entity_id, state, attributes) {
    const t = new Date(Date.now() - 5 * MIN).toISOString();
    return { entity_id, state: String(state), attributes: attributes || {}, last_changed: t, last_updated: t, context: { id: 'x' } };
  }

  function createHass(opts) {
    const o = opts || {};
    const scenario = o.scenario || 'full';
    const events = scenario === 'empty' || scenario === 'quiet' ? {} : demoEvents();
    const fail = new Set(o.fail || (scenario === 'fail' ? ['calendar.work'] : []));
    const deliveries = scenario === 'nodeliveries' ? [] : demoDeliveries(scenario);
    const active = deliveries.filter((d) => !d.delivered).length;
    const states = {};
    const add = (st) => { states[st.entity_id] = st; };
    add(s('calendar.family', 'off', { friendly_name: 'Family' }));
    add(s('calendar.work', 'on', { friendly_name: 'Work' }));
    add(s('calendar.garbage_collection', 'off', { friendly_name: 'Garbage collection' }));
    add(s('calendar.holidays', 'off', { friendly_name: 'Holidays' }));
    add(s('sensor.parcel_deliveries', active, { friendly_name: 'Deliveries', deliveries }));
    add(s('sensor.amazon_deliveries_today', scenario === 'nodeliveries' || scenario === 'quiet' ? 0 : 1, { friendly_name: 'Amazon today' }));
    add(s('sensor.mail_usps_mail', scenario === 'quiet' ? 0 : 3, { friendly_name: 'USPS mail' }));

    const subs = [];
    const apiCalls = [];
    const hass = {
      states,
      locale: { language: o.language || 'en-US', time_format: o.time_format || 'language' },
      language: o.language || 'en-US',
      callService(domain, service, data) { return Promise.resolve({ domain, service, data }); },
      callApi(method, path) {
        apiCalls.push({ method, path });
        const m = /^calendars\/([\w.]+)\?(.*)$/.exec(path);
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            if (!m) return reject(new Error('bad path'));
            if (fail.has(m[1])) return reject({ status_code: 500, body: 'Error fetching events' });
            const q = new URLSearchParams(m[2]);
            const a = Date.parse(q.get('start')), b = Date.parse(q.get('end'));
            const list = (events[m[1]] || []).filter((e) => {
              const es = e.start.dateTime ? Date.parse(e.start.dateTime) : new Date(e.start.date + 'T00:00:00').getTime();
              const ee = e.end.dateTime ? Date.parse(e.end.dateTime) : new Date(e.end.date + 'T00:00:00').getTime();
              return es < b && ee > a;
            });
            resolve(JSON.parse(JSON.stringify(list)));
          }, o.delay === undefined ? 15 : o.delay);
        });
      },
    };
    function publish() {
      const next = { ...hass, states: { ...states } };
      subs.forEach((fn) => fn(next));
    }
    return {
      hass, apiCalls, fail, events,
      subscribe(fn) { subs.push(fn); fn({ ...hass, states: { ...states } }); },
      setAttr(id, attrs) { states[id] = { ...states[id], attributes: { ...states[id].attributes, ...attrs } }; publish(); },
      setState(id, state) { states[id] = { ...states[id], state: String(state) }; publish(); },
      publish,
    };
  }

  function demoConfig(scenario) {
    const cfg = {
      type: 'custom:glasshouse-agenda-card',
      title: 'Coming up',
      days: 7,
      max_events: 14,
      calendars: [
        { entity: 'calendar.family', color: 'info' },
        { entity: 'calendar.work', color: 'media', icon: 'mdi:briefcase-outline' },
        { entity: 'calendar.garbage_collection', color: 'ok', icon: 'mdi:trash-can' },
        { entity: 'calendar.holidays', color: 'warn', icon: 'mdi:calendar-star' },
      ],
      deliveries: { entity: 'sensor.parcel_deliveries', max: 5 },
      counts: [
        { entity: 'sensor.amazon_deliveries_today', name: 'Amazon', icon: 'mdi:package-variant' },
        { entity: 'sensor.mail_usps_mail', name: 'Mail', icon: 'mdi:email' },
      ],
      layout: 'auto',
    };
    return cfg;
  }

  root.GHAgendaMock = { createHass, demoConfig, demoEvents, demoDeliveries, localIso, ymd };
})(typeof window !== 'undefined' ? window : globalThis);
