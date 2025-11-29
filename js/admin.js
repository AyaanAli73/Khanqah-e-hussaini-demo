// Logic for Admin.html
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, doc, updateDoc, deleteDoc, setDoc, addDoc, onSnapshot, query, orderBy, writeBatch, getDocs, runTransaction } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { auth, db, COLLECTIONS } from './config/firebase-config.js';

let currentUser = null;
let allBookings = [];
let blockedDates = [];
let dayLimits = {};
let currentTab = 'active';
let bookingsUnsubscribe = null; // Store listener to stop it later
let settingsUnsubscribe = null;

const COUNTER_DOC_ID = 'main';

// --- AUTHENTICATION & SECURITY ---

// Force logout on page load to ensure security
window.addEventListener('load', async () => {
    // Optional: keeping the session active is usually better UX, 
    // but if you want strict security on reload, keep signOut(auth);
    // await signOut(auth); 
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.textContent = "Verifying...";
    try {
        await signInWithEmailAndPassword(auth, document.getElementById('adminEmail').value, document.getElementById('adminPass').value);
    } catch (error) {
        showToast("Login Failed: " + error.code, "error");
        btn.textContent = "Secure Login";
    }
});

// CRITICAL SECURITY CHECK
onAuthStateChanged(auth, (user) => {
    if (user && user.isAnonymous === false) {
        // SUCCESS: Valid Email/Password User
        currentUser = user;
        document.getElementById('loginOverlay').classList.add('hidden');
        
        // ONLY fetch data here
        initRealtimeListener();
        initSettingsListener();
        showToast("Welcome Admin");
    } else {
        // FAIL: No user OR Anonymous user trying to access admin
        currentUser = null;
        document.getElementById('loginOverlay').classList.remove('hidden');
        
        // DETACH LISTENERS (Stop paying for reads, stop receiving data)
        if (bookingsUnsubscribe) bookingsUnsubscribe();
        if (settingsUnsubscribe) settingsUnsubscribe();
        
        // CLEAR DATA FROM MEMORY & UI
        allBookings = [];
        document.getElementById('bookingsTable').innerHTML = '';
        document.getElementById('statTotal').textContent = '0';
        document.getElementById('statToday').textContent = '0';
        document.getElementById('statNext').textContent = '...';
    }
});

window.logout = async () => { 
    await signOut(auth); 
    window.location.reload(); 
}

// --- DATA FETCHING ---

function initRealtimeListener() {
    if (!currentUser) return; // Double check

    const q = query(collection(db, COLLECTIONS.BOOKINGS), orderBy("tokenNumber", "desc"));
    
    // Assign to variable so we can stop it on logout
    bookingsUnsubscribe = onSnapshot(q, (snapshot) => {
        allBookings = [];
        snapshot.forEach((doc) => allBookings.push({ id: doc.id, ...doc.data() }));
        renderTable();
        updateStats();
        populateDayFilter();
    }, (error) => {
        console.error("Data access denied:", error);
        showToast("Access Denied: You do not have permission.", "error");
    });

    onSnapshot(doc(db, COLLECTIONS.COUNTERS, COUNTER_DOC_ID), (doc) => {
        document.getElementById('statNext').textContent = "#" + ((doc.data()?.current || 0) + 1);
    });
}

function initSettingsListener() {
    if (!currentUser) return;

    settingsUnsubscribe = onSnapshot(doc(db, COLLECTIONS.SETTINGS, 'calendar_config'), (doc) => {
        if(doc.exists()) {
            const data = doc.data();
            blockedDates = data.blocked || [];
            dayLimits = data.limits || {};
        }
    });
}

