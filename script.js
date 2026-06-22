// --- ১. ইনিশিয়ালাইজেশন এবং ডিফল্ট সেটিংস ---
if (!localStorage.getItem('globalDayStartBoundary')) {
    localStorage.setItem('globalDayStartBoundary', '00:00'); 
}

let currentUser = null;
let currentActivity = 'Self Study'; 
let isRunning = false;
let timerInterval = null;

// --- সাবজেক্ট ওয়াইজ ট্র্যাকার ও পোমোডোরো ভ্যারিয়েবলস ---
let isSubjectTimerRunning = false;
let subjectTimerInterval = null;
let currentTrackingSubject = '';
let userSubjectDailyLogs = {}; 

let isPomodoroRunning = false;
let pomodoroInterval = null;
let pomodoroRemainingSeconds = 1500; 

// --- ২ ঘণ্টা অটো-অফ এবং ব্যাকগ্রাউন্ড ট্র্যাকিং সেশন ভ্যারিয়েবলস ---
let mainTimerSessionSeconds = 0;    // বর্তমান সেশনের মেইন টাইমার কাউন্ট
let subjectTimerSessionSeconds = 0; // বর্তমান সেশনের সাবজেক্ট টাইমার কাউন্ট
let pomodoroSessionSeconds = 0;    // বর্তমান সেশনের পোমোডোরো কাউন্ট

// --- সাবজেক্ট ভিত্তিক হিডেন লিংক রিসোর্স ভ্যারিয়েবলস ---
let globalSubjectResources = {}; 
let activeResourceSubject = '';

let calendarCurrentDate = new Date(); 
let selectedReportDateStr = ''; 

const fixedSubjects = [
    "Bangla 1st", "Bangla 2nd", "English 1st", "English 2nd", "Ict", 
    "physics 1st", "physics 2nd", "Chemistry 1st", "Chemistry 2nd", 
    "Higher math 1st", "Higher math 2nd", "Biology 1st", "Biology 2nd"
];
let currentSelectedSubject = fixedSubjects[0]; 

let globalSyllabusData = {}; 
let userTicksData = {}; 
let userDailyLogs = {}; 
let globalDynamicLinks = []; 

window.addEventListener('DOMContentLoaded', () => {
    applySavedTheme();
    loadNoticeSettingsDisplay();
    setTimeout(() => {
        initFirebaseGlobalListeners();
    }, 2500);
});

