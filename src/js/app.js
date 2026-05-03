// MediCare — mock client-side app.
// Persistence: data.json is the seed; runtime state lives in localStorage.
// Bump DATA_VERSION when the seed schema changes so old caches reseed.
const MOCK_API_DELAY = 500;
const MOCK_OTP = '123456';
const DATA_VERSION = 3;
const STORAGE_DATA = 'medicare_data';
const STORAGE_VERSION = 'medicare_data_version';
const STORAGE_SESSION = 'medicare_session';

const ROLES = { USER: 'user', DOCTOR: 'doctor', ADMIN: 'admin' };

const PERMISSIONS = {
    user:   { dashboard: true, viewDoctors: true, viewAppointments: true, createAppointments: true, cancelAppointments: true },
    doctor: { doctorDashboard: true, viewAppointments: true },
    admin:  { adminPanel: true, manageUsers: true, manageDoctors: true, manageAppointments: true }
};

let appState = {
    currentUser: null,
    currentView: 'auth',
    users: [],
    doctors: [],
    appointments: []
};

let authState = {
    mode: 'login',
    pendingRegistration: null,
    pendingReset: null
};

// --- Helpers ---
function getEl(id) { return document.getElementById(id); }

function getRole(user) { return (user && user.role) || ROLES.USER; }

function hasPermission(perm) {
    if (!appState.currentUser) return false;
    return !!PERMISSIONS[getRole(appState.currentUser)]?.[perm];
}

function setLoading(btnId, loading, loadingText = 'Please wait...') {
    const btn = getEl(btnId);
    if (!btn) return;
    if (loading) {
        if (!btn.dataset.originalText) btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = `<span class="loader" style="width:16px;height:16px;border-width:2px;"></span> ${loadingText}`;
        btn.disabled = true;
    } else {
        btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
        btn.dataset.originalText = '';
        btn.disabled = false;
    }
}