// --- UI & LOGIC ---

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = type === 'error' ? '<i class="fas fa-exclamation-circle text-red-500 text-xl"></i>' : '<i class="fas fa-check-circle text-emerald-500 text-xl"></i>';
    toast.innerHTML += `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 4000);
}

function populateDayFilter() {
    const filterSelect = document.getElementById('dayFilter');
    const currentVal = filterSelect.value;
    const uniqueDays = [...new Set(allBookings.map(b => b.day))].sort();
    
    let html = '<option value="all">All Days</option>';
    uniqueDays.forEach(day => {
        if(day) html += `<option value="${day}">${day}</option>`;
    });
    filterSelect.innerHTML = html;
    filterSelect.value = currentVal;
}

window.renderTable = function() {
    const tbody = document.getElementById('bookingsTable');
    tbody.innerHTML = '';
    
    const todayISO = new Date().toISOString().split('T')[0];
    const term = document.getElementById('searchInput').value.toLowerCase();
    const dayFilter = document.getElementById('dayFilter').value;

    const filtered = allBookings.filter(b => {
        const isMatch = (b.name || '').toLowerCase().includes(term) || String(b.tokenNumber).includes(term);
        if (!isMatch) return false;
        if (dayFilter !== 'all' && b.day !== dayFilter) return false;
        if (currentTab === 'active') {
            return !b.dateCode || b.dateCode >= todayISO;
        } else {
            return b.dateCode && b.dateCode < todayISO;
        }
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-gray-400">No data found.</td></tr>`;
        return;
    }

    filtered.forEach(b => {
        const row = document.createElement('tr');
        row.className = "hover:bg-gray-50 transition border-b border-gray-100 last:border-none group";
        row.innerHTML = `
            <td class="px-6 py-4 font-bold text-royal">#${String(b.tokenNumber).padStart(2, '0')}</td>
            <td class="px-6 py-4 font-medium text-gray-900">${b.name || '-'}</td>
            <td class="px-6 py-4 font-mono text-gray-500">${b.mobile || '-'}</td>
            <td class="px-6 py-4">${b.city || '-'}</td>
            <td class="px-6 py-4"><span class="px-2 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600">${b.day || 'Manual'}</span></td>
            <td class="px-6 py-4 text-right whitespace-nowrap">
                <button onclick="printSingle('${b.tokenNumber}','${b.name}','${b.day}','${b.city}')" class="text-gray-400 hover:text-royal p-2" title="Print"><i class="fas fa-print"></i></button>
                <button onclick="openEditModal('${b.id}')" class="text-gray-400 hover:text-blue-600 p-2" title="Edit"><i class="fas fa-edit"></i></button>
                <button onclick="askDelete('${b.id}')" class="text-gray-400 hover:text-red-600 p-2" title="Delete"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

window.switchTab = (tab) => {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tab === 'active' ? 'tabActive' : 'tabHistory').classList.add('active');
    renderTable();
}

function updateStats() {
    document.getElementById('statTotal').textContent = allBookings.length;
    const todayStr = new Date().toISOString().split('T')[0];
    const todayCount = allBookings.filter(b => b.dateCode === todayStr).length;
    document.getElementById('statToday').textContent = todayCount;
}

// --- MODALS & ACTIONS ---

// 1. OPEN ADD MODAL (Updated with Date Logic)
window.openAddModal = function() {
    document.getElementById('addForm').reset();
    const daySelect = document.getElementById('addDay');
    daySelect.innerHTML = '';
    
    // Generate next 7 days logic (Same as main website)
    const today = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    let hasOptions = false;

    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        
        const dayName = days[d.getDay()];
        const isoDate = d.toISOString().split('T')[0];
        
        // Filter Logic: Skip Fridays and Blocked Dates
        // Note: For admins, you might want to see blocked dates, but users requested "like website"
        // So we will strictly follow the website availability rules for the dropdown.
        if (dayName === 'Friday') continue;
        if (blockedDates.includes(isoDate)) continue;

        const option = document.createElement('option');
        // We store both dateCode and Label in value for easy parsing
        option.value = `${isoDate}|${dayName}`; 
        option.textContent = `${dayName} (${isoDate})`;
        daySelect.appendChild(option);
        hasOptions = true;
    }

    // Always add a "Manual/Emergency" option for today in case everything else is blocked
    const todayISO = new Date().toISOString().split('T')[0];
    const emergencyOpt = document.createElement('option');
    emergencyOpt.value = `${todayISO}|Manual Entry`;
    emergencyOpt.textContent = "Manual / Emergency (Today)";
    // If no regular days available, select emergency by default
    if(!hasOptions) emergencyOpt.selected = true; 
    daySelect.appendChild(emergencyOpt);

    document.getElementById('addModal').classList.remove('hidden');
    document.getElementById('addModal').classList.add('modal-active');
}

// 2. OPEN EDIT MODAL
window.openEditModal = function(id) {
    const booking = allBookings.find(b => b.id === id);
    if (!booking) return;

    document.getElementById('editDocId').value = id;
    document.getElementById('editName').value = booking.name;
    document.getElementById('editMobile').value = booking.mobile;
    document.getElementById('editCity').value = booking.city;
    document.getElementById('editDay').value = booking.day; // Readonly field

    document.getElementById('editModal').classList.remove('hidden');
    document.getElementById('editModal').classList.add('modal-active');
}

// 3. SCHEDULE MODAL
window.openScheduleModal = function() {
    const list = document.getElementById('daysList');
    list.innerHTML = '';
    const today = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    for(let i=0; i<7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const iso = d.toISOString().split('T')[0];
        const dayName = days[d.getDay()];
        const label = `${dayName} (${iso})`;
        const isBlocked = blockedDates.includes(iso);
        const currentLimit = dayLimits[iso] || 0;

        const div = document.createElement('div');
        div.className = "grid grid-cols-12 gap-2 items-center p-3 bg-gray-50 rounded-lg border";
        div.innerHTML = `
            <div class="col-span-5 font-bold text-sm ${isBlocked ? 'text-gray-400 line-through' : 'text-gray-700'}">${label}</div>
            
            <div class="col-span-3 text-center">
                <label class="inline-flex items-center cursor-pointer">
                    <input type="checkbox" class="sr-only date-toggle" value="${iso}" ${isBlocked ? 'checked' : ''}>
                    <div class="relative w-10 h-5 bg-gray-300 rounded-full transition-colors toggle-bg ${isBlocked ? 'bg-red-400' : ''}">
                        <div class="absolute left-1 top-1 bg-white w-3 h-3 rounded-full transition-transform ${isBlocked ? 'translate-x-full' : ''}"></div>
                    </div>
                </label>
                <div class="text-[10px] font-bold mt-1 ${isBlocked ? 'text-red-500' : 'text-emerald-600'}">${isBlocked ? 'BLOCKED' : 'OPEN'}</div>
            </div>
            
            <div class="col-span-4">
                <input type="number" min="0" placeholder="No Limit" 
                    class="limit-input w-full p-2 text-xs border rounded-md focus:ring-1 focus:ring-royal outline-none" 
                    data-date="${iso}" value="${currentLimit === 0 ? '' : currentLimit}">
            </div>
        `;
        list.appendChild(div);
    }
    
    document.querySelectorAll('.date-toggle').forEach(el => {
        el.addEventListener('change', (e) => {
            const bg = e.target.nextElementSibling;
            const txt = e.target.parentElement.nextElementSibling;
            if (e.target.checked) {
                bg.classList.add('bg-red-400');
                bg.firstElementChild.classList.add('translate-x-full');
                txt.textContent = 'BLOCKED';
                txt.className = 'text-[10px] font-bold mt-1 text-red-500';
            } else {
                bg.classList.remove('bg-red-400');
                bg.firstElementChild.classList.remove('translate-x-full');
                txt.textContent = 'OPEN';
                txt.className = 'text-[10px] font-bold mt-1 text-emerald-600';
            }
        });
    });

    document.getElementById('scheduleModal').classList.remove('hidden');
    document.getElementById('scheduleModal').classList.add('modal-active');
}

// --- FORM SUBMISSIONS ---

// HANDLE MANUAL ADD (Updated to parse Date)
document.getElementById('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('addSubmitBtn');
    const originalText = btn.textContent;
    btn.textContent = "Generating...";
    btn.disabled = true;

    const name = document.getElementById('addName').value.trim();
    const mobile = document.getElementById('addMobile').value.trim();
    const city = document.getElementById('addCity').value.trim();
    const rawDay = document.getElementById('addDay').value; 

    // Parse the value "YYYY-MM-DD|DayName"
    let dateCode, dayLabel;
    if (rawDay.includes('|')) {
        [dateCode, dayLabel] = rawDay.split('|');
    } else {
        // Fallback
        dateCode = new Date().toISOString().split('T')[0];
        dayLabel = rawDay;
    }

    try {
        await runTransaction(db, async (transaction) => {
            const counterRef = doc(db, COLLECTIONS.COUNTERS, COUNTER_DOC_ID);
            const counterSnap = await transaction.get(counterRef);
            
            let newToken = 1;
            if (counterSnap.exists()) {
                newToken = (counterSnap.data().current || 0) + 1;
            }

            const newBookingRef = doc(collection(db, COLLECTIONS.BOOKINGS));
            
            transaction.set(counterRef, { current: newToken }, { merge: true });
            transaction.set(newBookingRef, {
                tokenNumber: newToken,
                name: name,
                mobile: mobile,
                city: city,
                day: dayLabel,
                dateCode: dateCode, // Uses selected date
                timestamp: new Date()
            });
        });

        showToast(`Token #${name} Generated!`);
        closeModal('addModal');
    } catch (error) {
        console.error("Add Error: ", error);
        showToast("Error generating token: " + error.message, "error");
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
});

