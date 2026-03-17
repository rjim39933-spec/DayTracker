// ══════════════════════════════════════════════════
// DATA — BUG FIX: deduplicate on load to fix "All shows doubles" bug
// ══════════════════════════════════════════════════
let events = (function(){
  const raw = JSON.parse(localStorage.getItem('tom_events') || '[]');
  const seen = new Set();
  const deduped = raw.filter(e => {
    const key = (e.date||'') + '|' + (e.title||'');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Persist cleaned copy if we found duplicates
  if (deduped.length !== raw.length) {
    try { localStorage.setItem('tom_events', JSON.stringify(deduped)); } catch(e) {}
  }
  return deduped;
}());

function saveEvents() {
  try { localStorage.setItem('tom_events', JSON.stringify(events)); } catch(e) {}
}

const subjectColors = {};
events.forEach(e => { subjectColors[e.subject] = e.color; });

// ══════════════════════════════════════════════════
// CALENDARS SYSTEM
// ══════════════════════════════════════════════════
const CAL_PALETTE = ['#c0392b','#2980b9','#27ae60','#8e44ad','#e67e22','#16a085','#d4a820','#e91e63','#00bcd4','#607d8b'];

let calendars = JSON.parse(localStorage.getItem('tom_calendars') || JSON.stringify([
  { id:'all', name:'All', color:'#555555', visible:true, system:true }
]));

function saveCalendars() {
  localStorage.setItem('tom_calendars', JSON.stringify(calendars));
}

function getVisibleCalendarIds() {
  return new Set(calendars.filter(c => c.visible).map(c => c.id));
}

// BUG FIX: always deduplicate by date+title in filteredByCalendar
function filteredByCalendar(evList) {
  const visible = getVisibleCalendarIds();
  const allCal = calendars.find(c => c.id === 'all');
  const result = (allCal && allCal.visible)
    ? evList
    : evList.filter(e => e.calendarId && visible.has(e.calendarId));
  // Always deduplicate — guards against any double-stored events
  const seen = new Set();
  return result.filter(e => {
    const key = (e.date||'') + '|' + (e.title||'');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderCalPanel() {
  const container = document.getElementById('cal-list');
  if (!container) return;
  container.innerHTML = '';
  calendars.forEach((cal, i) => {
    const item = document.createElement('div');
    item.className = 'cal-item';
    item.innerHTML = `
      <div class="cal-dot${cal.visible ? '' : ' unchecked'}" style="background:${cal.color}" data-id="${cal.id}"></div>
      <span class="cal-item-name" title="${cal.name}">${cal.name}</span>
      ${!cal.system ? `<button class="cal-item-del" onclick="deleteCalendar('${cal.id}')" title="Delete">✕</button>` : ''}
    `;
    item.querySelector('.cal-dot').addEventListener('click', () => toggleCalendar(cal.id));
    item.querySelector('.cal-item-name').addEventListener('click', () => toggleCalendar(cal.id));
    container.appendChild(item);
  });
}

function toggleCalendar(id) {
  const cal = calendars.find(c => c.id === id);
  if (!cal) return;
  if (id === 'all') {
    cal.visible = !cal.visible;
    if (cal.visible) {
      calendars.filter(c => !c.system).forEach(c => c.visible = false);
    }
  } else {
    const allCal = calendars.find(c => c.id === 'all');
    if (allCal && allCal.visible) allCal.visible = false;
    cal.visible = !cal.visible;
    if (!calendars.some(c => c.visible)) {
      if (allCal) allCal.visible = true;
    }
  }
  saveCalendars();
  renderCalPanel();
  activeFilter = 'all';
  buildFilters();
  render();
}

function deleteCalendar(id) {
  if (!confirm('Delete this calendar? Events in it will also be removed.')) return;
  calendars = calendars.filter(c => c.id !== id);
  events = events.filter(e => e.calendarId !== id);
  saveEvents();
  saveCalendars();
  renderCalPanel();
  buildFilters();
  render();
}

let selectedCalColor = CAL_PALETTE[0];

function openAddCalendar() {
  const row = document.getElementById('cal-color-row');
  if (row) {
    selectedCalColor = CAL_PALETTE[0];
    row.innerHTML = CAL_PALETTE.map(col =>
      `<div class="color-swatch${col === selectedCalColor ? ' selected' : ''}" style="background:${col}" onclick="selectCalColor('${col}',this)"></div>`
    ).join('');
  }
  document.getElementById('new-cal-name').value = '';
  document.getElementById('add-cal-overlay').classList.add('open');
  setTimeout(() => document.getElementById('new-cal-name').focus(), 100);
}
function closeAddCalendar(e) { if (e.target === document.getElementById('add-cal-overlay')) closeAddCalendarDirect(); }
function closeAddCalendarDirect() { document.getElementById('add-cal-overlay').classList.remove('open'); }
function selectCalColor(col, el) {
  selectedCalColor = col;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}
function confirmAddCalendar() {
  const name = document.getElementById('new-cal-name').value.trim();
  if (!name) { document.getElementById('new-cal-name').focus(); return; }
  const id = 'cal_' + Date.now();
  // Turn off "All" so the new calendar doesn't show events twice
  const allCal = calendars.find(c => c.id === 'all');
  if (allCal) allCal.visible = false;
  calendars.push({ id, name, color: selectedCalColor, visible: true, system: false });
  saveCalendars();
  renderCalPanel();
  buildFilters();
  render();
  closeAddCalendarDirect();
}

// ── ADD EVENT ──────────────────────────────────────
let selectedEventColor = '#c0392b';

function toggleRecurUntil() {
  const val = document.getElementById('ae-recur').value;
  const wrap = document.getElementById('ae-recur-until-wrap');
  wrap.style.display = val ? 'flex' : 'none';
}

function openAddEvent(prefillDate) {
  editingEvent = null;
  const sel = document.getElementById('ae-calendar');
  sel.innerHTML = calendars.filter(c => !c.system).map(c =>
    `<option value="${c.id}">${c.name}</option>`
  ).join('');
  if (!sel.options.length) sel.innerHTML = '<option value="all">All</option>';

  const d = prefillDate || dateStr(currentDate);
  document.getElementById('ae-date').value = d;
  document.getElementById('ae-title').value = '';
  document.getElementById('ae-desc').value = '';
  document.getElementById('ae-start').value = '';
  document.getElementById('ae-end').value = '';
  document.getElementById('ae-status').textContent = '';

  selectedEventColor = CAL_PALETTE[0];
  const row = document.getElementById('ae-color-row');
  row.innerHTML = CAL_PALETTE.map(col =>
    `<div class="color-swatch${col === selectedEventColor ? ' selected' : ''}" style="background:${col}" onclick="selectEventColor('${col}',this)"></div>`
  ).join('');

  document.getElementById('ae-recur').value = '';
  document.getElementById('ae-recur-until-wrap').style.display = 'none';
  document.getElementById('ae-recur-until').value = '';
  document.getElementById('ae-recur-row').style.display = 'block';
  document.getElementById('ae-modal-title').textContent = 'New Event';
  document.getElementById('ae-submit-btn').textContent = 'Add Event';
  document.getElementById('ae-delete-btn').style.display = 'none';
  document.getElementById('add-event-overlay').classList.add('open');
  setTimeout(() => document.getElementById('ae-title').focus(), 100);
}
function closeAddEvent(e) { if (e.target === document.getElementById('add-event-overlay')) closeAddEventDirect(); }
function closeAddEventDirect() { document.getElementById('add-event-overlay').classList.remove('open'); }
function selectEventColor(col, el) {
  selectedEventColor = col;
  document.querySelectorAll('#ae-color-row .color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
}

function confirmAddEvent() {
  const title = document.getElementById('ae-title').value.trim();
  const date  = document.getElementById('ae-date').value;
  if (!title) { document.getElementById('ae-status').textContent = 'Title required'; return; }
  if (!date)  { document.getElementById('ae-status').textContent = 'Date required'; return; }
  const calId      = document.getElementById('ae-calendar').value || 'all';
  const type       = document.getElementById('ae-type').value;
  const desc       = document.getElementById('ae-desc').value.trim();
  const startV     = document.getElementById('ae-start').value;
  const endV       = document.getElementById('ae-end').value;
  const allDay     = !startV;
  const cal        = calendars.find(c => c.id === calId);
  const subject    = cal ? cal.name : 'Personal';
  const recurType  = document.getElementById('ae-recur').value;
  const recurUntil = document.getElementById('ae-recur-until').value;

  const baseEv = {
    date, subject, title, type, desc,
    color: selectedEventColor, calendarId: calId, allDay,
    ...(allDay ? {} : { startHour: +startV, endHour: endV ? +endV : +startV + 1 })
  };

  if (editingEvent) {
    Object.assign(editingEvent, baseEv);
    if (allDay) { delete editingEvent.startHour; delete editingEvent.endHour; }
  } else {
    events.push({...baseEv});
  }

  // Generate recurring copies if repeat is set
  if (recurType && recurUntil) {
    const stepDays = recurType === 'daily' ? 1 : recurType === 'weekly' ? 7 : 14;
    let cur = new Date(date + 'T12:00:00');
    const until = new Date(recurUntil + 'T12:00:00');
    cur.setDate(cur.getDate() + stepDays);
    let count = 0;
    while (cur <= until && count < 500) {
      const d = cur.getFullYear() + '-' + String(cur.getMonth()+1).padStart(2,'0') + '-' + String(cur.getDate()).padStart(2,'0');
      if (!events.some(x => x.date === d && x.title === title && x.calendarId === calId)) {
        events.push({...baseEv, date: d});
      }
      cur.setDate(cur.getDate() + stepDays);
      count++;
    }
  }

  subjectColors[subject] = selectedEventColor;
  saveEvents(); buildFilters(); render();
  editingEvent = null;
  closeAddEventDirect();
}

function deleteEditingEvent() {
  if (!editingEvent) return;
  if (!confirm('Delete this event?')) return;
  const idx = events.indexOf(editingEvent);
  if (idx !== -1) events.splice(idx, 1);
  saveEvents(); buildFilters(); render();
  editingEvent = null;
  closeAddEventDirect();
}

// ══════════════════════════════════════════════════
// STATE
// ══════════════════════════════════════════════════
let currentDate = new Date();
let currentView = 'month';
let activeFilter = 'all';
let notificationsEnabled = false;
let weekStartHour = 8;
let weekEndHour = 18;
let dismissedUpcoming = new Set(JSON.parse(localStorage.getItem('tom_dismissed') || '[]'));
function saveDismissed() { try { localStorage.setItem('tom_dismissed', JSON.stringify([...dismissedUpcoming])); } catch(e) {} }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_S = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function getSubjects() {
  const visibleEvs = filteredByCalendar(events);
  return ['all', ...new Set(visibleEvs.map(e => e.subject))];
}
function dateStr(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtH(h) {
  if (h == null) return '';
  const hr = Math.floor(h), mins = h % 1 === 0.5 ? '30' : '00';
  const ampm = hr < 12 ? 'am' : 'pm';
  const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return mins === '00' ? `${hr12}${ampm}` : `${hr12}:${mins}${ampm}`;
}
function filteredEvents() {
  let evs = filteredByCalendar(events);
  if (activeFilter !== 'all') evs = evs.filter(e => e.subject === activeFilter);
  return evs;
}

// ══════════════════════════════════════════════════
// IMPORT PROMPT
// ══════════════════════════════════════════════════
const IMPORT_PROMPT = `Please read the attached document and convert ALL events, tasks, appointments, and deadlines into a JSON array.

Return ONLY a raw JSON array — no explanation, no markdown, no code fences. Each item must have exactly these fields:

  "date"      — "YYYY-MM-DD"
  "subject"   — category label for this event. Pick the most natural grouping for this type of calendar (e.g. for school: subject names; for work: project/department names; for personal: "Health", "Social", "Finance", etc.). Use consistent labels — same category = same subject string. Aim for 3–8 distinct categories total.
  "title"     — short, clear event name
  "type"      — pick best fit: "Event", "Meeting", "Task", "Deadline", "Reminder", "Test", "Assignment", "Appointment", "Excursion", "Other"
  "desc"      — brief description: location, duration, notes (empty string "" if nothing to add)
  "color"     — a distinct, visually appealing hex colour per subject/category. Same subject = same colour always.
  "allDay"    — true if no specific time, false if timed
  "startHour" — 24h integer hour if timed (omit entirely if allDay is true)
  "endHour"   — 24h integer end hour if timed (omit entirely if allDay is true)

Include EVERY event from the document — do not skip anything.

Example:
[{"date":"2026-04-15","subject":"Work","title":"Brand review","type":"Meeting","desc":"Zoom, 45 min","color":"#7c3aed","allDay":false,"startHour":10,"endHour":11},{"date":"2026-04-20","subject":"Health","title":"Dentist","type":"Appointment","desc":"City clinic","color":"#059669","allDay":false,"startHour":9,"endHour":10}]`;

function openImport() {
  document.getElementById('formula-box').textContent = IMPORT_PROMPT;
  document.getElementById('import-textarea').value = '';
  document.getElementById('import-status').textContent = '';
  document.getElementById('import-overlay').classList.add('open');
}
function closeImport(){document.getElementById('import-overlay').classList.remove('open');}
function closeImportOutside(e){if(e.target===document.getElementById('import-overlay'))closeImport();}
function copyFormula() {
  navigator.clipboard.writeText(IMPORT_PROMPT).then(()=>{
    const b=document.getElementById('copy-btn');
    b.textContent='✅ Copied!';
    setTimeout(()=>b.textContent='📋 Copy Prompt',2000);
  });
}

// BUG FIX: doImport now checks for duplicates before adding
function doImport() {
  const raw = document.getElementById('import-textarea').value.trim();
  const status = document.getElementById('import-status');
  if(!raw){status.textContent='⚠ Paste JSON first.';status.style.color='var(--accent)';return;}
  try {
    let parsed = JSON.parse(raw);
    if(!Array.isArray(parsed)){status.textContent='⚠ Expected a JSON array.';status.style.color='var(--accent)';return;}
    let added=0;
    parsed.forEach(ev=>{
      if(!ev.date||!ev.subject||!ev.title)return;
      if(!ev.color)ev.color=subjectColors[ev.subject]||'#888888';
      ev.calendarId = calendars.find(c=>!c.system)?.id || 'all';
      // Skip duplicates
      if(events.some(x=>x.date===ev.date&&x.title===ev.title))return;
      events.push(ev);
      subjectColors[ev.subject]=ev.color;
      added++;
    });
    status.textContent=`✅ Added ${added} events!`;status.style.color='var(--green)';
    saveEvents();buildFilters();render();
    setTimeout(closeImport,1400);
  } catch(e){status.textContent='⚠ Invalid JSON — check format.';status.style.color='var(--accent)';}
}

// ══════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════
function toggleNotifications() {
  if(!('Notification' in window)){alert('Notifications not supported.');return;}
  if(notificationsEnabled){
    notificationsEnabled=false;
    document.getElementById('notif-btn').textContent='🔔 Notifications';
    document.getElementById('notif-btn').classList.remove('on');
    return;
  }
  Notification.requestPermission().then(p=>{
    if(p==='granted'){
      notificationsEnabled=true;
      document.getElementById('notif-btn').textContent='🔕 Notifs On';
      document.getElementById('notif-btn').classList.add('on');
      scheduleNotifications();
      new Notification("Tom's Calendar Active",{body:'Reminders are enabled.'});
    } else alert('Please allow notifications in browser settings.');
  });
}
function rescheduleNotifications(){if(notificationsEnabled)scheduleNotifications();}
function scheduleNotifications() {
  const now=new Date();
  const do1d=document.getElementById('notif-1d').checked;
  const do1w=document.getElementById('notif-1w').checked;
  const do3d=document.getElementById('notif-3d').checked;
  events.forEach(ev=>{
    const evDate=new Date(ev.date+'T08:00:00');
    const timings=[];
    if(do1d)timings.push([new Date(evDate-86400000),'Tomorrow']);
    if(do1w)timings.push([new Date(evDate-7*86400000),'In 1 week']);
    if(do3d)timings.push([new Date(evDate-3*86400000),'In 3 days']);
    timings.forEach(([t,label])=>{
      const delay=t-now;
      if(delay>0)setTimeout(()=>{
        if(notificationsEnabled)new Notification(`${label}: ${ev.subject}`,{body:ev.title,tag:ev.date+ev.subject+label});
      },delay);
    });
  });
}

// ══════════════════════════════════════════════════
// FILTERS
// ══════════════════════════════════════════════════
function buildFilters() {
  const subjects=getSubjects();
  const c=document.getElementById('filters');
  c.innerHTML='<span class="filter-label">Filter:</span>';
  subjects.forEach(s=>{
    const btn=document.createElement('button');
    btn.className='pill'+(s===activeFilter?' active':'');
    btn.setAttribute('data-subject',s);
    btn.textContent=s==='all'?'All':s;
    if(s===activeFilter&&s!=='all'){btn.style.background=subjectColors[s]||'#555';btn.style.color='white';btn.style.borderColor='transparent';}
    btn.onclick=()=>{
      activeFilter=s;
      document.querySelectorAll('.pill').forEach(p=>{p.classList.remove('active');p.style.background='';p.style.color='';p.style.borderColor='';});
      btn.classList.add('active');
      if(s!=='all'){btn.style.background=subjectColors[s]||'#555';btn.style.color='white';btn.style.borderColor='transparent';}
      render();
    };
    c.appendChild(btn);
  });
}

// ══════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════
function goToToday(){currentDate=new Date();render();}
function navigatePrev(){
  if(currentView==='month')currentDate.setMonth(currentDate.getMonth()-1);
  else if(currentView==='week')currentDate.setDate(currentDate.getDate()-7);
  else currentDate.setDate(currentDate.getDate()-1);
  render();
}
function navigateNext(){
  if(currentView==='month')currentDate.setMonth(currentDate.getMonth()+1);
  else if(currentView==='week')currentDate.setDate(currentDate.getDate()+7);
  else currentDate.setDate(currentDate.getDate()+1);
  render();
}
function setView(v){
  currentView=v;
  document.querySelectorAll('.view-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
  document.getElementById('calendar-wrap').style.display=v==='month'?'block':'none';
  document.getElementById('week-wrap').style.display=v==='week'?'block':'none';
  document.getElementById('day-wrap').style.display=v==='day'?'block':'none';
  document.getElementById('list-view').style.display=v==='list'?'block':'none';
  render();
}

// ══════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════
function render(){
  updateLabel();
  if(currentView==='month')renderMonth();
  else if(currentView==='week')renderWeek();
  else if(currentView==='day')renderDay();
  else renderList();
  renderUpcoming();
}

function updateLabel(){
  const lbl=document.getElementById('period-label');
  if(currentView==='month') lbl.textContent=MONTHS[currentDate.getMonth()]+' '+currentDate.getFullYear();
  else if(currentView==='week'){
    const ws=weekStart(currentDate), we=new Date(ws); we.setDate(we.getDate()+6);
    lbl.textContent=`${ws.getDate()} ${MONTHS[ws.getMonth()].slice(0,3)} – ${we.getDate()} ${MONTHS[we.getMonth()].slice(0,3)} ${we.getFullYear()}`;
  } else if(currentView==='day'){
    lbl.textContent=currentDate.toLocaleDateString('en-AU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  } else lbl.textContent='All Events';
}

// ══════════════════════════════════════════════════
// TERM SYSTEM
// ══════════════════════════════════════════════════
const TERM_DEFAULTS = [
  { name:'T1', start:'2026-01-27', weeks:10 },
  { name:'T2', start:'2026-04-21', weeks:9  },
  { name:'T3', start:'2026-07-07', weeks:10 },
  { name:'T4', start:'2026-09-29', weeks:8  }
];
// Load saved term config, falling back to defaults.
// One-time reset: clear any bad data saved by old versions.
['bgs_terms','tom_terms_reset_v4','tom_terms_reset_v5','tom_terms_user_set'].forEach(k => localStorage.removeItem(k));
if (!localStorage.getItem('tom_terms_v14')) {
  localStorage.removeItem('tom_terms');
  localStorage.setItem('tom_terms_v14', '1');
}
let termConfig = (function() {
  try {
    const saved = JSON.parse(localStorage.getItem('tom_terms') || '');
    if (Array.isArray(saved) && saved.length && saved[0].start) return saved;
  } catch(e) {}
  return TERM_DEFAULTS.map(t => ({...t}));
}());

function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getSchoolWeek(date) {
  const d = new Date(date); d.setHours(12,0,0,0);
  const mondayD = mondayOf(d.toISOString().slice(0,10));
  for (let ti = 0; ti < termConfig.length; ti++) {
    const term = termConfig[ti];
    const termMonday = mondayOf(term.start);
    const diffMs = mondayD - termMonday;
    const diffWeeks = Math.round(diffMs / (7 * 24 * 3600 * 1000));
    if (diffWeeks >= 0 && diffWeeks < term.weeks) {
      return { label: term.name, num: diffWeeks + 1, cls: 'term-week', termIdx: ti };
    }
  }
  for (let ti = 0; ti < termConfig.length - 1; ti++) {
    const thisEnd = mondayOf(termConfig[ti].start);
    thisEnd.setDate(thisEnd.getDate() + termConfig[ti].weeks * 7);
    const nextStart = mondayOf(termConfig[ti + 1].start);
    if (mondayD >= thisEnd && mondayD < nextStart) {
      return { label: 'Hols', num: null, cls: 'holiday-week' };
    }
  }
  return { label: '', cls: 'no-school' };
}

function termWeekToDate(weekNum, termIndex, dayOfWeek) {
  if (termIndex < 0 || termIndex >= termConfig.length) return null;
  const term = termConfig[termIndex];
  const termMonday = mondayOf(term.start);
  if (weekNum < 1 || weekNum > term.weeks) return null;
  const targetMonday = new Date(termMonday);
  targetMonday.setDate(targetMonday.getDate() + (weekNum - 1) * 7);
  const dow = (dayOfWeek == null) ? 1 : dayOfWeek;
  const diffFromMon = dow === 0 ? 6 : dow - 1;
  targetMonday.setDate(targetMonday.getDate() + diffFromMon);
  const y = targetMonday.getFullYear();
  const m = String(targetMonday.getMonth()+1).padStart(2,'0');
  const dd = String(targetMonday.getDate()).padStart(2,'0');
  return y + '-' + m + '-' + dd;
}

function renderTermSettingsRows() {
  const container = document.getElementById('term-settings-rows');
  if (!container) return;
  container.innerHTML = termConfig.map((t, i) => `
    <div class="term-row" data-term="${i}">
      <input class="term-date-input" type="text" value="${t.name}" placeholder="Name" oninput="termConfig[${i}].name=this.value">
      <input class="term-date-input" type="date" value="${t.start}" oninput="termConfig[${i}].start=this.value">
      <input class="term-weeks-input" type="number" min="1" max="20" value="${t.weeks}" oninput="termConfig[${i}].weeks=+this.value"> wks
    </div>
  `).join('');
}
function addTermRow() {
  termConfig.push({ name: 'T' + (termConfig.length+1), start: new Date().toISOString().slice(0,10), weeks: 10 });
  renderTermSettingsRows();
}
function saveTermSettings() {
  // termConfig is already updated in-memory via the oninput handlers.
  localStorage.setItem('tom_terms', JSON.stringify(termConfig));
  render();
  const el = document.getElementById('term-save-status');
  if (el) { el.textContent = '✓ Saved!'; setTimeout(() => el.textContent = '', 3000); }
}

// ── MONTH RENDER ──────────────────────────────────
function renderMonth(){
  const grid=document.getElementById('calendar-grid'); grid.innerHTML='';
  const yr=currentDate.getFullYear(),mo=currentDate.getMonth();
  const firstDay=new Date(yr,mo,1).getDay(), dim=new Date(yr,mo+1,0).getDate();
  const today=new Date(); const evs=filteredEvents();
  const rows = [];
  for (let row = 0; row < 6; row++) {
    const rowDays = [];
    for (let col = 0; col < 7; col++) { rowDays.push(row * 7 + col - firstDay + 1); }
    rows.push(rowDays);
  }
  rows.forEach(rowDays => {
    const repOffset = rowDays.find(d => d >= 1 && d <= dim) || rowDays[0];
    // Use Monday of the row (col 1 = Monday when week starts Sunday) for week label
    const monOffset = rowDays[1] >= 1 && rowDays[1] <= dim ? rowDays[1]
                    : rowDays.find(d => d >= 1 && d <= dim) || rowDays[0];
    const repDate = new Date(yr, mo, monOffset);
    const sw = getSchoolWeek(repDate);
    const lbl = document.createElement('div');
    lbl.className = `week-label-cell ${sw.cls}${sw.termIdx != null ? ' term-' + sw.termIdx : ''}`;
    if (sw.cls === 'term-week') {
      lbl.innerHTML = `<span class="wl-num">${sw.num}</span><span class="wl-term">${sw.label}</span>`;
      lbl.title = `${sw.label} Week ${sw.num}`;
    } else if (sw.cls === 'holiday-week') {
      lbl.innerHTML = `<span class="wl-term" style="font-size:0.52rem">HOLS</span>`;
    } else { lbl.innerHTML = ''; }
    grid.appendChild(lbl);
    rowDays.forEach(dayOffset => {
      if (dayOffset < 1 || dayOffset > dim) {
        grid.appendChild(mkCell('other-month', new Date(yr, mo, dayOffset).getDate(), '', evs));
      } else {
        const ds = `${yr}-${String(mo+1).padStart(2,'0')}-${String(dayOffset).padStart(2,'0')}`;
        const isT = today.getFullYear()===yr && today.getMonth()===mo && today.getDate()===dayOffset;
        grid.appendChild(mkCell(isT?'today':'', dayOffset, ds, evs));
      }
    });
  });
}
function mkCell(cls,dayNum,ds,evs){
  const c=document.createElement('div');
  c.className='cal-cell'+(cls?' '+cls:'');
  c.style.cursor='pointer';
  c.addEventListener('click', () => { if(ds) openAddEvent(ds); });
  const dayNumEl=document.createElement('div'); dayNumEl.className='day-num'; dayNumEl.textContent=dayNum; c.appendChild(dayNumEl);
  if(ds){
    const dayEvs=evs.filter(e=>e.date===ds);
    const wrap=document.createElement('div'); wrap.className='cell-chips';
    const MAX_CHIPS=document.body.classList.contains('compact')?1:3;
    dayEvs.slice(0,MAX_CHIPS).forEach(ev=>{
      const chip=document.createElement('div'); chip.className='event-chip';
      chip.style.cssText=`border-left-color:${ev.color};background:${ev.color}1a;color:${ev.color};`;
      chip.textContent=ev.title;
      chip.onclick=(e)=>{ e.stopPropagation(); openModal(ev); };
      wrap.appendChild(chip);
    });
    const hidden=dayEvs.length-MAX_CHIPS;
    if(hidden>0){
      const more=document.createElement('div'); more.className='chip-more'; more.textContent='+'+hidden+' more';
      more.onclick=(e)=>{ e.stopPropagation(); currentDate=new Date(ds+'T12:00:00'); setView('day'); };
      wrap.appendChild(more);
    }
    c.appendChild(wrap);
  }
  return c;
}

// ── WEEK ──────────────────────────────────────────
function weekStart(d){const r=new Date(d);r.setDate(r.getDate()-r.getDay());r.setHours(0,0,0,0);return r;}
function renderWeek(){
  const ws=weekStart(currentDate);
  const days=Array.from({length:7},(_,i)=>{const d=new Date(ws);d.setDate(d.getDate()+i);return d;});
  const today=new Date();today.setHours(0,0,0,0);
  const evs=filteredEvents();
  const dh=document.getElementById('week-day-headers');
  dh.innerHTML='<div></div>';
  days.forEach(d=>{const isT=d.getTime()===today.getTime();dh.innerHTML+=`<div class="week-day-hdr${isT?' today-col':''}">${DAYS_S[d.getDay()]} ${d.getDate()}</div>`;});
  const ad=document.getElementById('week-allday-row');
  ad.innerHTML='<div class="week-allday-label">All day</div>';
  days.forEach(d=>{
    const ds=dateStr(d),cell=document.createElement('div');cell.className='week-allday-cell';
    evs.filter(e=>e.date===ds&&e.allDay).forEach(ev=>{
      const chip=document.createElement('div');chip.className='event-chip';
      chip.style.cssText=`border-left-color:${ev.color};background:${ev.color}22;color:${ev.color};`;
      chip.textContent=ev.title;chip.onclick=()=>openModal(ev);cell.appendChild(chip);
    });ad.appendChild(cell);
  });
  const tg=document.getElementById('week-time-grid');tg.innerHTML='';
  const hours=Array.from({length:weekEndHour-weekStartHour},(_,i)=>weekStartHour+i);
  const tlc=document.createElement('div');tlc.className='week-time-col';
  hours.forEach(h=>{const l=document.createElement('div');l.className='time-label';l.textContent=fmtH(h);tlc.appendChild(l);});
  tg.appendChild(tlc);
  days.forEach(d=>{
    const ds=dateStr(d),col=document.createElement('div');col.className='week-col';
    col.style.cssText=`position:relative;height:${hours.length*48}px;`;
    hours.forEach(()=>{const ln=document.createElement('div');ln.className='hour-line';col.appendChild(ln);});
    evs.filter(e=>e.date===ds&&!e.allDay&&e.startHour!=null).forEach(ev=>{
      const sh=Math.max(ev.startHour,weekStartHour),eh=Math.min(ev.endHour||ev.startHour+1,weekEndHour);
      if(sh>=weekEndHour||eh<=weekStartHour){
        // Outside visible hours — show in all-day row instead
        const chip=document.createElement('div');chip.className='event-chip';
        chip.style.cssText=`border-left-color:${ev.color};background:${ev.color}22;color:${ev.color};`;
        chip.textContent=ev.title;chip.onclick=()=>openModal(ev);
        const adCell=ad.children[days.findIndex(d=>dateStr(d)===ds)+1];
        if(adCell)adCell.appendChild(chip);
        return;
      }
      const block=document.createElement('div');block.className='week-event-block';
      block.style.cssText=`top:${(sh-weekStartHour)*48}px;height:${Math.max((eh-sh)*48,22)}px;background:${ev.color};color:white;`;
      block.textContent=ev.title;block.onclick=()=>openModal(ev);col.appendChild(block);
    });tg.appendChild(col);
  });
}

// ── DAY ────────────────────────────────────────────
function renderDay(){
  const ds=dateStr(currentDate);
  const today=new Date();today.setHours(0,0,0,0);
  const cDate=new Date(currentDate);cDate.setHours(0,0,0,0);
  const evs=filteredEvents().filter(e=>e.date===ds);
  const hdr=document.getElementById('day-header-row');
  hdr.innerHTML=`<div class="day-big-date">${currentDate.getDate()}</div><div><div class="day-big-label">${DAYS_S[currentDate.getDay()]}${cDate.getTime()===today.getTime()?' — Today':''}</div><div style="font-family:'DM Mono',monospace;font-size:0.68rem;color:var(--muted);margin-top:2px">${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}</div></div>`;
  const adSec=document.getElementById('day-allday-section');
  const ade=evs.filter(e=>e.allDay);
  if(ade.length){
    adSec.style.display='';adSec.innerHTML='<div class="day-allday-title">All Day</div>';
    ade.forEach(ev=>{
      const chip=document.createElement('div');chip.className='event-chip';
      chip.style.cssText=`border-left-color:${ev.color};background:${ev.color}22;color:${ev.color};font-size:0.76rem;padding:5px 8px;margin-bottom:4px;border-radius:8px;cursor:pointer;`;
      chip.textContent=ev.title;chip.onclick=()=>openModal(ev);adSec.appendChild(chip);
    });
  } else adSec.style.display='none';
  const tl=document.getElementById('day-timeline');tl.innerHTML='';
  const hours=Array.from({length:weekEndHour-weekStartHour},(_,i)=>weekStartHour+i);
  const tlc=document.createElement('div');tlc.className='week-time-col';
  hours.forEach(h=>{const l=document.createElement('div');l.className='time-label';l.textContent=fmtH(h);tlc.appendChild(l);});
  tl.appendChild(tlc);
  const col=document.createElement('div');col.className='day-col';
  col.style.cssText=`position:relative;height:${hours.length*48}px;`;
  hours.forEach(()=>{const ln=document.createElement('div');ln.className='hour-line';col.appendChild(ln);});
  const te=evs.filter(e=>!e.allDay&&e.startHour!=null);
  te.forEach(ev=>{
    const sh=Math.max(ev.startHour,weekStartHour),eh=Math.min(ev.endHour||ev.startHour+1,weekEndHour);
    if(sh>=weekEndHour||eh<=weekStartHour){
      // Outside visible hours — show in all-day section instead
      const chip=document.createElement('div');chip.className='event-chip';
      chip.style.cssText=`border-left-color:${ev.color};background:${ev.color}22;color:${ev.color};font-size:0.76rem;padding:5px 8px;margin-bottom:4px;border-radius:8px;cursor:pointer;`;
      chip.textContent=ev.title;chip.onclick=()=>openModal(ev);
      adSec.style.display='';
      if(!adSec.querySelector('.day-allday-title'))adSec.innerHTML='<div class="day-allday-title">All Day</div>';
      adSec.appendChild(chip);
      return;
    }
    const block=document.createElement('div');block.className='day-event-block';
    block.style.cssText=`top:${(sh-weekStartHour)*48}px;height:${Math.max((eh-sh)*48,36)}px;background:${ev.color};color:white;`;
    block.innerHTML=`<div style="font-weight:700">${ev.title}</div><div style="font-size:0.63rem;opacity:0.85;margin-top:2px">${ev.subject}</div>`;
    block.onclick=()=>openModal(ev);col.appendChild(block);
  });
  if(!te.length&&!ade.length)col.innerHTML+='<div style="position:absolute;top:60px;left:16px;font-family:DM Mono,monospace;font-size:0.7rem;color:var(--muted);letter-spacing:1px;">No events scheduled</div>';
  tl.appendChild(col);
}

// ── LIST ───────────────────────────────────────────
function renderList(){
  const c=document.getElementById('list-view');c.innerHTML='';
  const evs=filteredEvents().slice().sort((a,b)=>a.date.localeCompare(b.date));
  if(!evs.length){
    c.innerHTML='<div style="font-family:DM Mono,monospace;font-size:0.74rem;color:var(--muted);text-align:center;padding:48px 20px;letter-spacing:1px;line-height:1.8">No events yet.<br><span style="font-size:0.62rem;opacity:0.6">Add events using the Import button,<br>or click any day on the calendar.</span></div>';
    return;
  }
  const groups={};
  evs.forEach(ev=>{const d=new Date(ev.date),k=MONTHS[d.getMonth()]+' '+d.getFullYear();if(!groups[k])groups[k]=[];groups[k].push(ev);});
  Object.entries(groups).forEach(([mo,items])=>{
    const g=document.createElement('div');g.className='list-month-group';
    g.innerHTML=`<div class="list-month-title">${mo}</div>`;
    items.forEach(ev=>{
      const d=new Date(ev.date),row=document.createElement('div');row.className='list-item';
      row.innerHTML=`<div class="list-date">${d.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'})}</div><div class="list-subject" style="color:${ev.color}">${ev.subject}</div><div><div class="list-title">${ev.title}</div><div class="list-detail">${ev.desc||''}</div></div><div class="list-type">${ev.type}</div>`;
      row.onclick=()=>openModal(ev);g.appendChild(row);
    });c.appendChild(g);
  });
}

// ── UPCOMING ──────────────────────────────────────
function renderUpcoming(){
  const c=document.getElementById('upcoming-list');c.innerHTML='';
  const today=new Date();today.setHours(0,0,0,0);
  const up=filteredEvents()
    .filter(e=>new Date(e.date)>=today && !dismissedUpcoming.has(e.date+'|'+e.title))
    .sort((a,b)=>a.date.localeCompare(b.date)).slice(0,9);
  if(!up.length){
    c.innerHTML='<div style="color:var(--muted);font-size:0.73rem;font-family:DM Mono,monospace;line-height:1.7">No upcoming events.</div>';
    return;
  }
  up.forEach(ev=>{
    const diff=Math.round((new Date(ev.date)-today)/86400000);
    const urgency=diff<=3?'soon':diff<=14?'medium':'far';
    const label=diff===0?'TODAY':diff===1?'TOMORROW':`IN ${diff} DAYS`;
    const item=document.createElement('div');item.className='upcoming-item';
    item.innerHTML='<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:4px">'
      +'<div class="upcoming-days '+urgency+'">'+label+(diff<=3?'<span class="countdown-badge">!</span>':'')+'</div>'
      +'<button class="upcoming-dismiss" title="Dismiss" data-key="'+ev.date+'|'+escHtml(ev.title)+'">✕</button>'
      +'</div>'
      +'<div class="upcoming-title">'+escHtml(ev.title)+'</div>'
      +'<div class="upcoming-subject" style="color:'+ev.color+'">'+escHtml(ev.subject)+'</div>';
    item.querySelector('.upcoming-dismiss').addEventListener('click', function(e){
      e.stopPropagation();
      dismissedUpcoming.add(this.dataset.key);
      saveDismissed();
      renderUpcoming();
    });
    item.addEventListener('click', ()=>openModal(ev));
    c.appendChild(item);
  });
}

// ══════════════════════════════════════════════════
// MODAL (edit event)
// ══════════════════════════════════════════════════
let editingEvent = null;

function openModal(ev) {
  editingEvent = ev;
  const sel = document.getElementById('ae-calendar');
  sel.innerHTML = calendars.filter(c => !c.system).map(c =>
    `<option value="${c.id}"${c.id===ev.calendarId?' selected':''}>${c.name}</option>`
  ).join('');
  if (!sel.options.length) sel.innerHTML = '<option value="all">All</option>';
  document.getElementById('ae-title').value = ev.title || '';
  document.getElementById('ae-date').value = ev.date || '';
  document.getElementById('ae-desc').value = ev.desc || '';
  document.getElementById('ae-type').value = ev.type || 'Event';
  document.getElementById('ae-start').value = ev.startHour != null ? String(ev.startHour) : '';
  document.getElementById('ae-end').value = ev.endHour != null ? String(ev.endHour) : '';
  document.getElementById('ae-status').textContent = '';
  selectedEventColor = ev.color || CAL_PALETTE[0];
  const row = document.getElementById('ae-color-row');
  const allCols = [...new Set([...CAL_PALETTE, selectedEventColor])];
  row.innerHTML = allCols.map(col =>
    `<div class="color-swatch${col === selectedEventColor ? ' selected' : ''}" style="background:${col}" onclick="selectEventColor('${col}',this)"></div>`
  ).join('');
  document.getElementById('ae-recur').value = '';
  document.getElementById('ae-recur-until-wrap').style.display = 'none';
  document.getElementById('ae-recur-until').value = '';
  document.getElementById('ae-recur-row').style.display = 'block';
  document.getElementById('ae-modal-title').textContent = 'Edit Event';
  document.getElementById('ae-submit-btn').textContent = 'Save Changes';
  document.getElementById('ae-delete-btn').style.display = 'inline-flex';
  document.getElementById('add-event-overlay').classList.add('open');
  setTimeout(() => document.getElementById('ae-title').focus(), 80);
}
function closeModal(e){if(e.target===document.getElementById('add-event-overlay')&&!editingEvent)closeAddEventDirect();}
function closeModalDirect(){ editingEvent=null; closeAddEventDirect(); }
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeModalDirect();closeSettings();closeImport();closeAddEventDirect();closeAddCalendarDirect();}});

// ══════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════
document.getElementById('calendar-wrap').style.display='block';
document.getElementById('week-wrap').style.display='none';
document.getElementById('day-wrap').style.display='none';
document.getElementById('list-view').style.display='none';
renderCalPanel();
renderTermSettingsRows();
buildFilters();
render();
currentDate = new Date();

// ══════════════════════════════════════════════════
// SIDEBAR TABS
// ══════════════════════════════════════════════════
function switchSideTab(tab, el) {
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('side-upcoming').style.display = tab === 'upcoming' ? 'block' : 'none';
  document.getElementById('side-todo').style.display = tab === 'todo' ? 'block' : 'none';
}

// ══════════════════════════════════════════════════
// TO-DO SYSTEM
// ══════════════════════════════════════════════════
let todos = JSON.parse(localStorage.getItem('tom_todos') || localStorage.getItem('bgs_todos') || '[]');
function saveTodos() { try { localStorage.setItem('tom_todos', JSON.stringify(todos)); } catch(e) {} }
// One-time migration: clear past dates on todos that were created by the old broken parser.
// We detect these as todos with a past date that haven't been manually confirmed.
(function migrateStaleTodoDates() {
  if (localStorage.getItem('tom_todos_migrated_v3')) return;
  // First load of fixed version: wipe past dates from all non-done todos.
  // These were set by the old broken week parser and are incorrect.
  const todayStr = new Date().toISOString().slice(0,10);
  let changed = false;
  todos.forEach(t => {
    if (t.date && t.date < todayStr && !t.done) {
      t.date = null;
      changed = true;
    }
  });
  if (changed) saveTodos();
  localStorage.setItem('tom_todos_migrated_v2', '1');
  localStorage.setItem('tom_todos_migrated_v3', '1');
}());
function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
document.getElementById('todo-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addTodo(); }
});

// ══════════════════════════════════════════════════
// DATE PARSER — fully offline
// BUG FIX: currentWeekInTerm now uses mondayOf(today) to match display week numbers
// ══════════════════════════════════════════════════
function parseNaturalDate(text) {
  const t = text.toLowerCase().trim();
  const now = new Date();
  now.setHours(12, 0, 0, 0);

  const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const DAY_SHORT = ['sun','mon','tue','wed','thu','fri','sat'];
  const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const MONTH_SHORT = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

  function toYMD(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
  function nextWeekday(targetDay) {
    const d = new Date(now);
    const diff = ((targetDay - now.getDay() + 7) % 7) || 7;
    d.setDate(d.getDate() + diff);
    return d;
  }
  function comingWeekday(targetDay) {
    const d = new Date(now);
    let diff = (targetDay - now.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  let dateFound = null;
  let matchedPhrase = '';

  // ── 0. TERM WEEK EXPRESSIONS ──────────────────────────────────────────────
  if (!dateFound) {
    const DAY_RE = '(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)';
    const WEEK_RE = 'week\\s*(\\d{1,2})';
    const termAlts = termConfig.map((tc, i) => {
      const norm = tc.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const alts = new Set(['term\\s*' + (i+1), 't' + (i+1), norm]);
      return '(?:' + [...alts].join('|') + ')';
    });
    const TERM_RE = '(' + termAlts.join('|') + ')';
    const fullRe      = new RegExp(DAY_RE + '\\s+' + WEEK_RE + '\\s+' + TERM_RE, 'i');
    const weekTermRe  = new RegExp(WEEK_RE + '\\s+' + TERM_RE, 'i');
    const dayWeekRe   = new RegExp(DAY_RE + '\\s+' + WEEK_RE + '(?!\\s+t(?:erm)?\\s*\\d)', 'i');
    const weekDayRe   = new RegExp(WEEK_RE + '\\s+' + DAY_RE, 'i');
    const weekDayTermRe = new RegExp(WEEK_RE + '\\s+' + DAY_RE + '\\s+' + TERM_RE, 'i');
    const bareWeekRe  = new RegExp('\\b' + WEEK_RE + '\\b', 'i');

    let weekNum = null, termIdx = -1, dow = 1, phraseMatch = '';
    const dnMap = {sun:0,mon:1,tue:2,wed:3,thu:4,fri:5,sat:6};
    function parseDow(s) { return s ? (dnMap[s.toLowerCase().substring(0,3)] ?? 1) : 1; }
    function findTermIdx(matchStr) {
      const ms = matchStr.toLowerCase().replace(/\s/g,'');
      for (let ti = 0; ti < termConfig.length; ti++) {
        const norm = termConfig[ti].name.toLowerCase().replace(/[^a-z0-9]/g,'');
        if (ms === 't' + (ti+1) || ms.includes('term') && ms.includes(String(ti+1)) || ms === norm) return ti;
      }
      return -1;
    }

    let m;
    if ((m = t.match(fullRe))) {
      // "friday week 5 T2"
      dow = parseDow(m[1]); weekNum = parseInt(m[2]); termIdx = findTermIdx(m[3]); phraseMatch = m[0];
    } else if ((m = t.match(weekDayTermRe))) {
      // "week 5 friday T2"
      weekNum = parseInt(m[1]); dow = parseDow(m[2]); termIdx = findTermIdx(m[3]); phraseMatch = m[0];
    } else if ((m = t.match(weekTermRe))) {
      // "week 5 T2"
      weekNum = parseInt(m[1]); termIdx = findTermIdx(m[2]); phraseMatch = m[0];
    } else if ((m = t.match(dayWeekRe))) {
      // "friday week 5"
      dow = parseDow(m[1]); weekNum = parseInt(m[2]); phraseMatch = m[0];
    } else if ((m = t.match(weekDayRe))) {
      // "week 5 friday"
      weekNum = parseInt(m[1]); dow = parseDow(m[2]); phraseMatch = m[0];
    } else if ((m = t.match(bareWeekRe))) {
      // "week 5"
      weekNum = parseInt(m[1]); phraseMatch = m[0];
    }

    if (weekNum !== null) {
      if (termIdx === -1) {
        // Bulletproof: find first term where week N's Monday >= today's Monday.
        // "week 8" always resolves to the NEXT upcoming week 8, never a past one.
        const todayMondayMs = mondayOf(now.toISOString().slice(0,10)).getTime();
        for (let ti = 0; ti < termConfig.length; ti++) {
          if (weekNum < 1 || weekNum > termConfig[ti].weeks) continue;
          const weekMonday = new Date(mondayOf(termConfig[ti].start));
          weekMonday.setDate(weekMonday.getDate() + (weekNum - 1) * 7);
          if (weekMonday.getTime() >= todayMondayMs) { termIdx = ti; break; }
        }
        if (termIdx === -1) termIdx = termConfig.length - 1;
      }
      const resolved = termWeekToDate(weekNum, termIdx, dow);
      if (resolved) { dateFound = new Date(resolved + 'T12:00:00'); matchedPhrase = phraseMatch.trim(); }
    }
  }

  // ── 1. Explicit ISO date ──
  const isoMatch = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) { dateFound = new Date(+isoMatch[1], +isoMatch[2]-1, +isoMatch[3]); matchedPhrase = isoMatch[0]; }

  if (!dateFound) {
    const slashMatch = t.match(/\b(\d{1,2})[\/](\d{1,2})(?:[\/](\d{2,4}))?\b/);
    if (slashMatch) {
      const yr = slashMatch[3] ? (+slashMatch[3] < 100 ? 2000 + +slashMatch[3] : +slashMatch[3]) : now.getFullYear();
      dateFound = new Date(yr, +slashMatch[2]-1, +slashMatch[1]); matchedPhrase = slashMatch[0];
    }
  }

  if (!dateFound) {
    for (let mi = 0; mi < MONTH_NAMES.length; mi++) {
      const mName = MONTH_NAMES[mi], mShort = MONTH_SHORT[mi];
      const mPat = `(?:${mName}|${mShort}\.?)`;
      const patterns = [
        new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mPat}\\s+(\\d{4})\\b`, 'i'),
        new RegExp(`\\b${mPat}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(\\d{4})\\b`, 'i'),
        new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${mPat}\\b`, 'i'),
        new RegExp(`\\b${mPat}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'),
      ];
      for (const pat of patterns) {
        const m = t.match(pat);
        if (m) {
          const day = parseInt(m[1] || m[2]);
          const yr = m[2] && m[2].length === 4 ? +m[2] : (m[3] && m[3].length === 4 ? +m[3] : now.getFullYear());
          dateFound = new Date(yr, mi, day); matchedPhrase = m[0]; break;
        }
      }
      if (dateFound) break;
    }
  }

  if (!dateFound && /\b(today|tonight)\b/.test(t)) { dateFound = new Date(now); matchedPhrase = t.match(/\b(today|tonight)\b/)[0]; }
  if (!dateFound && /\btomorrow\b/.test(t)) { dateFound = addDays(now, 1); matchedPhrase = 'tomorrow'; }
  if (!dateFound && /\byesterday\b/.test(t)) { dateFound = addDays(now, -1); matchedPhrase = 'yesterday'; }

  if (!dateFound) {
    const inMatch = t.match(/\bin\s+(\d+)\s+(day|days|week|weeks|month|months)\b/);
    if (inMatch) {
      const n = +inMatch[1], unit = inMatch[2];
      if (unit.startsWith('day')) dateFound = addDays(now, n);
      else if (unit.startsWith('week')) dateFound = addDays(now, n * 7);
      else if (unit.startsWith('month')) { const d = new Date(now); d.setMonth(d.getMonth() + n); dateFound = d; }
      matchedPhrase = inMatch[0];
    }
  }

  if (!dateFound && /\b(a\s+)?fortnight(\'s\s+time)?\b/.test(t)) { dateFound = addDays(now, 14); matchedPhrase = 'fortnight'; }
  if (!dateFound && /\bnext\s+week\b/.test(t)) { dateFound = addDays(now, 7); matchedPhrase = 'next week'; }
  if (!dateFound && /\bthis\s+week\b/.test(t)) {
    const d = new Date(now); d.setDate(d.getDate() + (7 - d.getDay()) % 7 || 7); dateFound = d; matchedPhrase = 'this week';
  }
  if (!dateFound && /\bend\s+of\s+(the\s+)?week\b/.test(t)) {
    const d = new Date(now); d.setDate(d.getDate() + (5 - d.getDay() + 7) % 7 || 7); dateFound = d; matchedPhrase = 'end of the week';
  }
  if (!dateFound && /\bnext\s+month\b/.test(t)) { const d = new Date(now); d.setMonth(d.getMonth() + 1); dateFound = d; matchedPhrase = 'next month'; }
  if (!dateFound && /\bend\s+of\s+(the\s+)?month\b/.test(t)) {
    dateFound = new Date(now.getFullYear(), now.getMonth() + 1, 0); matchedPhrase = 'end of the month';
  }
  if (!dateFound) {
    const nextDayMatch = t.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/);
    if (nextDayMatch) {
      const dayStr = nextDayMatch[1].substring(0, 3);
      const targetDay = DAY_SHORT.indexOf(dayStr) !== -1 ? DAY_SHORT.indexOf(dayStr) : DAY_NAMES.indexOf(nextDayMatch[1]);
      dateFound = nextWeekday(targetDay); matchedPhrase = nextDayMatch[0];
    }
  }
  if (!dateFound) {
    const thisDayMatch = t.match(/\bthis\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|wed|thu|fri|sat)\b/);
    if (thisDayMatch) {
      const dayStr = thisDayMatch[1].substring(0, 3);
      const targetDay = DAY_SHORT.indexOf(dayStr) !== -1 ? DAY_SHORT.indexOf(dayStr) : DAY_NAMES.indexOf(thisDayMatch[1]);
      dateFound = comingWeekday(targetDay); matchedPhrase = thisDayMatch[0];
    }
  }
  if (!dateFound) {
    const bareDayMatch = t.match(/\b(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (bareDayMatch) { const targetDay = DAY_NAMES.indexOf(bareDayMatch[1]); dateFound = comingWeekday(targetDay); matchedPhrase = bareDayMatch[0]; }
  }
  if (!dateFound) {
    const inAMatch = t.match(/\bin\s+a\s+(day|week|month|fortnight)\b/);
    if (inAMatch) {
      const unit = inAMatch[1];
      if (unit === 'day') dateFound = addDays(now, 1);
      else if (unit === 'week') dateFound = addDays(now, 7);
      else if (unit === 'month') { const d = new Date(now); d.setMonth(d.getMonth()+1); dateFound = d; }
      else if (unit === 'fortnight') dateFound = addDays(now, 14);
      matchedPhrase = inAMatch[0];
    }
  }
  if (!dateFound) {
    const weeksTimeMatch = t.match(/\b(\d+|a|one|two|three|four|five|six|seven|eight)\s+(day|days|week|weeks|month|months)(?:\'s|s')?\s+time\b/);
    if (weeksTimeMatch) {
      const wordNums = {a:1,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8};
      const n = isNaN(+weeksTimeMatch[1]) ? (wordNums[weeksTimeMatch[1]] || 1) : +weeksTimeMatch[1];
      const unit = weeksTimeMatch[2];
      if (unit.startsWith('day')) dateFound = addDays(now, n);
      else if (unit.startsWith('week')) dateFound = addDays(now, n * 7);
      else if (unit.startsWith('month')) { const d = new Date(now); d.setMonth(d.getMonth()+n); dateFound = d; }
      matchedPhrase = weeksTimeMatch[0];
    }
  }
  if (!dateFound) {
    const wordNumMatch = t.match(/\bin\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(day|days|week|weeks|month|months)\b/);
    if (wordNumMatch) {
      const nums = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
      const n = nums[wordNumMatch[1]] || 1, unit = wordNumMatch[2];
      if (unit.startsWith('day')) dateFound = addDays(now, n);
      else if (unit.startsWith('week')) dateFound = addDays(now, n * 7);
      else if (unit.startsWith('month')) { const d = new Date(now); d.setMonth(d.getMonth()+n); dateFound = d; }
      matchedPhrase = wordNumMatch[0];
    }
  }
  if (!dateFound && /\b(over\s+the\s+)?weekend\b/.test(t)) {
    const d = new Date(now); const daysUntilSat = (6 - now.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + daysUntilSat); dateFound = d; matchedPhrase = 'weekend';
  }
  if (!dateFound && /\bnext\s+(semester|term)\b/.test(t)) { dateFound = addDays(now, 90); matchedPhrase = 'next semester/term'; }
  if (!dateFound && /\b(asap|as soon as possible|urgently|urgent)\b/.test(t)) { dateFound = new Date(now); matchedPhrase = 'ASAP'; }
  if (!dateFound && /\b(by\s+)?(end\s+of\s+(the\s+)?day|by\s+tonight|by\s+close\s+of\s+day|by\s+eod)\b/.test(t)) { dateFound = new Date(now); matchedPhrase = 'end of day'; }

  let cleanTask = text;
  if (matchedPhrase) {
    const prefixes = ['by next','by this','by','due next','due this','due','before','until','on','for','at','submit by','finish by','complete by','hand in by','hand in on','submitted by','due in','in'];
    let cleaned = text;
    for (const pre of prefixes) {
      const regex = new RegExp('\\s*\\b' + pre + '\\s+' + matchedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b\\s*', 'gi');
      cleaned = cleaned.replace(regex, ' ');
    }
    const direct = new RegExp('\\s*\\b' + matchedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b\\s*', 'gi');
    cleaned = cleaned.replace(direct, ' ');
    cleanTask = cleaned.trim().replace(/\s+/g, ' ').replace(/[,;:]+$/, '').trim();
    if (!cleanTask) cleanTask = text.trim();
  }
  return { date: dateFound && !isNaN(dateFound) ? toYMD(dateFound) : null, task: cleanTask, matched: matchedPhrase };
}

function addTodo() {
  const input = document.getElementById('todo-input');
  const raw = input.value.trim();
  if (!raw) return;
  const statusEl = document.getElementById('todo-ai-status');
  statusEl.className = 'todo-ai-status';
  const result = parseNaturalDate(raw);
  const parsedDate = result.date;
  const parsedTask = result.task || raw;
  if (parsedDate) {
    const displayDate = new Date(parsedDate + 'T12:00:00').toLocaleDateString('en-AU', {weekday:'short', day:'numeric', month:'short', year:'numeric'});
    statusEl.textContent = `✓ Date detected: ${displayDate}`;
  } else {
    statusEl.textContent = 'No date found — you can set one manually below.';
  }
  const todo = { id: Date.now(), task: parsedTask, raw: raw, date: parsedDate, done: false, created: getTodayStr() };
  todos.unshift(todo);
  saveTodos();
  renderTodos();
  if (parsedDate && notificationsEnabled) scheduleTodoNotif(todo);
  input.value = '';
  setTimeout(() => { statusEl.textContent = ''; }, 5000);
}

function scheduleTodoNotif(todo) {
  const now = new Date();
  const due = new Date(todo.date + 'T08:00:00');
  const dayBefore = new Date(due - 86400000);
  [[due, 'Due today'], [dayBefore, 'Due tomorrow']].forEach(([t, label]) => {
    const delay = t - now;
    if (delay > 0) setTimeout(() => {
      if (notificationsEnabled && !todo.done) new Notification(`📋 ${label}: ${todo.task}`, { tag: 'todo-' + todo.id + label });
    }, delay);
  });
}
function toggleTodo(id) { const t = todos.find(t => t.id === id); if (t) { t.done = !t.done; saveTodos(); renderTodos(); } }
function deleteTodo(id) { todos = todos.filter(t => t.id !== id); saveTodos(); renderTodos(); }
function setTodoDate(id, val) {
  const t = todos.find(t => t.id === id);
  if (t) {
    t.date = val || null; if (val) t.dateManuallySet = true; saveTodos(); renderTodos();
    if (t.date && notificationsEnabled) scheduleTodoNotif(t);
    document.getElementById('todo-ai-status').textContent = val ? `✓ Date set: ${new Date(val + 'T12:00:00').toLocaleDateString('en-AU', {weekday:'short', day:'numeric', month:'short'})}` : 'Date cleared.';
  }
}

function renderTodos() {
  const container = document.getElementById('todo-list');
  if (!todos.length) { container.innerHTML = '<div class="todo-empty">Nothing here yet.<br>Type a task above!</div>'; return; }
  const todayStr = getTodayStr();
  const active = todos.filter(t => !t.done);
  const done = todos.filter(t => t.done);
  active.sort((a, b) => {
    if (!a.date && !b.date) return 0; if (!a.date) return 1; if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
  let html = '';
  active.forEach(todo => { html += renderTodoItem(todo, todayStr); });
  if (done.length) { html += `<div class="todo-section-label">Completed (${done.length})</div>`; done.slice(0, 5).forEach(todo => { html += renderTodoItem(todo, todayStr); }); }
  container.innerHTML = html;
  container.querySelectorAll('.todo-check').forEach(el => { el.addEventListener('click', () => toggleTodo(+el.dataset.id)); });
  container.querySelectorAll('.todo-delete').forEach(el => { el.addEventListener('click', () => deleteTodo(+el.dataset.id)); });
  container.querySelectorAll('.todo-date-input').forEach(el => { el.addEventListener('change', () => setTodoDate(+el.dataset.id, el.value)); });
}

function renderTodoItem(todo, todayStr) {
  let dueClass = 'no-date', dueLabel = 'No date';
  if (todo.date) {
    if (todo.date < todayStr) { dueClass = 'overdue'; dueLabel = '⚠ Overdue'; }
    else if (todo.date === todayStr) { dueClass = 'today-due'; dueLabel = '📌 Due today'; }
    else {
      const diff = Math.round((new Date(todo.date + 'T12:00:00') - new Date(todayStr + 'T12:00:00')) / 86400000);
      dueClass = 'has-date';
      dueLabel = diff === 1 ? 'Due tomorrow' : `Due ${new Date(todo.date + 'T12:00:00').toLocaleDateString('en-AU', {weekday:'short', day:'numeric', month:'short'})}`;
    }
  }
  return `<div class="todo-item${todo.done ? ' done' : ''}" data-id="${todo.id}">
    <div class="todo-item-top">
      <div class="todo-check${todo.done ? ' checked' : ''}" data-id="${todo.id}">${todo.done ? '✓' : ''}</div>
      <div class="todo-task">${escHtml(todo.task)}</div>
      <button class="todo-delete" data-id="${todo.id}" title="Delete">✕</button>
    </div>
    <span class="todo-due ${dueClass}">${dueLabel}</span>
    ${!todo.date && !todo.done ? `<div class="todo-date-pick"><label>Set date:</label><input type="date" class="todo-date-input" data-id="${todo.id}" value=""></div>` : ''}
  </div>`;
}

function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

renderTodos();
todos.forEach(t => { if (t.date && !t.done && notificationsEnabled) scheduleTodoNotif(t); });

// ══════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════
let weekStartDay = 1;
function openSettings() {
  const el = document.getElementById('settings-event-count'); if (el) el.textContent = events.length;
  loadRotationSettings();
  // Populate ICS import calendar picker
  const calSel = document.getElementById('ics-import-calendar');
  if (calSel) {
    calSel.innerHTML = calendars.filter(c => !c.system).map(c =>
      `<option value="${c.id}">${c.name}</option>`
    ).join('');
    if (!calSel.options.length) calSel.innerHTML = '<option value="all">Default</option>';
  }
  document.getElementById('settings-overlay').classList.add('open');
}
function closeSettings() { document.getElementById('settings-overlay').classList.remove('open'); }
function closeSettingsOutside(e) { if (e.target === document.getElementById('settings-overlay')) closeSettings(); }

function setTheme(theme, el) {
  document.body.setAttribute('data-theme', theme === 'default' ? '' : theme);
  document.querySelectorAll('.theme-swatch,.custom-theme-swatch').forEach(s => s.classList.remove('active'));
  if (el) el.classList.add('active');
  try { const p = JSON.parse(localStorage.getItem('bgs_prefs') || '{}'); p.theme = theme; localStorage.setItem('bgs_prefs', JSON.stringify(p)); } catch(e) {}
  // Update current theme label in settings
  const lbl = document.getElementById('current-theme-label');
  if (lbl) {
    const t = ALL_BUILTIN_THEMES ? ALL_BUILTIN_THEMES.find(t => t.id === theme) : null;
    lbl.textContent = 'Current: ' + (t ? t.name : theme === 'default' ? 'Classic' : theme);
  }
}

// ══════════════════════════════════════════════════
// CUSTOM THEMES
// ══════════════════════════════════════════════════
let customThemes = JSON.parse(localStorage.getItem('tom_custom_themes') || '[]');
let editingCustomTheme = null;
function saveCustomThemes() { localStorage.setItem('tom_custom_themes', JSON.stringify(customThemes)); }
function themeToCSS(t) { return `[data-theme="${t.id}"]{--ink:${t.ink};--paper:${t.paper};--cream:${t.cream};--accent:${t.accent};--gold:${t.gold};--muted:${t.muted};--rule:${t.rule};--surface:${t.surface};--green:${t.accent};--blue:${t.gold};}`; }
function injectCustomThemeCSS(t) {
  const existing = document.getElementById('ct-css-' + t.id); if (existing) existing.remove();
  const style = document.createElement('style'); style.id = 'ct-css-' + t.id; style.textContent = themeToCSS(t); document.head.appendChild(style);
}
// ── THEME GALLERY ─────────────────────────────────
const ALL_BUILTIN_THEMES = [
  {id:'default',name:'Classic',emoji:'📰',grad:'#0f0e0d,#f5f0e8',tags:['light']},
  {id:'dark',name:'Dark',emoji:'🌙',grad:'#1a1612,#e05a4a',tags:['dark']},
  {id:'ocean',name:'Ocean',emoji:'🌊',grad:'#0077b6,#e8f4f8',tags:['light','nature']},
  {id:'forest',name:'Forest',emoji:'🌲',grad:'#4a7c3f,#eef2e8',tags:['light','nature']},
  {id:'midnight',name:'Midnight',emoji:'✨',grad:'#0a0812,#a855f7',tags:['dark','vibrant']},
  {id:'rose',name:'Rose',emoji:'🌸',grad:'#e11d48,#fdf0f2',tags:['light','vibrant']},
  {id:'slate',name:'Slate',emoji:'🔷',grad:'#0f172a,#38bdf8',tags:['dark','vibrant']},
  {id:'sunset',name:'Sunset',emoji:'🌅',grad:'#ea580c,#fff8f0',tags:['light','vibrant']},
  {id:'grape',name:'Grape',emoji:'🍇',grad:'#13001a,#c084fc',tags:['dark','vibrant']},
  {id:'arctic',name:'Arctic',emoji:'🧊',grad:'#0ea5e9,#f0f7ff',tags:['light']},
  {id:'mocha',name:'Mocha',emoji:'☕',grad:'#8b4513,#fdf6ee',tags:['light','nature']},
  {id:'neon',name:'Neon',emoji:'⚡',grad:'#050510,#00ff88',tags:['dark','vibrant']},
  {id:'sand',name:'Sand',emoji:'🏜️',grad:'#c9873a,#f5ead8',tags:['light','nature']},
  {id:'crimson',name:'Crimson',emoji:'🔴',grad:'#1a0008,#ff2d55',tags:['dark','vibrant']},
  {id:'mint',name:'Mint',emoji:'🌱',grad:'#059669,#f0fdf4',tags:['light','nature']},
  {id:'amber',name:'Amber',emoji:'🍯',grad:'#d97706,#fffbeb',tags:['light']},
  {id:'sakura',name:'Sakura',emoji:'🌺',grad:'#db2777,#fff0f5',tags:['light','vibrant']},
  {id:'cobalt',name:'Cobalt',emoji:'🌌',grad:'#060c1a,#4d8bff',tags:['dark','vibrant']},
  {id:'linen',name:'Linen',emoji:'📜',grad:'#9c7248,#faf6f0',tags:['light','nature']},
  {id:'aurora',name:'Aurora',emoji:'🌠',grad:'#050e14,#00e5b0',tags:['dark','vibrant']},
  {id:'tangerine',name:'Tangerine',emoji:'🍊',grad:'#ff6b00,#fff8f0',tags:['light','vibrant']},
  {id:'bubblegum',name:'Bubblegum',emoji:'🩷',grad:'#ff2d78,#fff0f8',tags:['light','vibrant']},
  {id:'peacock',name:'Peacock',emoji:'🦚',grad:'#00b8a0,#e8fffd',tags:['light','vibrant','nature']},
  {id:'mango',name:'Mango',emoji:'🥭',grad:'#e8a000,#fffaec',tags:['light','vibrant']},
  {id:'violet',name:'Violet',emoji:'💜',grad:'#0d0020,#9b59ff',tags:['dark','vibrant']},
  {id:'flamingo',name:'Flamingo',emoji:'🦩',grad:'#f0408a,#fff5fb',tags:['light','vibrant']},
  {id:'emerald',name:'Emerald',emoji:'💚',grad:'#00a848,#edfff4',tags:['light','vibrant','nature']},
  {id:'copper',name:'Copper',emoji:'🔶',grad:'#c86020,#fdf4ec',tags:['light','nature']},
  {id:'indigo',name:'Indigo',emoji:'🫐',grad:'#080818,#6670ff',tags:['dark','vibrant']},
  {id:'pistachio',name:'Pistachio',emoji:'🌿',grad:'#5aaa20,#f4fded',tags:['light','nature']},
  {id:'terracotta',name:'Terracotta',emoji:'🏺',grad:'#c04830,#fdf2ed',tags:['light','nature']},
  {id:'cobalt2',name:'Deep Sea',emoji:'🐋',grad:'#001228,#0080ff',tags:['dark','vibrant']},
  {id:'marigold',name:'Marigold',emoji:'🌻',grad:'#e8a800,#fffbec',tags:['light','vibrant']},
  {id:'plum',name:'Plum',emoji:'🍑',grad:'#100018,#cc44ff',tags:['dark','vibrant']},
  {id:'seafoam',name:'Seafoam',emoji:'🫧',grad:'#00b888,#edfff8',tags:['light','nature']},
  {id:'ruby',name:'Ruby',emoji:'💎',grad:'#180008,#ff2040',tags:['dark','vibrant']},
  {id:'moss2',name:'Moss',emoji:'🪴',grad:'#487828,#f2f8ed',tags:['light','nature']},
  {id:'dusk',name:'Dusk',emoji:'🌆',grad:'#100820,#c880ff',tags:['dark','vibrant']},
  {id:'lagoon',name:'Lagoon',emoji:'🏝️',grad:'#00b8d8,#e8feff',tags:['light','vibrant','nature']},
  {id:'saffron',name:'Saffron',emoji:'🌶️',grad:'#e05800,#fff8ec',tags:['light','vibrant']},
];

let themeGalleryFilter = 'all';

function openThemeGallery() {
  renderThemeGallery();
  document.getElementById('theme-gallery-overlay').classList.add('open');
}
function closeThemeGallery(e) { if (e.target === document.getElementById('theme-gallery-overlay')) closeThemeGalleryDirect(); }
function closeThemeGalleryDirect() { document.getElementById('theme-gallery-overlay').classList.remove('open'); }

function filterThemeGallery(filter, el) {
  themeGalleryFilter = filter;
  document.querySelectorAll('#theme-gallery-overlay .pill').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderThemeGallery();
}

function renderThemeGallery() {
  const grid = document.getElementById('theme-gallery-grid');
  const prefs = JSON.parse(localStorage.getItem('bgs_prefs') || '{}');
  const currentTheme = prefs.theme || 'default';
  const filtered = themeGalleryFilter === 'all'
    ? ALL_BUILTIN_THEMES
    : ALL_BUILTIN_THEMES.filter(t => t.tags.includes(themeGalleryFilter));
  grid.innerHTML = filtered.map(t => {
    const [c1, c2] = t.grad.split(',');
    const isActive = t.id === currentTheme;
    return `<div class="theme-swatch${isActive ? ' active' : ''}" data-theme="${t.id}"
      onclick="setThemeFromGallery('${t.id}', '${t.name}')"
      style="cursor:pointer;padding:8px;border-radius:12px;text-align:center;background:var(--surface);border:2px solid ${isActive ? 'var(--accent)' : 'var(--rule)'};">
      <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,${c1} 50%,${c2} 50%);margin:0 auto 6px;font-size:1.4rem;display:flex;align-items:center;justify-content:center;">${t.emoji}</div>
      <div style="font-family:'DM Mono',monospace;font-size:0.58rem;letter-spacing:0.5px;color:var(--ink)">${t.name}</div>
    </div>`;
  }).join('');
}

function setThemeFromGallery(themeId, themeName) {
  setTheme(themeId, null);
  const lbl = document.getElementById('current-theme-label');
  if (lbl) lbl.textContent = 'Current: ' + themeName;
  renderThemeGallery(); // refresh active state
}

// ── THEME ROTATION ────────────────────────────────
let rotationTimer = null;

function getRotationSettings() {
  try { return JSON.parse(localStorage.getItem('tom_rotation') || '{}'); } catch(e) { return {}; }
}
function saveRotationSettings() {
  const mode = document.getElementById('rotation-mode').value;
  const interval = document.getElementById('rotation-interval').value;
  const r = getRotationSettings();
  r.mode = mode;
  r.interval = interval;
  localStorage.setItem('tom_rotation', JSON.stringify(r));
  document.getElementById('rotation-sequence-wrap').style.display = mode === 'sequence' ? 'block' : 'none';
  startRotationTimer();
  updateRotationStatus();
}

function loadRotationSettings() {
  const r = getRotationSettings();
  const modeEl = document.getElementById('rotation-mode');
  const intEl = document.getElementById('rotation-interval');
  if (!modeEl) return;
  if (r.mode) modeEl.value = r.mode;
  if (r.interval) intEl.value = r.interval;
  document.getElementById('rotation-sequence-wrap').style.display = r.mode === 'sequence' ? 'block' : 'none';
  renderSequenceList();
  updateRotationStatus();
  startRotationTimer();
}

function updateRotationStatus() {
  const r = getRotationSettings();
  const el = document.getElementById('rotation-status');
  if (!el) return;
  if (!r.mode || r.mode === 'off') { el.textContent = 'Rotation off.'; return; }
  const next = getNextRotationTime(r.interval);
  const diff = next - Date.now();
  const mins = Math.round(diff/60000);
  const hrs = Math.round(diff/3600000);
  const days = Math.round(diff/86400000);
  let timeStr = mins < 60 ? `${mins}m` : hrs < 24 ? `${hrs}h` : `${days}d`;
  el.textContent = `Next rotation in ~${timeStr} · ${r.mode === 'random' ? 'random' : 'sequence'}`;
}

function getNextRotationTime(interval) {
  const now = new Date();
  switch(interval) {
    case 'hourly':  { const n = new Date(now); n.setMinutes(0,0,0); n.setHours(n.getHours()+1); return n; }
    case 'daily':   { const n = new Date(now); n.setHours(0,0,0,0); n.setDate(n.getDate()+1); return n; }
    case 'weekly':  { const n = new Date(now); n.setHours(0,0,0,0); n.setDate(n.getDate()+(7-n.getDay())%7||7); return n; }
    case 'monthly': { const n = new Date(now.getFullYear(), now.getMonth()+1, 1); return n; }
    case 'yearly':  { const n = new Date(now.getFullYear()+1, 0, 1); return n; }
    default: return new Date(now.getTime() + 3600000);
  }
}

function getIntervalMs(interval) {
  switch(interval) {
    case 'hourly':  return 3600000;
    case 'daily':   return 86400000;
    case 'weekly':  return 604800000;
    case 'monthly': return 30*86400000;
    case 'yearly':  return 365*86400000;
    default: return 3600000;
  }
}

function startRotationTimer() {
  if (rotationTimer) clearTimeout(rotationTimer);
  const r = getRotationSettings();
  if (!r.mode || r.mode === 'off') return;
  const next = getNextRotationTime(r.interval);
  const delay = Math.max(next - Date.now(), 1000);
  rotationTimer = setTimeout(() => {
    applyNextTheme();
    startRotationTimer(); // reschedule
  }, delay);
}

function applyNextTheme() {
  const r = getRotationSettings();
  const allIds = ALL_BUILTIN_THEMES.map(t => t.id);
  const prefs = JSON.parse(localStorage.getItem('bgs_prefs') || '{}');
  const current = prefs.theme || 'default';
  let nextTheme;
  if (r.mode === 'random') {
    const others = allIds.filter(id => id !== current);
    nextTheme = others[Math.floor(Math.random() * others.length)];
  } else if (r.mode === 'sequence') {
    const seq = r.sequence || [];
    if (!seq.length) return;
    const idx = seq.indexOf(current);
    nextTheme = seq[(idx + 1) % seq.length];
  }
  if (nextTheme) {
    setTheme(nextTheme, null);
    updateRotationStatus();
    const t = ALL_BUILTIN_THEMES.find(t => t.id === nextTheme);
    const lbl = document.getElementById('current-theme-label');
    if (lbl && t) lbl.textContent = 'Current: ' + t.name;
  }
}

// ── SEQUENCE LIST ──────────────────────────────────
function renderSequenceList() {
  const container = document.getElementById('rotation-sequence-list');
  if (!container) return;
  const r = getRotationSettings();
  const seq = r.sequence || [];
  container.innerHTML = seq.map((id, i) => {
    const t = ALL_BUILTIN_THEMES.find(t => t.id === id);
    if (!t) return '';
    const [c1, c2] = t.grad.split(',');
    return `<div style="display:flex;align-items:center;gap:4px;background:var(--surface);border:1px solid var(--rule);border-radius:8px;padding:4px 8px;font-family:'DM Mono',monospace;font-size:0.6rem;">
      <div style="width:16px;height:16px;border-radius:50%;background:linear-gradient(135deg,${c1} 50%,${c2} 50%);flex-shrink:0;">${t.emoji}</div>
      <span>${t.name}</span>
      <button onclick="removeFromSequence(${i})" style="background:none;border:none;color:var(--muted);cursor:pointer;padding:0 2px;font-size:0.7rem;" title="Remove">✕</button>
    </div>`;
  }).join('');
}

function removeFromSequence(idx) {
  const r = getRotationSettings();
  const seq = r.sequence || [];
  seq.splice(idx, 1);
  r.sequence = seq;
  localStorage.setItem('tom_rotation', JSON.stringify(r));
  renderSequenceList();
  updateRotationStatus();
}

function openSequenceThemePicker() {
  const grid = document.getElementById('seq-picker-grid');
  const r = getRotationSettings();
  const seq = r.sequence || [];
  grid.innerHTML = ALL_BUILTIN_THEMES.map(t => {
    const [c1, c2] = t.grad.split(',');
    const inSeq = seq.includes(t.id);
    return `<div onclick="addToSequence('${t.id}')" style="cursor:pointer;padding:8px;border-radius:12px;text-align:center;background:var(--surface);border:2px solid ${inSeq ? 'var(--accent)' : 'var(--rule)'};">
      <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,${c1} 50%,${c2} 50%);margin:0 auto 4px;font-size:1.2rem;display:flex;align-items:center;justify-content:center;">${t.emoji}</div>
      <div style="font-family:'DM Mono',monospace;font-size:0.55rem;color:var(--ink)">${t.name}</div>
      ${inSeq ? '<div style="font-size:0.5rem;color:var(--accent);font-family:DM Mono,monospace;">✓ added</div>' : ''}
    </div>`;
  }).join('');
  document.getElementById('seq-picker-overlay').classList.add('open');
}

function addToSequence(id) {
  const r = getRotationSettings();
  if (!r.sequence) r.sequence = [];
  if (!r.sequence.includes(id)) r.sequence.push(id);
  localStorage.setItem('tom_rotation', JSON.stringify(r));
  renderSequenceList();
  updateRotationStatus();
  // Refresh picker to show checkmark
  openSequenceThemePicker();
}

function closeSeqPicker(e) { if (e.target === document.getElementById('seq-picker-overlay')) closeSeqPickerDirect(); }
function closeSeqPickerDirect() { document.getElementById('seq-picker-overlay').classList.remove('open'); }

// ── CUSTOM THEME TAB SWITCHING ─────────────────────
function switchCtTab(tab) {
  const editorPane = document.getElementById('ct-editor-pane');
  const guidePane = document.getElementById('ct-guide-pane');
  const editBtn = document.getElementById('ct-tab-edit');
  const guideBtn = document.getElementById('ct-tab-guide');
  if (tab === 'edit') {
    editorPane.style.display = 'block';
    guidePane.style.display = 'none';
    editBtn.style.borderBottomColor = 'var(--accent)';
    editBtn.style.color = 'var(--accent)';
    guideBtn.style.borderBottomColor = 'transparent';
    guideBtn.style.color = 'var(--muted)';
  } else {
    editorPane.style.display = 'none';
    guidePane.style.display = 'block';
    guideBtn.style.borderBottomColor = 'var(--accent)';
    guideBtn.style.color = 'var(--accent)';
    editBtn.style.borderBottomColor = 'transparent';
    editBtn.style.color = 'var(--muted)';
  }
}

function renderCustomThemeSwatches() {
  const container = document.getElementById('custom-theme-swatches'); if (!container) return;
  container.innerHTML = customThemes.map((t, i) =>
    `<div class="custom-theme-swatch theme-swatch" data-theme="${t.id}" onclick="setTheme('${t.id}', this)">
      <div class="swatch-circle" style="background:linear-gradient(135deg,${t.paper} 50%,${t.accent} 50%)" title="${t.name}">${t.emoji || '🎨'}</div>
      <div class="swatch-label" style="display:flex;align-items:center;gap:3px">${t.name}<span style="cursor:pointer;opacity:0.5;font-size:0.6rem" onclick="event.stopPropagation();openCustomThemeEditor(${i})" title="Edit">✏️</span></div>
    </div>`
  ).join('');
  customThemes.forEach(injectCustomThemeCSS);
}
function openCustomThemeEditor(editIdx) {
  editingCustomTheme = editIdx != null ? editIdx : null;
  const t = editIdx != null ? customThemes[editIdx] : null;
  document.getElementById('ct-name').value = t ? t.name : '';
  document.getElementById('ct-emoji').value = t ? (t.emoji || '') : '';
  document.getElementById('ct-paper').value = t ? t.paper : '#f5f0e8';
  document.getElementById('ct-surface').value = t ? t.surface : '#ffffff';
  document.getElementById('ct-cream').value = t ? t.cream : '#ede7d6';
  document.getElementById('ct-ink').value = t ? t.ink : '#0f0e0d';
  document.getElementById('ct-accent').value = t ? t.accent : '#c0392b';
  document.getElementById('ct-gold').value = t ? t.gold : '#b8860b';
  document.getElementById('ct-muted').value = t ? t.muted : '#7a7060';
  document.getElementById('ct-rule').value = t ? t.rule : '#d4ccbb';
  document.getElementById('ct-modal-title').textContent = t ? 'Edit Custom Theme' : 'Create Custom Theme';
  document.getElementById('ct-save-btn').textContent = t ? 'Save Changes' : 'Save Theme';
  document.getElementById('ct-delete-btn').style.display = t ? 'inline-flex' : 'none';
  document.getElementById('ct-import-input-wrap').style.display = 'none';
  updateThemePreview(); generateThemeShareCode();
  document.getElementById('custom-theme-overlay').classList.add('open');
}
function closeCustomTheme(e) { if (e.target === document.getElementById('custom-theme-overlay')) closeCustomThemeDirect(); }
function closeCustomThemeDirect() { document.getElementById('custom-theme-overlay').classList.remove('open'); }
function getThemeFormValues() {
  return { name: document.getElementById('ct-name').value.trim() || 'My Theme', emoji: document.getElementById('ct-emoji').value.trim() || '🎨',
    paper: document.getElementById('ct-paper').value, surface: document.getElementById('ct-surface').value,
    cream: document.getElementById('ct-cream').value, ink: document.getElementById('ct-ink').value,
    accent: document.getElementById('ct-accent').value, gold: document.getElementById('ct-gold').value,
    muted: document.getElementById('ct-muted').value, rule: document.getElementById('ct-rule').value };
}
function updateThemePreview() {
  const v = getThemeFormValues(); const h = document.getElementById('ct-prev-header'); if (!h) return;
  h.style.cssText = `padding:10px 14px;display:flex;align-items:center;justify-content:space-between;background:${v.ink};border-bottom:2px solid ${v.accent}`;
  document.getElementById('ct-prev-title').style.cssText = `font-family:'Playfair Display',serif;font-weight:700;font-size:1rem;color:${v.paper}`;
  document.getElementById('ct-prev-title').textContent = (v.emoji ? v.emoji + ' ' : '') + (v.name || 'My Theme');
  document.getElementById('ct-prev-btn1').style.cssText = `padding:4px 10px;border-radius:7px;font-family:DM Mono,monospace;font-size:0.58rem;letter-spacing:1px;background:transparent;border:1px solid rgba(255,255,255,0.3);color:${v.paper}`;
  document.getElementById('ct-prev-btn2').style.cssText = `padding:4px 10px;border-radius:7px;font-family:DM Mono,monospace;font-size:0.58rem;letter-spacing:1px;background:${v.accent};color:white;border:none`;
  document.getElementById('ct-prev-body').style.cssText = `padding:12px 14px;display:flex;gap:10px;background:${v.paper}`;
  document.getElementById('ct-prev-sidebar').style.cssText = `width:90px;border-radius:8px;padding:8px;font-family:DM Mono,monospace;font-size:0.58rem;background:${v.cream};color:${v.ink}`;
  document.getElementById('ct-prev-cal1').style.cssText = `padding:4px 6px;border-radius:5px;margin-bottom:3px;background:${v.surface};color:${v.ink}`;
  [1,2,3].forEach(n => { const cell = document.getElementById('ct-prev-cell' + n); if (cell) cell.style.cssText = `border-radius:8px;padding:6px;border:1px solid ${v.rule};background:${v.surface}`; });
  const chip = document.getElementById('ct-prev-chip');
  if (chip) chip.style.cssText = `border-radius:4px;padding:2px 5px;font-size:0.55rem;border-left:3px solid ${v.accent};background:${v.accent}22;color:${v.accent};font-family:DM Mono,monospace`;
  generateThemeShareCode();
}
function generateThemeShareCode() {
  const v = getThemeFormValues();
  const id = editingCustomTheme != null ? customThemes[editingCustomTheme].id : ('ct_' + Date.now());
  const themeObj = { ...v, id };
  const code = 'TC1:' + btoa(unescape(encodeURIComponent(JSON.stringify(themeObj))));
  const el = document.getElementById('ct-share-code'); if (el) el.value = code;
  return code;
}
function copyThemeCode() {
  const code = generateThemeShareCode();
  navigator.clipboard.writeText(code).then(() => {
    document.querySelectorAll('#custom-theme-overlay .settings-action-btn.secondary').forEach(b => {
      if (b.textContent.includes('Copy')) { b.textContent = '✅ Copied!'; setTimeout(() => b.textContent = '📋 Copy', 2000); }
    });
  });
}
function importThemeCode() { const wrap = document.getElementById('ct-import-input-wrap'); wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none'; }
function applyImportedThemeCode() {
  const raw = document.getElementById('ct-import-input').value.trim();
  if (!raw.startsWith('TC1:')) { alert('Invalid theme code. It should start with "TC1:"'); return; }
  try {
    const t = JSON.parse(decodeURIComponent(escape(atob(raw.slice(4)))));
    if (!t.name || !t.accent || !t.paper) throw new Error();
    t.id = 'ct_' + Date.now();
    document.getElementById('ct-name').value = t.name; document.getElementById('ct-emoji').value = t.emoji || '';
    document.getElementById('ct-paper').value = t.paper; document.getElementById('ct-surface').value = t.surface || '#ffffff';
    document.getElementById('ct-cream').value = t.cream || t.paper; document.getElementById('ct-ink').value = t.ink;
    document.getElementById('ct-accent').value = t.accent; document.getElementById('ct-gold').value = t.gold || t.accent;
    document.getElementById('ct-muted').value = t.muted || '#888'; document.getElementById('ct-rule').value = t.rule || '#ccc';
    document.getElementById('ct-import-input-wrap').style.display = 'none';
    updateThemePreview();
  } catch(e) { alert('Could not read theme code — it may be corrupted.'); }
}
function saveCustomTheme() {
  const v = getThemeFormValues(); if (!v.name) { document.getElementById('ct-name').focus(); return; }
  const id = editingCustomTheme != null ? customThemes[editingCustomTheme].id : ('ct_' + Date.now());
  const themeObj = { ...v, id };
  if (editingCustomTheme != null) { customThemes[editingCustomTheme] = themeObj; } else { customThemes.push(themeObj); }
  saveCustomThemes(); injectCustomThemeCSS(themeObj); renderCustomThemeSwatches();
  setTheme(id, null); closeCustomThemeDirect();
}
function deleteCustomTheme() {
  if (editingCustomTheme == null) return;
  if (!confirm('Delete this custom theme?')) return;
  const t = customThemes[editingCustomTheme];
  customThemes.splice(editingCustomTheme, 1);
  saveCustomThemes();
  const styleEl = document.getElementById('ct-css-' + t.id); if (styleEl) styleEl.remove();
  renderCustomThemeSwatches();
  setTheme('default', document.querySelector('.theme-swatch[data-theme="default"]'));
  closeCustomThemeDirect();
}
customThemes.forEach(injectCustomThemeCSS);
renderCustomThemeSwatches();
startRotationTimer();

// ══════════════════════════════════════════════════
// ICS EXPORT / IMPORT
// ══════════════════════════════════════════════════
function exportICS() {
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Tom Calendar//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  const stamp = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';
  events.forEach((ev, i) => {
    const dtStr = ev.date.replace(/-/g,'');
    lines.push('BEGIN:VEVENT','UID:tomcal-' + ev.date + '-' + i + '@tomcalendar','DTSTAMP:' + stamp);
    lines.push('SUMMARY:' + icsEsc('[' + ev.subject + '] ' + ev.title),'DESCRIPTION:' + icsEsc(ev.desc || ''),'CATEGORIES:' + icsEsc(ev.type || 'Event'));
    if (ev.allDay || ev.startHour == null) { lines.push('DTSTART;VALUE=DATE:' + dtStr,'DTEND;VALUE=DATE:' + dtStr); }
    else {
      const sh = String(ev.startHour).padStart(2,'0'), eh = String(ev.endHour || ev.startHour + 1).padStart(2,'0');
      lines.push('DTSTART;TZID=Australia/Brisbane:' + dtStr + 'T' + sh + '0000','DTEND;TZID=Australia/Brisbane:' + dtStr + 'T' + eh + '0000');
    }
    lines.push('BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY','DESCRIPTION:Reminder: ' + icsEsc(ev.title),'END:VALARM','END:VEVENT');
  });
  todos.filter(t => t.date && !t.done).forEach(t => {
    const dtStr = t.date.replace(/-/g,'');
    lines.push('BEGIN:VEVENT','UID:tomcal-todo-' + t.id + '@tomcalendar','DTSTAMP:' + stamp);
    lines.push('SUMMARY:' + icsEsc('✓ ' + t.task),'DESCRIPTION:To-do item','DTSTART;VALUE=DATE:' + dtStr,'DTEND;VALUE=DATE:' + dtStr);
    lines.push('BEGIN:VALARM','TRIGGER:-P1D','ACTION:DISPLAY','DESCRIPTION:Due: ' + icsEsc(t.task),'END:VALARM','END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  downloadFile('TomCalendar.ics', lines.join('\r\n'), 'text/calendar;charset=utf-8');
  gcalStatus('✅ Exported ' + events.length + ' events.');
}
function icsEsc(s) { return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n'); }
function importICS(input) {
  const file = input.files[0]; if (!file) return;
  const calSel = document.getElementById('ics-import-calendar');
  const targetCalId = calSel ? calSel.value : 'all';
  const reader = new FileReader();
  reader.onload = (e) => {
    const imported = parseICS(e.target.result); let added = 0;
    const targetCal = calendars.find(c => c.id === targetCalId);
    imported.forEach(ev => {
      ev.calendarId = targetCalId;
      ev.subject = targetCal ? targetCal.name : 'Imported';
      ev.color = ev.color || (targetCal ? targetCal.color : '#6366f1');
      if (!events.some(x => x.date === ev.date && x.title === ev.title)) { events.push(ev); added++; }
    });
    // Merge consecutive same-title events on same day (double/triple periods)
    events.sort((a,b) => a.date.localeCompare(b.date) || (a.startHour||0) - (b.startHour||0));
    const toRemove = new Set();
    for (let i = 0; i < events.length - 1; i++) {
      const a = events[i], b = events[i+1];
      if (a.date === b.date && a.title === b.title && !a.allDay && !b.allDay
          && a.calendarId === b.calendarId && a.endHour === b.startHour) {
        a.endHour = b.endHour;
        toRemove.add(i+1);
      }
    }
    if (toRemove.size) {
      events = events.filter((_,i) => !toRemove.has(i));
      saveEvents();
    }
    buildFilters(); render(); saveEvents(); gcalStatus('✅ Imported ' + added + ' new events.');
  };
  reader.readAsText(file); input.value = '';
}
function parseICS(text) {
  const out = [];
  // Unfold lines (ICS wraps long lines with CRLF + whitespace)
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');

  function parseICSDate(raw, tzid) {
    const val = raw.trim();
    const isUTC = val.endsWith('Z');
    const bare = val.replace(/Z$/, '');
    const isDateTime = bare.length > 8 && bare[8] === 'T';
    if (!isDateTime) {
      // Pure date — all day
      return { date: bare.slice(0,4)+'-'+bare.slice(4,6)+'-'+bare.slice(6,8), hour: null, allDay: true };
    }
    // It's a datetime
    const yr = +bare.slice(0,4), mo = +bare.slice(4,6)-1, dy = +bare.slice(6,8);
    const hr = +bare.slice(9,11), mn = +bare.slice(11,13);
    let d;
    if (isUTC) {
      // UTC — add 10 hours for Brisbane (UTC+10, no DST)
      d = new Date(Date.UTC(yr, mo, dy, hr + 10, mn));
      const dateStr = d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
      return { date: dateStr, hour: d.getUTCHours(), allDay: false };
    } else {
      // Already local/Brisbane time — use as-is
      d = new Date(yr, mo, dy, hr, mn);
      const dateStr = yr + '-' + String(mo+1).padStart(2,'0') + '-' + String(dy).padStart(2,'0');
      return { date: dateStr, hour: hr, allDay: false };
    }
  }

  unfolded.split(/BEGIN:VEVENT/i).slice(1).forEach(block => {
    const get = (key) => {
      const m = block.match(new RegExp(key + '[^:\r\n]*:([^\r\n]+)', 'i'));
      return m ? m[1].trim() : '';
    };
    let summary = get('SUMMARY').replace(/^\[.+?\]\s*/, '').replace(/^✓\s*/, '');
    summary = summary.replace(/\\n/g, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');

    const dtStartMatch = block.match(/DTSTART(?:;TZID=([^:\r\n]+))?(?:;[^:\r\n]*)?:([^\r\n]+)/i);
    const dtEndMatch   = block.match(/DTEND(?:;TZID=([^:\r\n]+))?(?:;[^:\r\n]*)?:([^\r\n]+)/i);

    if (!dtStartMatch || !summary) return;
    const tzid = dtStartMatch[1] || '';
    const startInfo = parseICSDate(dtStartMatch[2], tzid);
    let endInfo = null;
    if (dtEndMatch) endInfo = parseICSDate(dtEndMatch[2], dtEndMatch[1] || tzid);

    const date = startInfo.date;
    const allDay = startInfo.allDay;
    const startHour = startInfo.hour;
    const endHour = endInfo && !endInfo.allDay ? endInfo.hour : (startHour != null ? startHour + 1 : null);

    const desc = get('DESCRIPTION').replace(/\\n/g, ' ').replace(/\\,/g, ',');
    if (!date) return;
    out.push({ date, subject:'Imported', title:summary, type:'Event', desc, color:'#6366f1', allDay, ...(allDay ? {} : {startHour, endHour}) });
  });
  return out;
}

// ══════════════════════════════════════════════════
// DATA BACKUP
// ══════════════════════════════════════════════════
function exportAppData() {
  downloadFile('TomCalendar_Backup.json', JSON.stringify({version:1,exported:new Date().toISOString(),events,todos},null,2), 'application/json');
  gcalStatus('✅ Backup saved — ' + events.length + ' events, ' + todos.length + ' todos.');
}
function importAppData(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.events || !Array.isArray(data.events)) throw new Error();
      let addedE = 0, addedT = 0;
      data.events.forEach(ev => { if (!events.some(x=>x.date===ev.date&&x.title===ev.title)) { events.push(ev); addedE++; } });
      if (Array.isArray(data.todos)) { data.todos.forEach(t => { if (!todos.some(x=>x.id===t.id)) { todos.push(t); addedT++; } }); saveTodos(); }
      saveEvents(); buildFilters(); render(); renderTodos();
      gcalStatus('✅ Restored: +' + addedE + ' events, +' + addedT + ' todos.');
    } catch(err) { alert('Could not read backup file.'); }
  };
  reader.readAsText(file); input.value = '';
}
function clearAllData() {
  if (!confirm('Delete ALL events? This cannot be undone.')) return;
  events = []; saveEvents(); activeFilter = 'all'; buildFilters(); render(); gcalStatus('All events cleared.');
}
function resetTermDefaults() {
  if (!confirm('Reset term dates to the 2026 BGS defaults?')) return;
  termConfig = TERM_DEFAULTS.map(t => ({...t}));
  localStorage.setItem('tom_terms', JSON.stringify(termConfig));
  renderTermSettingsRows(); render();
  const el = document.getElementById('term-save-status'); if (el) { el.textContent = '✓ Reset to 2026 defaults!'; setTimeout(() => el.textContent = '', 3000); }
}
function gcalStatus(msg) { const el = document.getElementById('gcal-status'); if (el) { el.textContent = msg; setTimeout(() => el.textContent = '', 6000); } }
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], {type: mimeType}); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ══════════════════════════════════════════════════
// SEARCH
// ══════════════════════════════════════════════════
let searchQuery = '';
function onSearch(val) {
  searchQuery = val.trim().toLowerCase();
  const clearBtn = document.getElementById('search-clear'); if (clearBtn) clearBtn.style.display = searchQuery ? 'block' : 'none';
  if (searchQuery) {
    ['calendar-wrap','week-wrap','day-wrap','list-view'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    let wrap = document.getElementById('search-results-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'search-results-wrap'; wrap.className = 'search-results'; const cw = document.getElementById('calendar-wrap'); cw.parentNode.insertBefore(wrap, cw); }
    renderSearchResults(wrap);
  } else { const wrap = document.getElementById('search-results-wrap'); if (wrap) wrap.remove(); setView(currentView); }
}
function clearSearch() { const si = document.getElementById('search-input'); if (si) si.value = ''; onSearch(''); }
function renderSearchResults(wrap) {
  const q = searchQuery;
  const matched = events.filter(ev => ev.title.toLowerCase().includes(q) || ev.subject.toLowerCase().includes(q) || (ev.desc||'').toLowerCase().includes(q) || (ev.type||'').toLowerCase().includes(q)).slice(0, 40);
  function hl(str) { if (!str) return ''; const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi'); return escHtml(str).replace(re, '<mark class="search-hl">$1</mark>'); }
  if (!matched.length) { wrap.innerHTML = '<div class="search-empty">No events match &ldquo;' + escHtml(q) + '&rdquo;</div>'; return; }
  let html = '<div style="font-family:DM Mono,monospace;font-size:0.62rem;color:var(--muted);letter-spacing:2px;text-transform:uppercase;margin-bottom:10px">' + matched.length + ' result' + (matched.length===1?'':'s') + '</div>';
  matched.forEach(ev => {
    const d = new Date(ev.date), dateLabel = d.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short'});
    html += '<div class="search-result-item"><div class="search-result-dot" style="background:' + ev.color + '"></div><div class="search-result-info"><div class="search-result-title">' + hl(ev.title) + '</div><div class="search-result-sub">' + hl(ev.subject) + ' &middot; ' + hl(ev.type) + '</div></div><div class="search-result-date">' + dateLabel + '</div></div>';
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('.search-result-item').forEach((el, i) => { el.addEventListener('click', () => openModal(matched[i])); });
}
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); const si = document.getElementById('search-input'); if (si) { si.focus(); si.select(); } } });

// ══════════════════════════════════════════════════
// APPEARANCE
// ══════════════════════════════════════════════════
function toggleCompact(on) {
  document.body.classList.toggle('compact', on);
  try { const p=JSON.parse(localStorage.getItem('bgs_prefs')||'{}'); p.compact=on; localStorage.setItem('bgs_prefs',JSON.stringify(p)); } catch(e){}
}
function setFontSize(size) {
  const map = {small:'13px', normal:'15px', large:'17px'};
  document.documentElement.style.fontSize = map[size] || '15px';
  document.querySelectorAll('.font-size-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector('.font-size-btn[data-size="' + size + '"]'); if (btn) btn.classList.add('active');
  try { const p=JSON.parse(localStorage.getItem('bgs_prefs')||'{}'); p.fontSize=size; localStorage.setItem('bgs_prefs',JSON.stringify(p)); } catch(e){}
}
function setRadius(val) {
  document.documentElement.style.setProperty('--r', val);
  try { const p=JSON.parse(localStorage.getItem('bgs_prefs')||'{}'); p.radius=val; localStorage.setItem('bgs_prefs',JSON.stringify(p)); } catch(e){}
}

// ══════════════════════════════════════════════════
// LOAD PREFS
// ══════════════════════════════════════════════════
(function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem('bgs_prefs') || '{}');
    if (p.theme) {
      document.body.setAttribute('data-theme', p.theme === 'default' ? '' : p.theme);
      const sw = document.querySelector('.theme-swatch[data-theme="' + p.theme + '"]') || document.querySelector('.custom-theme-swatch[data-theme="' + p.theme + '"]');
      if (sw) { document.querySelectorAll('.theme-swatch,.custom-theme-swatch').forEach(s=>s.classList.remove('active')); sw.classList.add('active'); }
    }
    if (p.weekStartDay != null) weekStartDay = p.weekStartDay;
    if (p.weekStartHour) { weekStartHour = p.weekStartHour; const s=document.getElementById('start-hour-sel'); if(s)s.value=weekStartHour; }
    if (p.weekEndHour)   { weekEndHour   = p.weekEndHour;   const s=document.getElementById('end-hour-sel');   if(s)s.value=weekEndHour; }
    if (p.compact) { document.body.classList.add('compact'); const chk=document.getElementById('compact-chk'); if(chk)chk.checked=true; }
    if (p.fontSize) setFontSize(p.fontSize);
    if (p.radius)   { document.documentElement.style.setProperty('--r', p.radius); const sel=document.getElementById('radius-sel'); if(sel)sel.value=p.radius; }
  } catch(e) {}
}());