// --- ব্রাউজার ট্যাব বন্ধ বা রিফ্রেশ করলে অফলাইন করার ক্রুশিয়াল লজিক ---
window.addEventListener('beforeunload', () => {
    if (isRunning) {
        clearInterval(timerInterval);
    }
    if (isSubjectTimerRunning) {
        clearInterval(subjectTimerInterval);
    }

    if (currentUser && window.fbFirestore && window.firebaseDb) {
        const todayStr = getLogicalDateString();
        const liveDocRef = window.fbFirestore.doc(window.firebaseDb, "liveActivity", currentUser.username);
        
        // ফায়ারবেস ক্লাউডে অফলাইন স্ট্যাটাস পুশ করা
        window.fbFirestore.setDoc(liveDocRef, {
            [todayStr]: {
                'currentStatus': 'অফলাইন / বের হয়ে গেছেন',
                'lastActive': new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
        }, { merge: true });
    }
});

// --- ২. থিম ইঞ্জিন কালার প্রোভাইডার লজিক ---
function applySavedTheme() {
    const bg = localStorage.getItem('theme_color_bg') || '#111827';
    const card = localStorage.getItem('theme_color_card') || '#1e293b';
    const btn = localStorage.getItem('theme_color_btn') || '#3b82f6';
    const text = localStorage.getItem('theme_color_text') || '#ffffff';

    document.documentElement.style.setProperty('--theme-bg', bg);
    document.documentElement.style.setProperty('--theme-card-bg', card);
    document.documentElement.style.setProperty('--theme-btn-bg', btn);
    document.documentElement.style.setProperty('--theme-text-color', text);
}

function saveThemeSettings() {
    if (!currentUser || currentUser.role !== 'admin') return; 
    localStorage.setItem('theme_color_bg', document.getElementById('color-bg').value);
    localStorage.setItem('theme_color_card', document.getElementById('color-card').value);
    localStorage.setItem('theme_color_btn', document.getElementById('color-btn').value);
    localStorage.setItem('theme_color_text', document.getElementById('color-text').value);
    applySavedTheme();
    alert('থিম সেটিংস সফলভাবে আপডেট করা হয়েছে!');
}

// --- ৩. নোটিশ ক্লাউড সিঙ্ক লজিক ---
async function loadNoticeSettingsDisplay() {
    let defaultText = 'Study mate অ্যাপে আপনাকে স্বাগত। আপনার পড়াশোনার গোল সেট করুন এবং ট্র্যাকিং শুরু করুন।';
    let defaultColor = '#ffffff';
    let defaultSize = '16';

    try {
        if (window.fbFirestore && window.firebaseDb) {
            const noticeSnap = await window.fbFirestore.getDoc(window.fbFirestore.doc(window.firebaseDb, "settings", "global_notice"));
            if (noticeSnap.exists()) {
                const data = noticeSnap.data();
                defaultText = data.text || defaultText;
                defaultColor = data.color || defaultColor;
                defaultSize = data.size || defaultSize;
            }
        }
    } catch (e) {
        console.error("Notice fetch fail:", e);
    }

    const targetEl = document.getElementById('notice-display-text');
    if (targetEl) {
        targetEl.innerText = defaultText;
        targetEl.style.color = defaultColor;
        targetEl.style.fontSize = defaultSize + 'px';
    }
}

async function saveNoticeSettings() {
    if (!currentUser || currentUser.role !== 'admin') return; 
    try {
        await window.fbFirestore.setDoc(window.fbFirestore.doc(window.firebaseDb, "settings", "global_notice"), {
            text: document.getElementById('notice-input-text').value,
            color: document.getElementById('notice-color-picker').value,
            size: document.getElementById('notice-size-picker').value,
            updatedAt: new Date()
        });
        loadNoticeSettingsDisplay();
        alert('কাস্টম নোটিশ বক্স সফলভাবে আপডেট হয়েছে!');
    } catch (error) {
        console.error("Notice save error:", error);
    }
}

// --- ৪. ফায়ারবেস ক্লাউড গ্লোবাল রিয়েল-টাইম লিসেনারস ---
function initFirebaseGlobalListeners() {
    if(!window.fbFirestore || !window.firebaseDb) return;

    window.fbFirestore.onSnapshot(window.fbFirestore.doc(window.firebaseDb, "syllabusData", "global_syllabus"), (docSnap) => {
        if (docSnap.exists()) {
            globalSyllabusData = docSnap.data();
        } else {
            globalSyllabusData = {};
        }
        fixedSubjects.forEach(sub => {
            if (!globalSyllabusData[sub]) globalSyllabusData[sub] = [];
        });
        renderNestedSyllabus();
    });

    window.fbFirestore.onSnapshot(window.fbFirestore.doc(window.firebaseDb, "settings", "daily_task"), (docSnap) => {
        const taskBox = document.getElementById('daily-task-display-box');
        if(taskBox) {
            if(docSnap.exists() && docSnap.data().text) {
                taskBox.innerText = docSnap.data().text;
            } else {
                taskBox.innerText = "আজকের জন্য কোনো রুটিন বা টাস্ক সেট করা হয়নি।";
            }
        }
    });

    // লিডারবোর্ড লিসেনার
    window.fbFirestore.onSnapshot(window.fbFirestore.collection(window.firebaseDb, "liveActivity"), (querySnapshot) => {
        let leaderboardArray = [];
        const currentTodayStr = getLogicalDateString();

        querySnapshot.forEach((doc) => {
            const username = doc.id;
            const userDataMap = doc.data();
            let totalStudySeconds = 0;

            if (userDataMap && userDataMap[currentTodayStr]) {
                const selfStudyTime = userDataMap[currentTodayStr]['Self Study'] || 0;
                const classTime = userDataMap[currentTodayStr]['Class/Mock Test'] || 0;
                totalStudySeconds = selfStudyTime + classTime;
            }
            leaderboardArray.push({ username: username, studyTime: totalStudySeconds });
        });

        leaderboardArray.sort((a, b) => b.studyTime - a.studyTime);
        buildLeaderboardUI(leaderboardArray);
    });

    window.fbFirestore.onSnapshot(window.fbFirestore.doc(window.firebaseDb, "settings", "external_links"), (docSnap) => {
        if(docSnap.exists() && docSnap.data().links) {
            globalDynamicLinks = docSnap.data().links;
        } else {
            globalDynamicLinks = [];
        }
        renderDynamicLinksUI();
        renderAdminLinksTable();
    });

    window.fbFirestore.onSnapshot(window.fbFirestore.doc(window.firebaseDb, "settings", "subject_resources"), (docSnap) => {
        if(docSnap.exists() && docSnap.data().resources) {
            globalSubjectResources = docSnap.data().resources;
        } else {
            globalSubjectResources = {};
        }
        renderResourceSubjectsUI();
        renderAdminResourceTable();
        if(activeResourceSubject) {
            showResourceLinksForSubject(activeResourceSubject);
        }
    });
}

// --- ৫. বাউন্ডারি টাইম ও লজিক্যাল ডেট ক্যালকুলেশন ---
function getLogicalDateString() {
    const boundaryTime = localStorage.getItem('globalDayStartBoundary') || '00:00';
    const [bHour, bMinute] = boundaryTime.split(':').map(Number);
    const now = new Date();

    if (now.getHours() < bHour || (now.getHours() === bHour && now.getMinutes() < bMinute)) {
        const previousDay = new Date(now);
        previousDay.setDate(now.getDate() - 1);
        return formatDateToKey(previousDay);
    }
    return formatDateToKey(now);
}

function formatDateToKey(dateObj) {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// --- ৬. অথেনটিকেশন ও কোর অ্যাপ্লিকেশন রাউটিং SYSTEM ---
async function login() {
    const usernameInput = document.getElementById('login-username').value.trim().toLowerCase();
    const passwordInput = document.getElementById('login-password').value.trim();

    if (!usernameInput || !passwordInput) return;

    try {
        const userCredential = await window.fbSignIn(window.firebaseAuth, `${usernameInput}@studymate.com`, passwordInput);
        const userDocRef = window.fbFirestore.doc(window.firebaseDb, "users", userCredential.user.uid);
        const userDocSnap = await window.fbFirestore.getDoc(userDocRef);

        if (userDocSnap.exists()) {
            currentUser = userDocSnap.data();
        } else {
            currentUser = { username: usernameInput, role: 'user', uid: userCredential.user.uid };
        }

        if (usernameInput === 'admin') {
            currentUser.role = 'admin';
        }

        document.getElementById('login-section').classList.remove('active-section');
        document.getElementById('app-section').classList.add('active-section');
        document.getElementById('welcome-username').innerText = currentUser.username;
        document.getElementById('user-display').innerText = `ইউজার: ${currentUser.username}`;

        if (currentUser.role === 'admin') {
            document.getElementById('admin-menu-item').style.display = 'block';
            document.getElementById('admin-chapter-form').style.display = 'flex';
            if(document.getElementById('admin-task-form')) {
                document.getElementById('admin-task-form').style.display = 'block';
            }
        } else {
            document.getElementById('admin-menu-item').style.display = 'none';
            document.getElementById('admin-chapter-form').style.display = 'none';
            if(document.getElementById('admin-task-form')) {
                document.getElementById('admin-task-form').style.display = 'none';
            }
        }

        await loadUserData();
        showPage('home-page', document.querySelector('.sidebar-item'));

    } catch (error) {
        console.error(error);
        document.getElementById('login-error').innerText = "ভুল ইউজারনেম অথবা পাসওয়ার্ড!";
    }
}

function logout() {
    currentUser = null;
    stopTimer();
    stopSubjectTimer();
    resetPomodoroTimer();
    document.getElementById('login-section').classList.add('active-section');
    document.getElementById('app-section').classList.remove('active-section');
    document.getElementById('sidebar').classList.add('hide');
}

async function loadUserData() {
    if (!currentUser) return;
    
    // লোকালস্টোরেজ থেকে ডাটা রিকভারি লজিক (রিলোড বাগ ফিক্স)
    userDailyLogs = JSON.parse(localStorage.getItem(`userDailyLogs_${currentUser.username}`)) || {};
    userSubjectDailyLogs = JSON.parse(localStorage.getItem(`userSubjectDailyLogs_${currentUser.username}`)) || {};
    userTicksData = JSON.parse(localStorage.getItem(`userTicks_${currentUser.username}`)) || {};

    try {
        if(window.fbFirestore && window.firebaseDb) {
            const liveDocRef = window.fbFirestore.doc(window.firebaseDb, "liveActivity", currentUser.username);
            const liveSnap = await window.fbFirestore.getDoc(liveDocRef);
            if(liveSnap.exists()) {
                const cloudData = liveSnap.data();
                Object.keys(cloudData).forEach(dateKey => {
                    if(typeof cloudData[dateKey] === 'object') {
                        userDailyLogs[dateKey] = {
                            ...userDailyLogs[dateKey],
                            ...cloudData[dateKey]
                        };
                    }
                });
                localStorage.setItem(`userDailyLogs_${currentUser.username}`, JSON.stringify(userDailyLogs));
            }
        }
    } catch (e) {
        console.error("Error loading user logs:", e);
    }

    const fillDropdown = (id) => {
        const el = document.getElementById(id);
        if(el) {
            el.innerHTML = '';
            fixedSubjects.forEach(s => el.innerHTML += `<option value="${s}">${s}</option>`);
        }
    };
    fillDropdown('sub-dropdown');
    fillDropdown('track-subject-dropdown');
    fillDropdown('admin-resource-sub-dropdown'); 

    currentSelectedSubject = fixedSubjects[0];
    currentTrackingSubject = fixedSubjects[0];
    
    updateTrackerCards(); 
    renderNestedSyllabus();
}

function showPage(pageId, element) {
    document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active-page'));
    const targetPage = document.getElementById(pageId);
    if(targetPage) targetPage.classList.add('active-page');

    document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active-nav'));
    if (element) element.classList.add('active-nav');

    document.getElementById('sidebar').classList.add('hide');

    if (pageId === 'self-tracker-page') updateTrackerCards();
    if (pageId === 'public-dashboard-page') renderPublicDashboard();
    if (pageId === 'subject-tracker-page') updateSubjectTrackerUI();
    if (pageId === 'subject-resource-page') renderResourceSubjectsUI(); 
    if (pageId === 'session-report-page') {
        selectedReportDateStr = getLogicalDateString();
        buildCalendar();
        loadReportForDate(selectedReportDateStr);
    }
    if (pageId === 'admin-page' && currentUser && currentUser.role === 'admin') {
        renderUserTable();
        renderAdminLinksTable();
        renderAdminResourceTable(); 
    }
}

document.getElementById('menu-btn').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('hide');
});