// HANDLE EDIT SUBMISSION
document.getElementById('editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editDocId').value;
    
    try {
        await updateDoc(doc(db, COLLECTIONS.BOOKINGS, id), {
            name: document.getElementById('editName').value.trim(),
            mobile: document.getElementById('editMobile').value.trim(),
            city: document.getElementById('editCity').value.trim()
        });
        showToast("Booking Updated Successfully!");
        closeModal('editModal');
    } catch (error) {
        showToast("Error updating: " + error.message, "error");
    }
});

// --- SAVE SCHEDULE ---
window.saveSchedule = async function() {
    const blocked = [];
    const limits = {};
    
    document.querySelectorAll('.date-toggle').forEach(cb => {
        if(cb.checked) blocked.push(cb.value);
    });
    
    document.querySelectorAll('.limit-input').forEach(inp => {
        const val = parseInt(inp.value);
        if (!isNaN(val) && val > 0) {
            limits[inp.dataset.date] = val;
        }
    });
    
    try {
        await setDoc(doc(db, COLLECTIONS.SETTINGS, 'calendar_config'), { 
            blocked: blocked,
            limits: limits 
        }, { merge: true });
        
        showToast("Schedule & Limits Updated!");
        closeModal('scheduleModal');
    } catch(e) {
        showToast("Error saving: " + e.message, "error");
        console.error(e);
    }
}

