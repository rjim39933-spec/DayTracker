// SUPABASE CONFIG
const supabaseUrl = 'https://tkbijfqmxzliqjzurklf.supabase.co';
const supabaseKey = 'sb_publishable_EsuTrrfwwTRwGcxDH0bbCQ_VxnCU5I3';
const sb = supabase.createClient(supabaseUrl, supabaseKey);

let currentUser = null;

// AUTH FUNCTIONS
async function handleLogin() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) document.getElementById('auth-error').textContent = error.message;
    else initApp();
}
async function handleSignup() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const { error } = await sb.auth.signUp({ email, password });
    if (error) document.getElementById('auth-error').textContent = error.message;
    else alert("Success! Check your email for the confirmation link.");
}
async function handleLogout() { await sb.auth.signOut(); location.reload(); }

// APP INITIALIZATION
async function initApp() {
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
        currentUser = user;
        document.getElementById('auth-overlay').style.display = 'none';
        document.getElementById('app-content').style.display = 'block';
        await loadCloudData();
    }
}

async function loadCloudData() {
    const { data } = await sb.from('events').select('*');
    if (data) events = data;
    render();
}

// ATTACH TO WINDOW (Fixes settings button and others)
window.handleLogin = handleLogin; window.handleSignup = handleSignup; window.handleLogout = handleLogout;
window.openSettings = () => document.getElementById('settings-overlay').classList.add('open');
window.closeSettings = () => document.getElementById('settings-overlay').classList.remove('open');
window.closeSettingsOutside = (e) => { if(e.target.id==='settings-overlay') window.closeSettings(); };
window.openAddEvent = (d) => { document.getElementById('ae-date').value = d || ""; document.getElementById('add-event-overlay').classList.add('open'); };
window.closeAddEventDirect = () => document.getElementById('add-event-overlay').classList.remove('open');
window.setView = (v) => {
    currentView = v;
    ['calendar-wrap','week-wrap','day-wrap','list-view'].forEach(id => {
        const el = document.getElementById(id); if(el) el.style.display = (id === v || id === v+'-wrap') ? 'block' : 'none';
    });
    render();
};
window.goToToday = () => { currentDate = new Date(); render(); };
window.navigatePrev = () => { if(currentView==='month') currentDate.setMonth(currentDate.getMonth()-1); render(); };
window.navigateNext = () => { if(currentView==='month') currentDate.setMonth(currentDate.getMonth()+1); render(); };
window.toggleNotifications = () => alert("Notifications requested...");
window.openImport = () => document.getElementById('import-overlay').classList.add('open');
window.closeImport = () => document.getElementById('import-overlay').classList.remove('open');

// --- START ORIGINAL LOGIC ---
let events = JSON.parse(localStorage.getItem('tom_events') || '[]');
let todos = JSON.parse(localStorage.getItem('tom_todos') || '[]');
let currentDate = new Date();
let currentView = 'month';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function render() {
    const lbl = document.getElementById('period-label');
    if(lbl) lbl.textContent = MONTHS[currentDate.getMonth()] + " " + currentDate.getFullYear();
    if(currentView === 'month') renderMonth();
    renderUpcoming();
}

function renderMonth() {
    const grid = document.getElementById('calendar-grid'); grid.innerHTML = '';
    const yr = currentDate.getFullYear(), mo = currentDate.getMonth();
    const dim = new Date(yr, mo+1, 0).getDate();
    const firstDay = new Date(yr, mo, 1).getDay();

    for(let i=0; i<firstDay; i++) { grid.appendChild(document.createElement('div')); }
    for(let d=1; d<=dim; d++) {
        const dateStr = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const cell = document.createElement('div');
        cell.className = 'cal-cell';
        cell.innerHTML = `<div class="day-num">${d}</div>`;
        events.filter(e => e.date === dateStr).forEach(e => {
            cell.innerHTML += `<div class="event-chip" style="border-left-color:${e.color || '#c0392b'}">${e.title}</div>`;
        });
        cell.onclick = () => window.openAddEvent(dateStr);
        grid.appendChild(cell);
    }
}

async function confirmAddEvent() {
    const title = document.getElementById('ae-title').value;
    const date = document.getElementById('ae-date').value;
    const ev = { title, date, user_id: currentUser.id };
    events.push(ev);
    await sb.from('events').insert([ev]);
    render();
    window.closeAddEventDirect();
}
window.confirmAddEvent = confirmAddEvent;

function renderUpcoming() {
    const list = document.getElementById('upcoming-list'); if(!list) return;
    list.innerHTML = events.slice(0, 5).map(e => `<div class="todo-item">${e.title} (${e.date})</div>`).join('');
}

// BOOTSTRAP
initApp();