// --- ৭. সেল্ফ ট্র্যাকার টাইমিং অপারেশনস ---
function updateTrackerCards() {
    const todayStr = getLogicalDateString();
    if (!userDailyLogs[todayStr]) userDailyLogs[todayStr] = {};

    const mainTimerEl = document.getElementById('main-timer');
    if (mainTimerEl) {
        mainTimerEl.innerText = formatTime(userDailyLogs[todayStr][currentActivity] || 0);
    }
    
    const activityNameEl = document.getElementById('current-activity-name');
    if (activityNameEl) {
        activityNameEl.innerText = currentActivity;
    }

    document.querySelectorAll('.card').forEach(card => {
        const cardHeader = card.querySelector('h3');
        if (cardHeader) {
            const cardActivityName = cardHeader.innerText.trim();
            if (cardActivityName === currentActivity) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
            const timeEl = card.querySelector('.time');
            if (timeEl) {
                timeEl.innerText = formatTime(userDailyLogs[todayStr][cardActivityName] || 0);
            }
        }
    });
}

function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    
    const todayStr = getLogicalDateString();
    if (!userDailyLogs[todayStr]) userDailyLogs[todayStr] = {};
    
    if (!userDailyLogs[todayStr]['startTime']) {
        const now = new Date();
        userDailyLogs[todayStr]['startTime'] = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    mainTimerSessionSeconds = 0; // সেশন শুরু হওয়ার সময় রিসেট
    localStorage.setItem('last_active_timestamp', Date.now()); // ব্যাকগ্রাউন্ড ট্র্যাকিং টাইমস্ট্যাম্প সেট

    timerInterval = setInterval(() => {
        const todayStr = getLogicalDateString();
        if (!userDailyLogs[todayStr]) userDailyLogs[todayStr] = {};

        userDailyLogs[todayStr][currentActivity] = (userDailyLogs[todayStr][currentActivity] || 0) + 1;
        
        // --- ২ ঘণ্টা (৭২০০ সেকেন্ড) অটো-অফ এবং টাইমস্ট্যাম্প ট্র্যাকিং লজিক ---
        mainTimerSessionSeconds++;
        localStorage.setItem('last_active_timestamp', Date.now());

        if (mainTimerSessionSeconds >= 7200) { 
            stopTimer();
            if (isSubjectTimerRunning) stopSubjectTimer();
            alert("আপনার মেইন টাইমারটি একটানা ২ ঘণ্টা চলার কারণে স্বয়ংক্রিয়ভাবে বন্ধ করা হয়েছে।");
            return;
        }
        // -------------------------------------------------------------

        updateTrackerCards();
        
        if (currentUser) {
            localStorage.setItem(`userDailyLogs_${currentUser.username}`, JSON.stringify(userDailyLogs));
        }

        syncTimeWithFirebaseCloud(todayStr);
    }, 1000);
    isRunning = true;
    
    const stopBtn = document.querySelector('.stop-btn');
    if (stopBtn) {
        stopBtn.innerText = "শেষ করুন";
        stopBtn.style.background = "#ef4444";
    }
}

function stopTimer() {
    clearInterval(timerInterval);
    isRunning = false;
    
    const stopBtn = document.querySelector('.stop-btn');
    if (stopBtn) {
        stopBtn.innerText = "শুরু করুন";
        stopBtn.style.background = "var(--theme-btn-bg)";
    }
    syncTimeWithFirebaseCloud(getLogicalDateString());
}

async function syncTimeWithFirebaseCloud(todayStr) {
    if(!currentUser || !window.fbFirestore) return;
    try {
        const now = new Date();
        const currentTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const liveDocRef = window.fbFirestore.doc(window.firebaseDb, "liveActivity", currentUser.username);
        
        await window.fbFirestore.setDoc(liveDocRef, {
            [todayStr]: {
                'Self Study': userDailyLogs[todayStr]['Self Study'] || 0,
                'Class/Mock Test': userDailyLogs[todayStr]['Class/Mock Test'] || 0,
                'Mobile scroll': userDailyLogs[todayStr]['Mobile scroll'] || 0,
                'Prayer': userDailyLogs[todayStr]['Prayer'] || 0,
                'Food': userDailyLogs[todayStr]['Food'] || 0,
                'Sleep': userDailyLogs[todayStr]['Sleep'] || 0,
                'Sports': userDailyLogs[todayStr]['Sports'] || 0,
                'Other': userDailyLogs[todayStr]['Other'] || 0,
                'startTime': userDailyLogs[todayStr]['startTime'] || '--:--',
                'lastActive': currentTimeStr,
                'currentStatus': isRunning ? `${currentActivity} করছেন` : 'থামানো আছে'
            }
        }, { merge: true });
    } catch (e) {
        console.error("Cloud tracking sync error:", e);
    }
}