// --- PRINT & DELETE ---

window.printAllTokens = () => {
    const tbody = document.getElementById('printTableBody');
    tbody.innerHTML = '';
    
    const todayISO = new Date().toISOString().split('T')[0];
    const term = document.getElementById('searchInput').value.toLowerCase();
    const dayFilter = document.getElementById('dayFilter').value;
    
    const dataToPrint = allBookings.filter(b => {
            const isMatch = (b.name || '').toLowerCase().includes(term);
            if (!isMatch) return false;
            if (dayFilter !== 'all' && b.day !== dayFilter) return false;
            if (currentTab === 'active') return !b.dateCode || b.dateCode >= todayISO;
            return b.dateCode && b.dateCode < todayISO;
    });

    dataToPrint.forEach(b => {
        tbody.innerHTML += `
            <tr class="border-b">
                <td class="p-2">#${b.tokenNumber}</td>
                <td class="p-2">${b.name}</td>
                <td class="p-2">${b.day}</td>
                <td class="p-2">${b.mobile}</td>
                <td class="p-2">${b.city}</td>
            </tr>
        `;
    });
    window.print();
}

window.printSingle = (token, name, day, city) => {
        const tbody = document.getElementById('printTableBody');
        tbody.innerHTML = `
        <tr class="border-b">
            <td class="p-2">#${token}</td>
            <td class="p-2">${name}</td>
            <td class="p-2">${day}</td>
            <td class="p-2">-</td>
            <td class="p-2">${city}</td>
        </tr>
        `;
        window.print();
}

window.askDeleteAll = () => {
        document.getElementById('deleteAllModal').classList.remove('hidden');
        document.getElementById('deleteAllModal').classList.add('modal-active');
}

document.getElementById('confirmDeleteAllBtn').addEventListener('click', async () => {
        const batch = writeBatch(db);
        const snaps = await getDocs(collection(db, COLLECTIONS.BOOKINGS));
        snaps.forEach(doc => batch.delete(doc.ref));
        batch.set(doc(db, COLLECTIONS.COUNTERS, 'main'), { current: 0 });
        batch.delete(doc(db, COLLECTIONS.COUNTERS, 'daily_counts'));
        
        await batch.commit();
        showToast("All data wiped & counter reset.");
        closeModal('deleteAllModal');
});

window.askDelete = async (id) => {
    if(confirm("Delete this booking?")) await deleteDoc(doc(db, COLLECTIONS.BOOKINGS, id));
}

document.getElementById('searchInput').addEventListener('input', renderTable);
window.closeModal = (id) => {
    document.getElementById(id).classList.add('hidden');
    document.getElementById(id).classList.remove('modal-active');
}
window.toggleSidebar = () => {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('sidebarOverlay');
    if (sb.classList.contains('-translate-x-full')) {
        sb.classList.remove('-translate-x-full');
        ov.classList.remove('hidden');
    } else {
        sb.classList.add('-translate-x-full');
        ov.classList.add('hidden');
    }
}
window.resetCounter = async () => {
    if(confirm("Reset Token Counter to 0?")) await setDoc(doc(db, COLLECTIONS.COUNTERS, 'main'), { current: 0 });
}