function showToast(message, type = 'success') {
    const container = getEl('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success'
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

// --- Persistence (mock "DB" via localStorage; data.json is the seed) ---
function persistData() {
    const data = { users: appState.users, doctors: appState.doctors, appointments: appState.appointments };
    localStorage.setItem(STORAGE_DATA, JSON.stringify(data));
    localStorage.setItem(STORAGE_VERSION, String(DATA_VERSION));
}

function persistSession() {
    if (appState.currentUser) {
        localStorage.setItem(STORAGE_SESSION, JSON.stringify({ userId: appState.currentUser.id }));
    } else {
        localStorage.removeItem(STORAGE_SESSION);
    }
}

async function seedFromJson() {
    const response = await fetch('./src/data/data.json');
    if (!response.ok) throw new Error('Failed to load seed data');
    const data = await response.json();
    appState.users = data.users || [];
    appState.doctors = data.doctors || [];
    appState.appointments = data.appointments || [];
    persistData();
}

async function loadData() {
    const savedVersion = parseInt(localStorage.getItem(STORAGE_VERSION) || '0', 10);
    const saved = localStorage.getItem(STORAGE_DATA);
    if (saved && savedVersion === DATA_VERSION) {
        try {
            const data = JSON.parse(saved);
            appState.users = data.users || [];
            appState.doctors = data.doctors || [];
            appState.appointments = data.appointments || [];
        } catch (e) {
            console.error('Corrupt local data, reseeding:', e);
            await seedFromJson();
        }
    } else {
        try { await seedFromJson(); }
        catch (e) {
            console.error('Seed failed:', e);
            appState.users = []; appState.doctors = []; appState.appointments = [];
        }
    }

    // Restore session if any
    const session = localStorage.getItem(STORAGE_SESSION);
    if (session) {
        try {
            const { userId } = JSON.parse(session);
            const user = appState.users.find(u => u.id === userId);
            if (user) {
                appState.currentUser = user;
                redirectByRole(user, false);
                return;
            }
        } catch (e) { /* ignore */ }
    }
    navigateSafe('auth');
}

// --- Navigation ---
function canAccess(view) {
    const role = getRole(appState.currentUser);
    switch (view) {
        case 'auth': return true;
        case 'dashboard': return role === ROLES.USER;
        case 'doctor-dashboard': return role === ROLES.DOCTOR;
        case 'admin': return role === ROLES.ADMIN;
        case 'doctors': return role === ROLES.USER;
        case 'appointments': return role === ROLES.USER || role === ROLES.DOCTOR;
        default: return false;
    }
}

function defaultViewFor(user) {
    const role = getRole(user);
    if (role === ROLES.ADMIN) return 'admin';
    if (role === ROLES.DOCTOR) return 'doctor-dashboard';
    return 'dashboard';
}

function navigate(view) {
    if (view !== 'auth' && !appState.currentUser) {
        navigateSafe('auth');
        return;
    }
    if (!canAccess(view)) {
        showToast('Access denied.', 'error');
        navigateSafe(defaultViewFor(appState.currentUser));
        return;
    }
    navigateSafe(view);
}

function navigateSafe(view) {
    appState.currentView = view;
    const views = ['auth-view', 'dashboard-view', 'doctor-dashboard-view', 'doctors-view', 'appointments-view', 'admin-view'];
    views.forEach(v => getEl(v)?.classList.add('hidden'));
    getEl(`${view}-view`)?.classList.remove('hidden');

    const navbar = getEl('main-nav');
    if (view === 'auth') {
        navbar?.classList.add('hidden');
    } else {
        navbar?.classList.remove('hidden');
        updateNavbar();
    }

    if (view === 'dashboard') initDashboard();
    if (view === 'doctor-dashboard') initDoctorDashboard();
    if (view === 'doctors') renderDoctors();
    if (view === 'appointments') renderAppointments();
    if (view === 'admin') renderAdmin();

    window.scrollTo(0, 0);
}

function goHome() {
    if (appState.currentUser) navigate(defaultViewFor(appState.currentUser));
}

function updateNavbar() {
    const userNameEl = getEl('nav-user-name');
    const adminBtn = getEl('admin-nav-btn');
    if (!appState.currentUser) return;
    const role = getRole(appState.currentUser);
    if (userNameEl) userNameEl.innerText = `${appState.currentUser.name} (${role.toUpperCase()})`;
    if (adminBtn) adminBtn.style.display = role === ROLES.ADMIN ? '' : 'none';
}

function redirectByRole(user, withToast = true) {
    if (withToast) showToast(`Welcome, ${user.name}!`);
    navigate(defaultViewFor(user));
}

// --- Auth tabs ---
function switchAuthTab(tab) {
    authState.mode = tab;
    ['login', 'register', 'forgot'].forEach(t => {
        getEl(`${t}-content`)?.classList.add('hidden');
        getEl(`tab-${t}`)?.classList.remove('active');
    });
    getEl(`${tab}-content`)?.classList.remove('hidden');
    // Forgot has no tab button; mark Login active for visual continuity.
    if (tab === 'forgot') getEl('tab-login')?.classList.add('active');
    else getEl(`tab-${tab}`)?.classList.add('active');

    if (tab === 'register') { showRegStep(1); authState.pendingRegistration = null; }
    if (tab === 'forgot')   { showForgotStep(1); authState.pendingReset = null; }
}

function showRegStep(n) {
    for (let i = 1; i <= 3; i++) getEl(`register-step-${i}`)?.classList.add('hidden');
    getEl(`register-step-${n}`)?.classList.remove('hidden');
}

function showForgotStep(n) {
    for (let i = 1; i <= 3; i++) getEl(`forgot-step-${i}`)?.classList.add('hidden');
    getEl(`forgot-step-${n}`)?.classList.remove('hidden');
}

// --- Login ---
function loginWithPassword() {
    const phone = getEl('login-phone').value.trim();
    const password = getEl('login-password').value;
    if (!phone || !password) { showToast('Enter phone and password', 'error'); return; }

    setLoading('btn-login', true, 'Signing in...');
    setTimeout(() => {
        setLoading('btn-login', false);
        const user = appState.users.find(u => u.phone === phone);
        if (!user || user.password !== password) {
            showToast('Invalid phone or password', 'error');
            return;
        }
        appState.currentUser = user;
        persistSession();
        getEl('login-password').value = '';
        redirectByRole(user);
    }, MOCK_API_DELAY);
}

// --- Registration (phone + password → OTP → profile) ---
function startRegistration() {
    const phone = getEl('reg-phone').value.trim();
    const password = getEl('reg-password').value;
    const confirm = getEl('reg-confirm-password').value;

    if (!phone || phone.length < 5) { showToast('Enter a valid phone number', 'error'); return; }
    if (password.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
    if (password !== confirm) { showToast('Passwords do not match', 'error'); return; }
    if (appState.users.some(u => u.phone === phone)) {
        showToast('This phone is already registered. Please login.', 'error');
        return;
    }

    setLoading('btn-start-reg', true, 'Sending OTP...');
    setTimeout(() => {
        setLoading('btn-start-reg', false);
        authState.pendingRegistration = { phone, password, otpVerified: false };
        getEl('reg-display-phone').innerText = phone;
        getEl('reg-otp').value = '';
        showRegStep(2);
        showToast(`OTP sent to ${phone} (mock: ${MOCK_OTP})`);
    }, MOCK_API_DELAY);
}

function verifyRegistrationOTP() {
    if (!authState.pendingRegistration) { showRegStep(1); return; }
    const otp = getEl('reg-otp').value.trim();
    if (otp !== MOCK_OTP) { showToast('Invalid OTP. Use 123456.', 'error'); return; }

    setLoading('btn-verify-reg-otp', true, 'Verifying...');
    setTimeout(() => {
        setLoading('btn-verify-reg-otp', false);
        authState.pendingRegistration.otpVerified = true;
        showRegStep(3);
        showToast('Phone verified! Complete your profile.');
    }, MOCK_API_DELAY);
}

function completeRegistration() {
    const pending = authState.pendingRegistration;
    if (!pending || !pending.otpVerified) { showToast('Verify your phone first', 'error'); showRegStep(1); return; }

    const name = getEl('reg-name').value.trim();
    const age = parseInt(getEl('reg-age').value, 10);
    const gender = getEl('reg-gender').value;
    const bloodGroup = getEl('reg-blood-group').value;
    const email = getEl('reg-email').value.trim();

    if (!name || !age || !gender || !bloodGroup) { showToast('Please fill all required fields', 'error'); return; }

    setLoading('btn-complete-reg', true, 'Creating account...');
    setTimeout(() => {
        setLoading('btn-complete-reg', false);
        const newUser = {
            id: 'usr_' + Date.now(),
            name,
            phone: pending.phone,
            password: pending.password,
            age,
            gender,
            bloodGroup,
            email: email || null,
            role: ROLES.USER
        };
        appState.users.push(newUser);
        appState.currentUser = newUser;
        persistData();
        persistSession();

        getEl('registration-form').reset();
        ['reg-phone', 'reg-password', 'reg-confirm-password', 'reg-otp'].forEach(id => { const el = getEl(id); if (el) el.value = ''; });
        authState.pendingRegistration = null;
        redirectByRole(newUser);
    }, MOCK_API_DELAY);
}

// --- Forgot password ---
function sendForgotOTP() {
    const phone = getEl('forgot-phone').value.trim();
    if (!phone) { showToast('Enter your phone number', 'error'); return; }
    const user = appState.users.find(u => u.phone === phone);
    if (!user) { showToast('No account found with this phone', 'error'); return; }

    setLoading('btn-forgot-otp', true, 'Sending OTP...');
    setTimeout(() => {
        setLoading('btn-forgot-otp', false);
        authState.pendingReset = { phone, otpVerified: false };
        getEl('forgot-display-phone').innerText = phone;
        getEl('forgot-otp').value = '';
        showForgotStep(2);
        showToast(`OTP sent (mock: ${MOCK_OTP})`);
    }, MOCK_API_DELAY);
}

function verifyForgotOTP() {
    if (!authState.pendingReset) { showForgotStep(1); return; }
    const otp = getEl('forgot-otp').value.trim();
    if (otp !== MOCK_OTP) { showToast('Invalid OTP. Use 123456.', 'error'); return; }

    setLoading('btn-verify-forgot-otp', true, 'Verifying...');
    setTimeout(() => {
        setLoading('btn-verify-forgot-otp', false);
        authState.pendingReset.otpVerified = true;
        showForgotStep(3);
        showToast('OTP verified! Set a new password.');
    }, MOCK_API_DELAY);
}

function resetPassword() {
    const pending = authState.pendingReset;
    if (!pending || !pending.otpVerified) { showToast('Verify OTP first', 'error'); showForgotStep(1); return; }

    const newPass = getEl('forgot-new-password').value;
    const confirm = getEl('forgot-confirm-password').value;
    if (newPass.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
    if (newPass !== confirm) { showToast('Passwords do not match', 'error'); return; }

    setLoading('btn-reset-password', true, 'Saving...');
    setTimeout(() => {
        setLoading('btn-reset-password', false);
        const user = appState.users.find(u => u.phone === pending.phone);
        if (!user) { showToast('Account no longer exists', 'error'); switchAuthTab('login'); return; }
        user.password = newPass;
        persistData();
        authState.pendingReset = null;
        ['forgot-phone', 'forgot-otp', 'forgot-new-password', 'forgot-confirm-password'].forEach(id => { const el = getEl(id); if (el) el.value = ''; });
        showToast('Password reset! Please login.');
        switchAuthTab('login');
        getEl('login-phone').value = user.phone;
    }, MOCK_API_DELAY);
}

// --- Logout ---
function logout() {
    appState.currentUser = null;
    persistSession();
    authState = { mode: 'login', pendingRegistration: null, pendingReset: null };
    ['login-phone', 'login-password'].forEach(id => { const el = getEl(id); if (el) el.value = ''; });
    switchAuthTab('login');
    navigateSafe('auth');
    showToast('Logged out successfully');
}

// --- Patient dashboard ---
function initDashboard() {
    const u = appState.currentUser;
    getEl('dash-user-name').innerText = u.name;
    getEl('dash-user-phone').innerText = u.phone;
    getEl('dash-user-gender').innerText = u.gender || '-';
    getEl('dash-user-age').innerText = u.age || '-';
    getEl('dash-user-blood').innerText = u.bloodGroup || '-';
}

function initDoctorDashboard() {
    const u = appState.currentUser;
    getEl('doc-dash-name').innerText = u.name;
    getEl('doc-dash-specialty').innerText = u.specialty || 'N/A';
    getEl('doc-dash-phone').innerText = u.phone;
}

// --- Doctor listing (patients only) ---
function renderDoctors() {
    const query = getEl('search-doctor').value.toLowerCase();
    const category = getEl('filter-category').value;

    const filtered = appState.doctors.filter(d => {
        const matchName = d.name.toLowerCase().includes(query);
        const matchCat = category === 'all' || d.category === category;
        return matchName && matchCat;
    });

    const listEl = getEl('doctor-list');
    listEl.innerHTML = '';

    if (filtered.length === 0) {
        getEl('doctor-empty').classList.remove('hidden');
        listEl.classList.add('hidden');
        return;
    }
    getEl('doctor-empty').classList.add('hidden');
    listEl.classList.remove('hidden');

    filtered.forEach(doc => {
        const initial = doc.name.replace(/^Dr\.?\s*/i, '').charAt(0).toUpperCase() || 'D';
        listEl.innerHTML += `
            <div class="card doctor-card">
                <div>
                    <div class="doc-header">
                        <div class="doc-avatar">${initial}</div>
                        <div>
                            <h3 style="font-size: 1.1rem;">${doc.name}</h3>
                            <p style="font-size: 0.85rem; color: var(--primary); font-weight:500;">${doc.category}</p>
                        </div>
                    </div>
                    <div class="doc-info mt-2">
                        <p><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> ${doc.time}</p>
                        <p><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> Room: ${doc.room}</p>
                    </div>
                </div>
                <button class="btn btn-primary mt-4" style="width:100%" onclick="openBookingModal(${doc.id})">Book Appointment</button>
            </div>
        `;
    });
}

function filterDoctors() { renderDoctors(); }

// --- Appointments view (patient + doctor) ---
function renderAppointments() {
    const role = getRole(appState.currentUser);
    const listEl = getEl('appointments-list');
    const tableContainer = getEl('appointments-table').parentElement;
    listEl.innerHTML = '';

    // Heading + back button context
    if (role === ROLES.DOCTOR) {
        getEl('appointments-heading').innerText = 'Patient Appointments';
        getEl('appointments-th-1').innerText = 'Patient';
        getEl('appointments-back-btn').setAttribute('onclick', "navigate('doctor-dashboard')");
        getEl('appointments-empty-text').innerText = 'No patients have booked an appointment yet.';
        getEl('appointments-book-btn').classList.add('hidden');
    } else {
        getEl('appointments-heading').innerText = 'My Appointments';
        getEl('appointments-th-1').innerText = 'Doctor';
        getEl('appointments-back-btn').setAttribute('onclick', "navigate('dashboard')");
        getEl('appointments-empty-text').innerText = "You haven't booked any appointments.";
        getEl('appointments-book-btn').classList.remove('hidden');
    }

    let myApps = [];
    if (role === ROLES.USER) {
        myApps = appState.appointments.filter(a => a.patientPhone === appState.currentUser.phone);
    } else if (role === ROLES.DOCTOR) {
        // Match doctor user to a doctors[] entry by phone (canonical link).
        const doctorRecord = appState.doctors.find(d => d.phone === appState.currentUser.phone);
        if (doctorRecord) myApps = appState.appointments.filter(a => a.docId === doctorRecord.id);
    }

    if (myApps.length === 0) {
        tableContainer.classList.add('hidden');
        getEl('appointments-empty').classList.remove('hidden');
        return;
    }
    tableContainer.classList.remove('hidden');
    getEl('appointments-empty').classList.add('hidden');

    myApps.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(app => {
        const statusClass = app.status === 'Booked' ? 'badge-success' : (app.status === 'Cancelled' ? 'badge-danger' : 'badge-warning');
        const canCancel = (app.status === 'Booked' && role === ROLES.USER && app.patientPhone === appState.currentUser.phone);
        const firstCol = role === ROLES.DOCTOR ? `${app.patientName}<div style="font-size:0.75rem;color:var(--text-muted)">${app.patientPhone}</div>` : `<strong>${app.docName}</strong>`;

        listEl.innerHTML += `
            <tr>
                <td>${firstCol}</td>
                <td>${formatDate(app.date)}</td>
                <td>${app.time}</td>
                <td>${app.room}</td>
                <td><span class="badge ${statusClass}">${app.status}</span></td>
                <td>
                    ${canCancel
                        ? `<button class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; color: var(--danger); border-color: var(--danger);" onclick="cancelAppointment(${app.id})">Cancel</button>`
                        : '-'}
                </td>
            </tr>
        `;
    });
}

// --- Booking ---
function openBookingModal(docId) {
    if (!hasPermission('createAppointments')) { showToast('Only patients can book appointments', 'error'); return; }
    const doc = appState.doctors.find(d => d.id === docId);
    if (!doc) return;

    const initial = doc.name.replace(/^Dr\.?\s*/i, '').charAt(0).toUpperCase() || 'D';
    getEl('booking-doc-id').value = doc.id;
    getEl('modal-doc-name').innerText = doc.name;
    getEl('modal-doc-cat').innerText = doc.category;
    getEl('modal-doc-time').innerText = doc.time;
    getEl('modal-doc-room').innerText = doc.room;
    getEl('modal-doc-initial').innerText = initial;

    getEl('booking-date').value = '';
    getEl('booking-time').value = '';
    getEl('booking-date').min = new Date().toISOString().split('T')[0];

    getEl('booking-modal').classList.add('active');
}

function closeModal(modalId) { getEl(modalId)?.classList.remove('active'); }

function confirmBooking() {
    if (!hasPermission('createAppointments')) { showToast('No permission to book', 'error'); return; }
    const docId = parseInt(getEl('booking-doc-id').value, 10);
    const date = getEl('booking-date').value;
    const time = getEl('booking-time').value;
    const doc = appState.doctors.find(d => d.id === docId);
    if (!doc || !date || !time) { showToast('Please select date and time', 'error'); return; }

    setLoading('btn-confirm-booking', true, 'Booking...');
    setTimeout(() => {
        setLoading('btn-confirm-booking', false);
        appState.appointments.push({
            id: Date.now(),
            patientName: appState.currentUser.name,
            patientPhone: appState.currentUser.phone,
            docId: doc.id,
            docName: doc.name,
            date, time,
            room: doc.room,
            status: 'Booked'
        });
        persistData();
        closeModal('booking-modal');
        showToast('Appointment booked successfully!');
        navigate('appointments');
    }, MOCK_API_DELAY);
}

function cancelAppointment(appId) {
    if (!hasPermission('cancelAppointments')) { showToast('No permission to cancel', 'error'); return; }
    if (!confirm('Cancel this appointment?')) return;
    const app = appState.appointments.find(a => a.id === appId);
    if (!app || app.patientPhone !== appState.currentUser.phone) { showToast('Cannot cancel this appointment', 'error'); return; }
    app.status = 'Cancelled';
    persistData();
    renderAppointments();
    showToast('Appointment cancelled.', 'error');
}

// --- Admin ---
function renderAdmin() {
    if (!hasPermission('adminPanel')) { showToast('Admin privileges required', 'error'); navigate('dashboard'); return; }
    switchAdminTab('admin-users');
}

function switchAdminTab(tabId) {
    ['admin-users', 'admin-doctors', 'admin-appointments'].forEach(t => {
        getEl(`tab-${t}`)?.classList.remove('active');
        getEl(`${t}-content`)?.classList.add('hidden');
    });
    getEl(`tab-${tabId}`)?.classList.add('active');
    getEl(`${tabId}-content`)?.classList.remove('hidden');

    if (tabId === 'admin-users') renderAdminUsers();
    if (tabId === 'admin-doctors') renderAdminDoctors();
    if (tabId === 'admin-appointments') renderAdminAppointments();
}

// Manage Users → patients only (role=user). Doctors live in their own tab.
function renderAdminUsers() {
    const tbody = getEl('admin-user-list');
    tbody.innerHTML = '';
    const patients = appState.users.filter(u => getRole(u) === ROLES.USER);
    if (patients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:var(--text-muted)">No patients have registered yet.</td></tr>';
        return;
    }
    patients.forEach(user => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${user.name}</strong></td>
                <td>${user.phone}</td>
                <td>${user.age || '-'}</td>
                <td>${user.gender || '-'}</td>
                <td>${user.email || '-'}</td>
                <td>
                    <div class="flex gap-2">
                        <button class="btn btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="editUser('${user.id}')">Edit</button>
                        <button class="btn btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;" onclick="deleteUser('${user.id}')">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    });
}

function editUser(userId) {
    const user = appState.users.find(u => u.id === userId);
    if (!user) return;
    getEl('edit-user-id').value = user.id;
    getEl('edit-user-name').value = user.name;
    getEl('edit-user-phone').value = user.phone;
    getEl('edit-user-email').value = user.email || '';
    getEl('edit-user-age').value = user.age || '';
    getEl('edit-user-gender').value = user.gender || '';
    getEl('admin-edit-user-modal').classList.add('active');
}

function saveEditedUser() {
    const userId = getEl('edit-user-id').value;
    const user = appState.users.find(u => u.id === userId);
    if (!user) return;

    setLoading('btn-save-edited-user', true, 'Saving...');
    setTimeout(() => {
        setLoading('btn-save-edited-user', false);
        user.name = getEl('edit-user-name').value.trim();
        user.email = getEl('edit-user-email').value.trim() || null;
        const ageVal = parseInt(getEl('edit-user-age').value, 10);
        user.age = isNaN(ageVal) ? user.age : ageVal;
        user.gender = getEl('edit-user-gender').value || user.gender;
        persistData();
        showToast('Patient updated successfully');
        closeModal('admin-edit-user-modal');
        renderAdminUsers();
    }, MOCK_API_DELAY);
}

function deleteUser(userId) {
    const user = appState.users.find(u => u.id === userId);
    if (!user) return;
    if (getRole(user) !== ROLES.USER) { showToast('Only patient accounts can be deleted here', 'error'); return; }
    if (!confirm(`Delete patient "${user.name}"? This action cannot be undone.`)) return;

    appState.users = appState.users.filter(u => u.id !== userId);
    appState.appointments = appState.appointments.filter(a => a.patientPhone !== user.phone);
    persistData();
    renderAdminUsers();
    showToast('Patient deleted.', 'error');
}

// --- Admin Doctors (doctor record + linked user account, keyed by phone) ---
function renderAdminDoctors() {
    const tbody = getEl('admin-doctor-list');
    tbody.innerHTML = '';
    if (appState.doctors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:var(--text-muted)">No doctors yet. Click "+ Add Doctor".</td></tr>';
        return;
    }
    appState.doctors.forEach(doc => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${doc.name}</strong></td>
                <td>${doc.phone || '-'}</td>
                <td>${doc.category}</td>
                <td>${doc.time}</td>
                <td>${doc.room}</td>
                <td>
                    <div class="flex gap-2">
                        <button class="btn btn-outline" style="padding: 0.25rem 0.5rem;" onclick="editDoctor(${doc.id})">Edit</button>
                        <button class="btn btn-danger" style="padding: 0.25rem 0.5rem;" onclick="deleteDoctor(${doc.id})">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    });
}

function openAdminDoctorModal(docId = null) {
    const passwordGroup = getEl('admin-doc-password-group');
    if (docId) {
        const doc = appState.doctors.find(d => d.id === docId);
        if (!doc) return;
        const linkedUser = appState.users.find(u => u.phone === doc.phone && getRole(u) === ROLES.DOCTOR);
        getEl('admin-doc-modal-title').innerText = 'Edit Doctor';
        getEl('admin-doc-id').value = doc.id;
        getEl('admin-doc-name').value = doc.name;
        getEl('admin-doc-phone').value = doc.phone || '';
        getEl('admin-doc-phone').disabled = true;
        getEl('admin-doc-email').value = linkedUser?.email || '';
        getEl('admin-doc-category').value = doc.category;
        getEl('admin-doc-time').value = doc.time;
        getEl('admin-doc-room').value = doc.room;
        getEl('admin-doc-password').value = '';
        passwordGroup.classList.add('hidden');
    } else {
        getEl('admin-doc-modal-title').innerText = 'Add New Doctor';
        getEl('admin-doc-form').reset();
        getEl('admin-doc-id').value = '';
        getEl('admin-doc-phone').disabled = false;
        passwordGroup.classList.remove('hidden');
    }
    getEl('admin-doctor-modal').classList.add('active');
}

function editDoctor(id) { openAdminDoctorModal(id); }

function deleteDoctor(id) {
    const doc = appState.doctors.find(d => d.id === id);
    if (!doc) return;
    if (!confirm(`Delete doctor "${doc.name}" and their user account? This cannot be undone.`)) return;
    appState.doctors = appState.doctors.filter(d => d.id !== id);
    appState.users = appState.users.filter(u => !(u.phone === doc.phone && getRole(u) === ROLES.DOCTOR));
    persistData();
    renderAdminDoctors();
    showToast('Doctor removed.', 'error');
}

function saveDoctor() {
    const idVal = getEl('admin-doc-id').value;
    const name = getEl('admin-doc-name').value.trim();
    const phone = getEl('admin-doc-phone').value.trim();
    const email = getEl('admin-doc-email').value.trim();
    const category = getEl('admin-doc-category').value;
    const time = getEl('admin-doc-time').value.trim();
    const room = getEl('admin-doc-room').value.trim();
    const password = getEl('admin-doc-password').value;

    if (!name || !phone || !category || !time || !room) { showToast('Please fill required fields', 'error'); return; }

    if (!idVal) {
        if (password.length < 6) { showToast('Password must be at least 6 characters', 'error'); return; }
        if (appState.users.some(u => u.phone === phone)) { showToast('A user with this phone already exists', 'error'); return; }
    }

    setLoading('btn-save-doc', true, 'Saving...');
    setTimeout(() => {
        setLoading('btn-save-doc', false);

        if (idVal) {
            const doc = appState.doctors.find(d => d.id == idVal);
            if (doc) {
                doc.name = name; doc.category = category; doc.time = time; doc.room = room;
                const linkedUser = appState.users.find(u => u.phone === doc.phone && getRole(u) === ROLES.DOCTOR);
                if (linkedUser) {
                    linkedUser.name = name;
                    linkedUser.email = email || null;
                    linkedUser.specialty = category;
                }
            }
            showToast('Doctor updated');
        } else {
            const docId = Date.now();
            appState.doctors.push({ id: docId, name, phone, category, time, room });
            appState.users.push({
                id: 'usr_' + docId,
                name,
                phone,
                password,
                email: email || null,
                role: ROLES.DOCTOR,
                specialty: category
            });
            showToast('Doctor added with login account');
        }

        persistData();
        closeModal('admin-doctor-modal');
        renderAdminDoctors();
    }, MOCK_API_DELAY);
}

// --- Admin Appointments ---
function renderAdminAppointments() {
    const tbody = getEl('admin-all-appointments-list');
    tbody.innerHTML = '';
    const sorted = [...appState.appointments].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="color:var(--text-muted)">No appointments found.</td></tr>';
        return;
    }
    sorted.forEach(app => {
        const statusClass = app.status === 'Booked' ? 'badge-success' : (app.status === 'Cancelled' ? 'badge-danger' : 'badge-warning');
        tbody.innerHTML += `
            <tr>
                <td>
                    <div><strong>${app.patientName}</strong></div>
                    <div style="font-size:0.75rem; color:var(--text-muted)">${app.patientPhone}</div>
                </td>
                <td>${app.docName}</td>
                <td>
                    <div>${formatDate(app.date)}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted)">${app.time}</div>
                </td>
                <td><span class="badge ${statusClass}">${app.status}</span></td>
                <td>
                    <select onchange="updateAppointmentStatus(${app.id}, this.value)" style="padding:0.25rem; font-size:0.75rem;">
                        <option value="Booked" ${app.status === 'Booked' ? 'selected' : ''}>Booked</option>
                        <option value="Completed" ${app.status === 'Completed' ? 'selected' : ''}>Completed</option>
                        <option value="Cancelled" ${app.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                    </select>
                </td>
            </tr>
        `;
    });
}
function generateTimeOptions(selectId) {
    const select = document.getElementById(selectId);

    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 30) { // 30-min slots
            const hour = String(h).padStart(2, '0');
            const min = String(m).padStart(2, '0');

            const value = `${hour}:${min}`; // DB safe (24h format)
            const display = new Date(`1970-01-01T${value}:00`)
                .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const option = document.createElement("option");
            option.value = value;
            option.textContent = display;

            select.appendChild(option);
        }
    }
}

generateTimeOptions("admin-doc-start-time");
generateTimeOptions("admin-doc-end-time");
function updateAppointmentStatus(id, newStatus) {
    const app = appState.appointments.find(a => a.id === id);
    if (!app) return;
    app.status = newStatus;
    persistData();
    renderAdminAppointments();
    showToast(`Status updated to ${newStatus}`);
}

// Boot
loadData();