function selectActivity(activityName, element) {
    if (isRunning) {
        clearInterval(timerInterval);
        currentActivity = activityName;
        startTimer();
    } else {
        currentActivity = activityName;
        updateTrackerCards();
    }
}

if (document.querySelector('.stop-btn')) {
    document.querySelector('.stop-btn').addEventListener('click', () => {
        if (isRunning) {
            stopTimer();
        } else {
            startTimer();
        }
    });
}

function formatTime(totalSeconds) {
    const hrs = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
}

// --- ৮. পাবলিক স্টাডি ড্যাশবোর্ড ইঞ্জিন (অনলাইন/অফলাইন ইন্ডিকেটরসহ) ---
function renderPublicDashboard() {
    const grid = document.getElementById('public-dashboard-grid');
    if (!grid || !window.fbFirestore || !window.firebaseDb) return;

    window.fbFirestore.onSnapshot(window.fbFirestore.collection(window.firebaseDb, "liveActivity"), (querySnapshot) => {
        grid.innerHTML = '';
        const todayStr = getLogicalDateString();

        if (querySnapshot.empty) {
            grid.innerHTML = '<p style="color:#64748b; font-style:italic; padding: 20px;">আজকে এখনও কেউ অ্যাপে অ্যাক্টিভ হয়নি।</p>';
            return;
        }

        querySnapshot.forEach((doc) => {
            const username = doc.id;
            const userDataMap = doc.data();
            
            let selfStudySec = 0;
            let classSec = 0;
            let startTime = '--:--';
            let lastActive = '--:--'; 
            let currentStatus = 'অফলাইন';

            if (userDataMap && userDataMap[todayStr]) {
                selfStudySec = userDataMap[todayStr]['Self Study'] || 0;
                classSec = userDataMap[todayStr]['Class/Mock Test'] || 0;
                startTime = userDataMap[todayStr]['startTime'] || '--:--';
                lastActive = userDataMap[todayStr]['lastActive'] || '--:--'; 
                currentStatus = userDataMap[todayStr]['currentStatus'] || 'থামানো আছে';
            }

            const totalSec = selfStudySec + classSec;
            const isUserOnline = currentStatus !== 'অফলাইন' && currentStatus !== 'অফলাইন / বের হয়ে গেছেন' && currentStatus !== 'থামানো আছে';

            grid.innerHTML += `
                <div class="card" style="padding: 20px; background: var(--theme-card-bg); border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border-left: 4px solid var(--theme-btn-bg); display: flex; flex-direction: column; gap: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 style="margin: 0; color: #fff; font-size: 1.2rem; font-weight: 600;"><i class="fa-solid fa-user-graduate" style="color:var(--theme-btn-bg); margin-right:8px;"></i>${username.toUpperCase()}</h3>
                        <span style="font-size: 0.75rem; background: ${isUserOnline ? '#22c55e' : '#64748b'}; padding: 4px 8px; border-radius: 20px; color: #fff; font-weight: 500;">
                            ● ${isUserOnline ? 'Active' : 'Offline'}: ${lastActive}
                        </span>
                    </div>
                    <div style="font-size: 0.85rem; color: #e2e8f0; background: ${isUserOnline ? 'rgba(59, 130, 246, 0.2)' : 'rgba(100, 116, 139, 0.2)'}; padding: 5px 10px; border-radius: 6px; text-align: center; font-weight: 500;">
                        স্ট্যাটাস: ${currentStatus}
                    </div>
                    <div style="font-size: 0.85rem; color: #94a3b8; display: flex; align-items: center; gap: 5px;">
                        <i class="fa-solid fa-clock-rotate-left"></i> স্টার্ট টাইম: <strong>${startTime}</strong>
                    </div>
                    <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; font-size: 0.9rem; color: #cbd5e1; margin: 5px 0;">
                        <div style="margin-bottom: 4px;">📖 Self Study: <span style="font-weight: bold; color: #3b82f6;">${formatTime(selfStudySec)}</span></div>
                        <div>💻 Class/Test: <span style="font-weight: bold; color: #ec4899;">${formatTime(classSec)}</span></div>
                    </div>
                    <div style="font-size: 1rem; font-weight: bold; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #334155; padding-top: 10px; margin-top: 5px;">
                        <span style="color: #94a3b8;">মোট পড়াশোনা:</span>
                        <span style="color: #10b981; font-size: 1.1rem;">${Math.floor(totalSec / 3600)}h ${Math.round((totalSec % 3600) / 60)}m</span>
                    </div>
                </div>
            `;
        });
    });
}

// --- ৯. সাবজেক্ট ট্র্যাকার ও পোমোডোরো কোড লজিক ---
function updateSubjectTrackerUI() {
    const todayStr = getLogicalDateString();
    if (!userSubjectDailyLogs[todayStr]) userSubjectDailyLogs[todayStr] = {};

    currentTrackingSubject = document.getElementById('track-subject-dropdown').value;
    document.getElementById('subject-main-timer').innerText = formatTime(userSubjectDailyLogs[todayStr][currentTrackingSubject] || 0);

    const logsBox = document.getElementById('subject-today-logs-box');
    if(logsBox) {
        logsBox.innerHTML = '<strong style="color:var(--theme-btn-bg); display:block; margin-bottom:5px;">আজকের সাবজেক্টভিত্তিক পড়াশোনা:</strong>';
        fixedSubjects.forEach(s => {
            const sec = userSubjectDailyLogs[todayStr][s] || 0;
            if(sec > 0) {
                logsBox.innerHTML += `<div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid #1e293b;"><span>${s}:</span> <strong>${formatTime(sec)}</strong></div>`;
            }
        });
    }
}

if(document.getElementById('track-subject-dropdown')){
    document.getElementById('track-subject-dropdown').addEventListener('change', (e) => {
        currentTrackingSubject = e.target.value;
        updateSubjectTrackerUI();
    });
}

