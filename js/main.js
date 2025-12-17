// Logic for Index.html
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, doc, runTransaction, serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { auth, db, COLLECTIONS } from './config/firebase-config.js';

let currentUser = null;
let blockedDates = [];
let dayLimits = {};
let dayCounts = {};
const submitBtn = document.getElementById('submitBtn');
const btnText = document.getElementById('btnText');
// COUNTER_DOC_ID ki ab zarurat nahi hai specific date logic ke liye, but purane reference ke liye rakha hai

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = type === 'error' ? '<i class="fas fa-exclamation-circle text-red-500 text-xl"></i>' : '<i class="fas fa-check-circle text-emerald text-xl"></i>';
    toast.innerHTML += `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 5000);
}

window.showToast = showToast;

function initListeners() {
    // 1. Calendar Settings
    onSnapshot(doc(db, COLLECTIONS.SETTINGS, 'calendar_config'), (doc) => {
        if(doc.exists()) {
            blockedDates = doc.data().blocked || [];
            dayLimits = doc.data().limits || {};
        }
        populateDates();
    }, (e) => console.log("Settings sync error", e));

    // 2. Daily Counts (UI par (FULL) dikhane ke liye abhi bhi yehi use hoga)
    onSnapshot(doc(db, COLLECTIONS.COUNTERS, 'daily_counts'), (doc) => {
        if(doc.exists()) {
            dayCounts = doc.data();
        } else {
            dayCounts = {};
        }
        populateDates();
    });

    // 3. Site Config (Maintenance & Popup)
    onSnapshot(doc(db, COLLECTIONS.SETTINGS, 'site_config'), (docSnap) => {
        if(docSnap.exists()) {
            const data = docSnap.data();
            
            // Handle Maintenance Mode
            const maintenanceDiv = document.getElementById('bookingMaintenance');
            if (data.maintenanceMode) {
                maintenanceDiv.classList.remove('hidden');
            } else {
                maintenanceDiv.classList.add('hidden');
            }

            // Handle Popup - Show Every Time
            const popupModal = document.getElementById('globalPopupModal');
            const popupText = document.getElementById('globalPopupText');
            const popupImgContainer = document.getElementById('popupImageContainer');
            const popupImg = document.getElementById('popupImage');

            // Only show if Admin enabled it AND (there is text OR an image)
            if (data.showPopup && (data.popupMessage || data.popupImageUrl)) {
                
                // Set Text
                popupText.textContent = data.popupMessage || '';
                
                // Set Image
                if (data.popupImageUrl) {
                    popupImg.src = data.popupImageUrl;
                    popupImgContainer.classList.remove('hidden');
                } else {
                    popupImgContainer.classList.add('hidden');
                }

                // Show Modal
                popupModal.classList.remove('hidden');
                setTimeout(() => popupModal.classList.remove('opacity-0'), 100);
            } else {
                // If disabled by admin, ensure it's hidden
                popupModal.classList.add('hidden');
            }
        }
    });
}

window.closeGlobalPopup = function() {
    const popupModal = document.getElementById('globalPopupModal');
    popupModal.classList.add('opacity-0');
    setTimeout(() => popupModal.classList.add('hidden'), 500);
}

function populateDates() {
    const select = document.getElementById('day');
    select.innerHTML = '<option value="" class="bg-royal text-gray-500">Select Day</option>';
    
    const today = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        
        const dayName = days[d.getDay()];
        const dateNum = d.getDate();
        const isoDate = d.toISOString().split('T')[0];
        
        const nth = (n) => { if(n>3 && n<21) return 'th'; switch (n % 10) { case 1: return "st"; case 2: return "nd"; case 3: return "rd"; default: return "th"; } };
        const dateString = `${dayName}, ${dateNum}${nth(dateNum)}`;

        if (blockedDates.includes(isoDate)) continue;
        if (dayName === 'Friday') continue; 

        const limit = dayLimits[isoDate] || 0;
        const count = dayCounts[isoDate] || 0;
        const isFull = limit > 0 && count >= limit;

        const option = document.createElement('option');
        option.value = `${isoDate}|${dateString}`;
        
        if (isFull) {
            option.textContent = `${dateString} (FULL)`;
            option.disabled = true;
        } else {
            option.textContent = dateString;
        }
        option.className = "bg-royal text-white";
        select.appendChild(option);
    }
}

signInAnonymously(auth).then((userCredential) => {
    currentUser = userCredential.user;
    submitBtn.disabled = false;
    btnText.textContent = "Generate Token";
    showToast("Connected to Database");
    initListeners();
}).catch((error) => {
    console.error("Auth Error:", error);
    currentUser = { uid: "guest_" + Math.random().toString(36).substr(2, 9) };
    submitBtn.disabled = false;
    btnText.textContent = "Generate Token (Guest)";
    initListeners();
});

document.getElementById('tokenForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    if (!currentUser) currentUser = { uid: "guest_" + Math.random().toString(36).substr(2, 9) };

    submitBtn.classList.add('btn-loading'); 
    btnText.textContent = "Processing...";

    const name = document.getElementById('name').value;
    const city = document.getElementById('city').value;
    const mobile = document.getElementById('mobile').value;
    const dayValue = document.getElementById('day').value;

    if (!dayValue) {
        showToast("Please select a valid date", "error");
        submitBtn.classList.remove('btn-loading');
        btnText.textContent = "Generate Token";
        return;
    }

    const [dateCode, dayLabel] = dayValue.split('|');

    try {
        // --- NEW LOGIC: Use specific date counter ---
        const counterRef = doc(db, COLLECTIONS.COUNTERS, dateCode); 
        // We still check 'daily_counts' for aggregate limits to keep UI logic consistent
        const dailyRef = doc(db, COLLECTIONS.COUNTERS, 'daily_counts');
        const bookingsCol = collection(db, COLLECTIONS.BOOKINGS);

        const newTokenNum = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            const dailyDoc = await transaction.get(dailyRef);

            // 1. Calculate Token Number for THIS SPECIFIC DATE
            let nextToken = 1;
            if (counterDoc.exists()) {
                nextToken = (counterDoc.data().current || 0) + 1;
            }

            // 2. Check Limits (using daily_counts summary)
            const currentDailyCount = dailyDoc.exists() ? (dailyDoc.data()[dateCode] || 0) : 0;
            const limit = dayLimits[dateCode] || 0;
            
            if (limit > 0 && currentDailyCount >= limit) {
                throw new Error("Sorry, bookings for this day are full.");
            }

            // 3. Update BOTH: Specific Counter (for ID) and Daily Counts (for UI Limit)
            transaction.set(counterRef, { current: nextToken }, { merge: true });
            transaction.set(dailyRef, { [dateCode]: currentDailyCount + 1 }, { merge: true });

            const newBookingRef = doc(bookingsCol); 
            transaction.set(newBookingRef, {
                tokenNumber: nextToken,
                name: name,
                city: city,
                mobile: mobile,
                day: dayLabel,
                dateCode: dateCode,
                userId: currentUser.uid,
                timestamp: serverTimestamp()
            });

            return nextToken;
        });

        document.getElementById('modalName').textContent = name;
        document.getElementById('modalCity').textContent = city;
        document.getElementById('modalDay').textContent = dayLabel;
        document.getElementById('modalMobile').textContent = mobile;
        document.getElementById('modalTokenNum').textContent = "#" + String(newTokenNum).padStart(2, '0');
        
        document.getElementById('tokenModal').classList.remove('hidden');
        setTimeout(() => document.getElementById('modalContent').classList.remove('scale-95'), 10);
        localStorage.setItem('kToken', newTokenNum);
        document.getElementById('tokenForm').reset();

    } catch (e) {
        console.error("Booking Error: ", e);
        if(e.message.includes("full")) showToast(e.message, "error");
        else showToast("Error: " + e.message, "error");
    } finally {
        submitBtn.classList.remove('btn-loading');
        btnText.textContent = "Generate Token";
    }
});

window.closeModal = function() {
    document.getElementById('modalContent').classList.add('scale-95');
    setTimeout(() => document.getElementById('tokenModal').classList.add('hidden'), 200);
}

// UI Init Scripts
function removePreloader() {
    const p = document.getElementById('preloader');
    if(p) { p.style.opacity = '0'; p.style.visibility = 'hidden'; }
    document.getElementById('main-body').style.opacity = '1';
}

window.addEventListener('load', function() { 
    window.scrollTo(0, 0); 
    document.getElementById('main-body').classList.add('fade-in-active'); 
    setTimeout(removePreloader, 1500);
});

setTimeout(removePreloader, 3000);

AOS.init({ once: true, mirror: false, duration: 1200, offset: 120, easing: 'ease-out-cubic' });

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.2 });
document.querySelectorAll('.reveal-image').forEach(el => revealObserver.observe(el));

const cursorDot = document.querySelector('.cursor-dot');
const cursorOutline = document.querySelector('.cursor-outline');
window.addEventListener('mousemove', (e) => {
    cursorDot.style.left = `${e.clientX}px`; cursorDot.style.top = `${e.clientY}px`;
    cursorOutline.animate({ left: `${e.clientX}px`, top: `${e.clientY}px` }, { duration: 500, fill: "forwards" });
});

window.addEventListener('scroll', () => {
    const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    const scrolled = (winScroll / height) * 100;
    document.getElementById("progress-bar").style.width = scrolled + "%";
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 50) navbar.classList.add('nav-scrolled'); else navbar.classList.remove('nav-scrolled');
});

const counters = document.querySelectorAll('.counter');
const observerOptions = { threshold: 0.5 }; 
const counterObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const counter = entry.target;
            const target = +counter.getAttribute('data-target');
            const duration = 2000; 
            const increment = target / (duration / 16); 
            let current = 0;
            const updateCounter = () => {
                current += increment;
                if (current < target) {
                    counter.innerText = Math.ceil(current);
                    requestAnimationFrame(updateCounter);
                } else {
                    counter.innerText = target;
                }
            };
            updateCounter();
            observer.unobserve(counter);
        }
    });
}, observerOptions);
counters.forEach(counter => counterObserver.observe(counter));

function updateClock() {
    const now = new Date();
    document.getElementById('live-clock').textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    document.querySelector('.date-display').textContent = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
setInterval(updateClock, 1000); updateClock();

window.toggleFaq = (button) => {
    const item = button.parentElement;
    const isActive = item.classList.contains('faq-active');
    document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('faq-active'));
    if (!isActive) item.classList.add('faq-active');
}

const menuBtn = document.getElementById('menu-btn');
const mobileMenu = document.getElementById('mobile-menu');
const hamburger = document.querySelector('.hamburger');
if(menuBtn) {
    menuBtn.addEventListener('click', () => {
        hamburger.classList.toggle('opened');
        mobileMenu.classList.toggle('active');
        if (mobileMenu.classList.contains('active')) {
            document.documentElement.classList.add('menu-open');
            document.body.classList.add('menu-open');
            document.querySelectorAll('.menu-link').forEach((link, index) => { setTimeout(() => link.classList.remove('opacity-0', 'translate-y-10'), 100 + (index * 100)); });
        } else {
            document.documentElement.classList.remove('menu-open');
            document.body.classList.remove('menu-open');
            document.querySelectorAll('.menu-link').forEach(link => link.classList.add('opacity-0', 'translate-y-10'));
        }
    });
}
document.querySelectorAll('.menu-link').forEach(link => {
    link.addEventListener('click', () => {
        hamburger.classList.remove('opened'); mobileMenu.classList.remove('active');
        document.documentElement.classList.remove('menu-open'); document.body.classList.remove('menu-open');
        document.querySelectorAll('.menu-link').forEach(l => l.classList.add('opacity-0', 'translate-y-10'));
    });
});