function toggleSubjectTimer() {
    if(isSubjectTimerRunning) {
        clearInterval(subjectTimerInterval);
        isSubjectTimerRunning = false;
        document.getElementById('subject-timer-toggle-btn').innerText = "সাবজেক্ট স্টাডি শুরু করুন";
        document.getElementById('subject-timer-toggle-btn').style.background = "var(--theme-btn-bg)";
    } else {
        currentTrackingSubject = document.getElementById('track-subject-dropdown').value;
        
        if(!isRunning) {
            currentActivity = 'Self Study';
            startTimer();
        }

        subjectTimerSessionSeconds = 0; // সাবজেক্ট কাউন্টার রিসেট

        subjectTimerInterval = setInterval(() => {
            const tStr = getLogicalDateString();
            if (!userSubjectDailyLogs[tStr]) userSubjectDailyLogs[tStr] = {};
            userSubjectDailyLogs[tStr][currentTrackingSubject] = (userSubjectDailyLogs[tStr][currentTrackingSubject] || 0) + 1;
            
            if (!userDailyLogs[tStr]) userDailyLogs[tStr] = {};
            userDailyLogs[tStr]['Self Study'] = (userDailyLogs[tStr]['Self Study'] || 0) + 1;
            
            // --- ২ ঘণ্টা (৭২০০ সেকেন্ড) অটো-অফ লজিক ---
            subjectTimerSessionSeconds++;
            if (subjectTimerSessionSeconds >= 7200) {
                stopSubjectTimer();
                alert(`আপনার ${currentTrackingSubject} সাবজেক্ট টাইমারটি একটানা ২ ঘণ্টা চলার কারণে স্বয়ংক্রিয়ভাবে বন্ধ করা হয়েছে।`);
                return;
            }
            // -----------------------------------------

            updateSubjectTrackerUI();
            updateTrackerCards();

            if (currentUser) {
                localStorage.setItem(`userSubjectDailyLogs_${currentUser.username}`, JSON.stringify(userSubjectDailyLogs));
                localStorage.setItem(`userDailyLogs_${currentUser.username}`, JSON.stringify(userDailyLogs));
            }
        }, 1000);

        isSubjectTimerRunning = true;
        document.getElementById('subject-timer-toggle-btn').innerText = "সাবজেক্ট স্টাডি শেষ করুন";
        document.getElementById('subject-timer-toggle-btn').style.background = "#ef4444";
    }
}

function stopSubjectTimer() {
    if(isSubjectTimerRunning) {
        clearInterval(subjectTimerInterval);
        isSubjectTimerRunning = false;
        document.getElementById('subject-timer-toggle-btn').innerText = "সাবজেক্ট স্টাডি শুরু করুন";
        document.getElementById('subject-timer-toggle-btn').style.background = "var(--theme-btn-bg)";
    }
}

function setCustomPomodoroTime() {
    const mins = parseInt(document.getElementById('pomo-custom-minutes').value) || 25;
    pomodoroRemainingSeconds = mins * 60;
    updatePomodoroDisplay();
}

function updatePomodoroDisplay() {
    const m = String(Math.floor(pomodoroRemainingSeconds / 60)).padStart(2, '0');
    const s = String(pomodoroRemainingSeconds % 60).padStart(2, '0');
    document.getElementById('pomodoro-display-timer').innerText = `${m}:${s}`;
}

function togglePomodoroTimer() {
    if(isPomodoroRunning) {
        clearInterval(pomodoroInterval);
        isPomodoroRunning = false;
        document.getElementById('pomo-start-btn').innerText = "স্টার্ট পোমোডোরো";
        document.getElementById('pomo-status-text').innerText = "পোমোডোরো থামানো হয়েছে";
    } else {
        isPomodoroRunning = true;
        document.getElementById('pomo-start-btn').innerText = "পজ পোমোডোরো";
        document.getElementById('pomo-status-text').innerText = "⏱️ ফোকাস সেশন চলছে...";
        
        pomodoroSessionSeconds = 0; // সেশন রিসেট

        pomodoroInterval = setInterval(() => {
            if(pomodoroRemainingSeconds > 0) {
                pomodoroRemainingSeconds--;
                
                // --- ২ ঘণ্টা অটো-অফ লজিক ---
                pomodoroSessionSeconds++;
                if (pomodoroSessionSeconds >= 7200) {
                    clearInterval(pomodoroInterval);
                    isPomodoroRunning = false;
                    document.getElementById('pomo-start-btn').innerText = "স্টার্ট পোমোডোরো";
                    document.getElementById('pomo-status-text').innerText = "টাইমার বন্ধ আছে";
                    alert("পোমোডোরো টাইমারটি একটানা ২ ঘণ্টা চলার কারণে স্বয়ংক্রিয়ভাবে বন্ধ করা হয়েছে।");
                    return;
                }
                // ---------------------------

                updatePomodoroDisplay();
            } else {
                clearInterval(pomodoroInterval);
                isPomodoroRunning = false;
                alert("Pomodoro Session Completed! Take a short break.");
                resetPomodoroTimer();
            }
        }, 1000);
    }
}

function resetPomodoroTimer() {
    clearInterval(pomodoroInterval);
    isPomodoroRunning = false;
    document.getElementById('pomo-start-btn').innerText = "স্টার্ট পোমোডোরো";
    document.getElementById('pomo-status-text').innerText = "টাইমার বন্ধ আছে";
    setCustomPomodoroTime();
}

function renderResourceSubjectsUI() {
    const container = document.getElementById('resource-subject-list');
    if(!container) return;
    container.innerHTML = '';
    
    fixedSubjects.forEach(sub => {
        const linkCount = globalSubjectResources[sub] ? globalSubjectResources[sub].length : 0;
        container.innerHTML += `
            <div class="card" onclick="showResourceLinksForSubject('${sub}')" style="padding: 15px; border-left: 4px solid var(--theme-btn-bg); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px;">
                <i class="fa-solid fa-book-bookmark" style="font-size: 1.3rem; color: var(--theme-btn-bg);"></i>
                <h3 style="font-size: 0.9rem; text-align: center; margin: 0;">${sub}</h3>
                <span style="font-size: 0.75rem; color: #64748b;">লিংক সংখ্যা: ${linkCount}টি</span>
            </div>`;
    });
}

function showResourceLinksForSubject(subName) {
    activeResourceSubject = subName;
    const box = document.getElementById('subject-links-display-box');
    const title = document.getElementById('current-resource-subject-title');
    const container = document.getElementById('resource-links-container');
    
    if(!box || !title || !container) return;
    
    title.innerText = `📚 ${subName} এর গুরুত্বপূর্ণ রিসোর্স ও লিংকস`;
    container.innerHTML = '';
    box.style.display = 'block';
    
    const links = globalSubjectResources[subName] || [];
    if(links.length === 0) {
        container.innerHTML = `<p style="color: #64748b; font-style: italic; font-size: 0.9rem; margin: 0;">এই বিষয়ের অধীনে এখনও কোনো লিংক ফাইল যুক্ত করা হয়নি।</p>`;
        return;
    }
    
    links.forEach(item => {
        container.innerHTML += `
            <a href="${item.url}" target="_blank" style="display: flex; justify-content: space-between; align-items: center; background: var(--theme-bg); border-radius: 6px; padding: 12px 15px; border: 1px solid #334155; text-decoration: none; color: white; font-size: 0.9rem; font-weight: 500; transition: background 0.2s;">
                <span><i class="fa-solid fa-link" style="color: #10b981; margin-right: 8px;"></i> ${item.title}</span>
                <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.8rem; color: #64748b;"></i>
            </a>`;
    });
}

async function uploadResourceLinksToFirebase() {
    if(!window.fbFirestore || !window.firebaseDb) return;
    try {
        const docRef = window.fbFirestore.doc(window.firebaseDb, "settings", "subject_resources");
        await window.fbFirestore.setDoc(docRef, { resources: globalSubjectResources });
    } catch(e) {
        console.error("Resource upload error:", e);
    }
}

function addSubjectResourceLink() {
    if (!currentUser || currentUser.role !== 'admin') return;
    const sub = document.getElementById('admin-resource-sub-dropdown').value;
    const titleInput = document.getElementById('admin-resource-title');
    const urlInput = document.getElementById('admin-resource-url');
    
    const title = titleInput.value.trim();
    const url = urlInput.value.trim();

    if(!title || !url) return alert("দয়া করে লিংকের দৃশ্যমান নাম এবং লুকানো URL দুটিই ইনপুট দিন!");

    if(!globalSubjectResources[sub]) globalSubjectResources[sub] = [];
    globalSubjectResources[sub].push({ title: title, url: url });
    
    titleInput.value = '';
    urlInput.value = '';

    renderAdminResourceTable();
    uploadResourceLinksToFirebase();
}

function deleteSubjectResourceLink(sub, idx) {
    if (!currentUser || currentUser.role !== 'admin') return;
    if(confirm(`আপনি কি নিশ্চিতভাবে "${globalSubjectResources[sub][idx].title}" লিংকটি ডিলিট করতে চান?`)) {
        globalSubjectResources[sub].splice(idx, 1);
        renderAdminResourceTable();
        uploadResourceLinksToFirebase();
    }
}

function renderAdminResourceTable() {
    const tbody = document.getElementById('admin-resource-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    fixedSubjects.forEach(sub => {
        const links = globalSubjectResources[sub] || [];
        links.forEach((link, idx) => {
            tbody.innerHTML += `
                <tr>
                    <td style="color: var(--theme-btn-bg); font-weight: bold;">${sub}</td>
                    <td>${link.title}</td>
                    <td><a href="${link.url}" target="_blank" style="color: #64748b; font-size: 0.8rem; word-break: break-all;">${link.url}</a></td>
                    <td><button onclick="deleteSubjectResourceLink('${sub}', ${idx})" class="kick-btn">ডিলিট</button></td>
                </tr>`;
        });
    });
}

function renderNestedSyllabus() {
    const container = document.getElementById('syllabus-nested-container');
    if(!container) return;
    container.innerHTML = '';

    const chapters = globalSyllabusData[currentSelectedSubject] || [];
    
    if (chapters.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px; color: #64748b;">এই বিষয়ের সিলেবাস ডাটাবেজ খালি।</p>';
        return;
    }

    const isAdmin = currentUser && currentUser.role === 'admin';

    chapters.forEach((chap, cIdx) => {
        let subunitsHtml = '';
        chap.subunits.forEach((unit, uIdx) => {
            const tickKey = `${currentSelectedSubject}_${cIdx}_${uIdx}`;
            const isChecked = userTicksData[tickKey] || false;
            
            subunitsHtml += `
                <div class="subunit-item ${isChecked ? 'completed' : ''}">
                    <div class="subunit-left">
                        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleSubunitTick('${tickKey}', this.checked)">
                        <span>${unit}</span>
                    </div>
                    ${isAdmin ? `
                        <button class="delete-btn-icon" onclick="deleteSubunit(${cIdx}, ${uIdx})">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    ` : ''}
                </div>
            `;
        });

        const isCollapsed = chap.collapsed || false;
        container.innerHTML += `
            <div class="chapter-block ${isCollapsed ? 'collapsed' : ''}">
                <div class="chapter-header">
                    <span class="chapter-title">${chap.title}</span>
                    <div style="display: flex; align-items: center;">
                        ${isAdmin ? `
                            <button class="delete-btn-icon" onclick="deleteMainChapter(${cIdx})" style="margin-right: 12px;">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        ` : ''}
                        <button class="delete-btn-icon" onclick="toggleChapter(${cIdx})">
                            <i class="fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}"></i>
                        </button>
                    </div>
                </div>
                <div class="subunit-container">
                    ${subunitsHtml}
                </div>
                ${isAdmin ? `
                    <div class="add-subunit-form">
                        <input type="text" id="subunit-input-${cIdx}" placeholder="নতুন সাব-ইউনিট...">
                        <button onclick="addSubunit(${cIdx})">যোগ</button>
                    </div>
                ` : ''}
            </div>
        `;
    });
}

async function uploadSyllabusToFirebase() {
    if(!window.fbFirestore || !window.firebaseDb) return;
    try {
        await window.fbFirestore.setDoc(window.fbFirestore.doc(window.firebaseDb, "syllabusData", "global_syllabus"), globalSyllabusData);
    } catch(e) {
        console.error("Syllabus sync error:", e);
    }
}

function selectSubject(val) {
    currentSelectedSubject = val;
    renderNestedSyllabus();
}

function addMainChapter() {
    if (!currentUser || currentUser.role !== 'admin') return;
    const title = document.getElementById('new-chapter-input').value.trim();
    if (!title) return;

    if (!globalSyllabusData[currentSelectedSubject]) {
        globalSyllabusData[currentSelectedSubject] = [];
    }

    globalSyllabusData[currentSelectedSubject].push({
        title: title,
        collapsed: false,
        subunits: []
    });

    document.getElementById('new-chapter-input').value = '';
    uploadSyllabusToFirebase();
}

function deleteMainChapter(index) {
    if (!currentUser || currentUser.role !== 'admin') return;
    if(confirm("আপনি কি নিশ্চিতভাবে এই পুরো অধ্যায়টি মুছে ফেলতে চান?")) {
        globalSyllabusData[currentSelectedSubject].splice(index, 1);
        uploadSyllabusToFirebase();
    }
}

function addSubunit(chapterIndex) {
    if (!currentUser || currentUser.role !== 'admin') return;
    const inputEl = document.getElementById(`subunit-input-${chapterIndex}`);
    const name = inputEl.value.trim();
    if (!name) return;

    globalSyllabusData[currentSelectedSubject][chapterIndex].subunits.push(name);
    inputEl.value = '';
    uploadSyllabusToFirebase();
}

function deleteSubunit(chapterIndex, subunitIndex) {
    if (!currentUser || currentUser.role !== 'admin') return;
    globalSyllabusData[currentSelectedSubject][chapterIndex].subunits.splice(subunitIndex, 1);
    uploadSyllabusToFirebase();
}

function toggleChapter(index) {
    const currentVal = globalSyllabusData[currentSelectedSubject][index].collapsed || false;
    globalSyllabusData[currentSelectedSubject][index].collapsed = !currentVal;
    renderNestedSyllabus();
}

function toggleSubunitTick(tickKey, isChecked) {
    userTicksData[tickKey] = isChecked;
    if (currentUser) {
        localStorage.setItem(`userTicks_${currentUser.username}`, JSON.stringify(userTicksData));
    }
    renderNestedSyllabus();
}

function buildLeaderboardUI(sortedUsers) {
    const tbody = document.getElementById('leaderboard-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';

    if (sortedUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">আজকের কোনো ট্র্যাকিং রেকর্ড নেই।</td></tr>';
        return;
    }

    sortedUsers.forEach((userObj, index) => {
        const row = document.createElement('tr');
        if (currentUser && userObj.username === currentUser.username) {
            row.style.color = 'var(--theme-btn-bg)';
            row.style.fontWeight = 'bold';
        }

        const hrs = Math.floor(userObj.studyTime / 3600);
        const mins = Math.round((userObj.studyTime % 3600) / 60);

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${userObj.username.toUpperCase()}</td>
            <td>${hrs}h ${mins}m</td>
        `;
        tbody.appendChild(row);
    });
}

async function saveDailyTaskSetting() {
    if (!currentUser || currentUser.role !== 'admin') return;
    const txt = document.getElementById('admin-task-input').value.trim();
    try {
        await window.fbFirestore.setDoc(window.fbFirestore.doc(window.firebaseDb, "settings", "daily_task"), {
            text: txt,
            updatedAt: new Date()
        });
        alert("আজকের ডেইলি টাস্ক সফলভাবে ক্লাউডে পোস্ট করা হয়েছে!");
    } catch(err) {
        console.error(err);
    }
}

function openGoogleDrive() {
    window.open("https://drive.google.com/", "_blank");
}

function triggerLocalFilePicker() {
    document.getElementById('hidden-local-file-picker').click();
}

function handleLocalFileSelect(event) {
    const file = event.target.files[0];
    const statusBox = document.getElementById('file-status-box');
    if (file && statusBox) {
        statusBox.innerHTML = `লোকাল ফাইল লোড হয়েছে: <strong>${file.name}</strong> (${(file.size/(1024*1024)).toFixed(2)} MB)`;
        statusBox.style.display = "block";
    }
}

function renderDynamicLinksUI() {
    const sidebarContainer = document.getElementById('dynamic-links-sidebar-container');
    if(!sidebarContainer) return;
    sidebarContainer.innerHTML = '';

    globalDynamicLinks.forEach(link => {
        sidebarContainer.innerHTML += `
            <a href="${link.url}" target="_blank" class="sidebar-item" style="border-left: 2px dashed var(--theme-btn-bg);">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> ${link.title}
            </a>
        `;
    });
}

function renderAdminLinksTable() {
    const tbody = document.getElementById('admin-links-table-body');
    if(!tbody) return;
    tbody.innerHTML = '';

    globalDynamicLinks.forEach((link, idx) => {
        tbody.innerHTML += `
            <tr>
                <td>${link.title}</td>
                <td><small>${link.url}</small></td>
                <td><button onclick="deleteDynamicExternalLink(${idx})" class="kick-btn">মুছুন</button></td>
            </tr>
        `;
    });
}

async function addDynamicExternalLink() {
    if (!currentUser || currentUser.role !== 'admin') return;
    const t = document.getElementById('admin-link-title').value.trim();
    const u = document.getElementById('admin-link-url').value.trim();

    if(!t || !u) return alert("লিংকের নাম ও ইউআরএল দিন!");

    globalDynamicLinks.push({ title: t, url: u });
    document.getElementById('admin-link-title').value = '';
    document.getElementById('admin-link-url').value = '';

    try {
        await window.fbFirestore.setDoc(window.fbFirestore.doc(window.firebaseDb, "settings", "external_links"), { links: globalDynamicLinks });
    } catch(e) { console.error(e); }
}

async function deleteDynamicExternalLink(idx) {
    if (!currentUser || currentUser.role !== 'admin') return;
    globalDynamicLinks.splice(idx, 1);
    try {
        await window.fbFirestore.setDoc(window.fbFirestore.doc(window.firebaseDb, "settings", "external_links"), { links: globalDynamicLinks });
    } catch(e) { console.error(e); }
}

async function renderUserTable() {
    const tbody = document.getElementById('user-table-body');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3">ইউজার টেবিল লোড হচ্ছে...</td></tr>';

    try {
        const querySnapshot = await window.fbFirestore.getDocs(window.fbFirestore.collection(window.firebaseDb, "users"));
        tbody.innerHTML = '';
        querySnapshot.forEach((doc) => {
            const u = doc.data();
            tbody.innerHTML += `
                <tr>
                    <td><strong>${u.username}</strong> (${u.role})</td>
                    <td><code>${u.password || '******'}</code></td>
                    <td><button onclick="deleteLiveUser('${doc.id}', '${u.username}')" class="kick-btn">কিক</button></td>
                </tr>
            `;
        });
    } catch (e) {
        console.error(e);
    }
}

async function addUser() {
    if (!currentUser || currentUser.role !== 'admin') return;
    const u = document.getElementById('new-username').value.trim().toLowerCase();
    const p = document.getElementById('new-password').value.trim();

    if (!u || p.length < 6) return alert("ইউজারনেম দিন এবং পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের রাখুন!");

    try {
        const uCred = await window.fbCreateUser(window.firebaseAuth, `${u}@studymate.com`, p);
        await window.fbFirestore.setDoc(window.fbFirestore.doc(window.firebaseDb, "users", uCred.user.uid), {
            username: u,
            password: p,
            role: 'user',
            uid: uCred.user.uid
        });
        document.getElementById('new-username').value = '';
        document.getElementById('new-password').value = '';
        renderUserTable();
        alert(`সফলভাবে "${u}" অ্যাকাউন্ট তৈরি করা হয়েছে!`);
    } catch (e) {
        alert("অ্যাকাউন্ট তৈরি করা ব্যর্থ হয়েছে!");
    }
}

async function deleteLiveUser(docId, targetUsername) {
    if (!currentUser || currentUser.role !== 'admin') return;
    if (targetUsername === 'admin') return alert("প্রধান অ্যাডমিন অ্যাকাউন্ট কিক করা সম্ভব নয়!");
    
    if (confirm(`আপনি কি নিশ্চিতভাবে "${targetUsername}" ইউজারকে সম্পূর্ণ কিক করতে চান?`)) {
        try {
            await window.fbFirestore.deleteDoc(window.fbFirestore.doc(window.firebaseDb, "users", docId));
            renderUserTable();
        } catch (e) { console.error(e); }
    }
}

function saveDayStartSetting() {
    if (!currentUser || currentUser.role !== 'admin') return;
    const timeVal = document.getElementById('day-start-time').value;
    if(!timeVal) return;
    localStorage.setItem('globalDayStartBoundary', timeVal);
    alert(`দিন পরিবর্তনের বেঞ্চমার্ক সফলভাবে ${timeVal} টায় সেট করা হয়েছে!`);
}

function changeMonth(direction) {
    calendarCurrentDate.setMonth(calendarCurrentDate.getMonth() + direction);
    buildCalendar();
}

function buildCalendar() {
    const grid = document.getElementById('calendar-days-grid');
    if(!grid) return;
    grid.innerHTML = '';

    const year = calendarCurrentDate.getFullYear();
    const month = calendarCurrentDate.getMonth();

    const monthNames = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
    document.getElementById('calendar-month-year').innerText = `${monthNames[month]} - ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const adjustedFirstDay = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

    for (let i = 0; i < adjustedFirstDay; i++) {
        grid.innerHTML += `<div class="empty-cell"></div>`;
    }

    for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        let cellClass = '';
        
        if (dateStr === selectedReportDateStr) {
            cellClass = 'active-date';
        } else if (userDailyLogs[dateStr]) {
            cellClass = 'has-data';
        }

        grid.innerHTML += `<div class="${cellClass}" onclick="loadReportForDate('${dateStr}')">${day}</div>`;
    }
}

function loadReportForDate(dateStr) {
    selectedReportDateStr = dateStr;
    if(document.getElementById('selected-date-display')) {
        document.getElementById('selected-date-display').innerText = dateStr;
    }

    const dayData = userDailyLogs[dateStr] || {};
    let totalSeconds = 0;

    const activities = ['Self Study', 'Class/Mock Test', 'Mobile scroll', 'Prayer', 'Food', 'Sleep', 'Sports', 'Other'];
    const chartValues = [];
    
    activities.forEach((act) => {
        const sec = dayData[act] || 0;
        totalSeconds += sec;
        const cleanId = act.replace(/[^a-zA-Z]/g, ""); 
        const targetElement = document.getElementById(`rep-time-${cleanId}`);
        if(targetElement) targetElement.innerText = `${Math.round(sec / 60)}m`;
        chartValues.push(sec);
    });

    const totalHrs = Math.floor(totalSeconds / 3600);
    const totalMins = Math.round((totalSeconds % 3600) / 60);
    const totTimeEl = document.getElementById('report-total-time');
    if(totTimeEl) totTimeEl.innerText = `${totalHrs}h ${totalMins}m`;

    const chartEl = document.getElementById('report-donut-chart');
    const centerText = document.getElementById('donut-center-text');
    if(!chartEl) return;

    if (totalSeconds === 0) {
        chartEl.style.background = `conic-gradient(#334155 0% 100%)`;
        centerText.innerText = "No Data Available";
    } else {
        let currentPercent = 0;
        let gradientStops = [];
        const colors = ['#3b82f6', '#10b981', '#f43f5e', '#eab308', '#a855f7', '#6366f1', '#06b6d4', '#64748b'];

        chartValues.forEach((val, i) => {
            if (val > 0) {
                const startDeg = (currentPercent / totalSeconds) * 360;
                currentPercent += val;
                const endDeg = (currentPercent / totalSeconds) * 360;
                gradientStops.push(`${colors[i]} ${startDeg}deg ${endDeg}deg`);
            }
        });
        chartEl.style.background = `conic-gradient(${gradientStops.join(', ')})`;
        centerText.innerText = "Data Loaded";
    }

    buildCalendar();
}

// --- ১০. মোবাইল ব্যাকগ্রাউন্ড সেশন ট্র্যাকার এবং স্মার্ট সিঙ্ক ইঞ্জিন (Visibility API) ---
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isRunning) {
        const lastActive = parseInt(localStorage.getItem('last_active_timestamp')) || Date.now();
        const now = Date.now();
        let elapsedSeconds = Math.floor((now - lastActive) / 1000);

        if (elapsedSeconds > 1) {
            // যদি ব্যাকগ্রাউন্ডে থাকার সময়েই ২ ঘণ্টার লিমিট পার হয়ে যায়, তবে সেশন লিমিট অনুযায়ী সময় নেওয়া হবে
            const remainingToLimit = 7200 - mainTimerSessionSeconds;
            if (elapsedSeconds >= remainingToLimit) {
                elapsedSeconds = remainingToLimit;
            }

            const todayStr = getLogicalDateString();
            
            // মেইন টাইমার আপডেট ও লোকাল মেমরি সিঙ্ক
            userDailyLogs[todayStr][currentActivity] = (userDailyLogs[todayStr][currentActivity] || 0) + elapsedSeconds;
            mainTimerSessionSeconds += elapsedSeconds;
            
            // সাবজেক্ট টাইমারও সচল থাকলে ব্যাকগ্রাউন্ডের টাইম যোগ করা
            if (isSubjectTimerRunning) {
                userSubjectDailyLogs[todayStr][currentTrackingSubject] = (userSubjectDailyLogs[todayStr][currentTrackingSubject] || 0) + elapsedSeconds;
                subjectTimerSessionSeconds += elapsedSeconds;
            }

            // লোকাল স্টোরেজ ক্লাউড ব্যাকআপ সিঙ্ক
            if (currentUser) {
                localStorage.setItem(`userDailyLogs_${currentUser.username}`, JSON.stringify(userDailyLogs));
                localStorage.setItem(`userSubjectDailyLogs_${currentUser.username}`, JSON.stringify(userSubjectDailyLogs));
            }

            // লাইভ ইউআই ও ফায়ারবেস আপডেট রেন্ডারিং
            updateTrackerCards();
            if (isSubjectTimerRunning) updateSubjectTrackerUI();
            syncTimeWithFirebaseCloud(todayStr);

            // ব্যাকগ্রাউন্ড থেকে ফেরার পর যদি ২ ঘণ্টা পূর্ণ বা অতিক্রম হয়ে থাকে তবে ইনস্ট্যান্ট সব অফ করা
            if (mainTimerSessionSeconds >= 7200) {
                stopTimer();
                if (isSubjectTimerRunning) stopSubjectTimer();
                alert("ব্যাকগ্রাউন্ডে আপনার সেশন ২ ঘণ্টা অতিক্রম করায় টাইমারগুলো স্বয়ংক্রিয়ভাবে বন্ধ করে ক্লাউডে সেভ করা হয়েছে।");
            }
        }
    }
});