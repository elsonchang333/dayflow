// DayFlow Web - 完整功能版（含 Supabase 登录同步）
// 功能：待办、饮食、习惯、日记、番茄钟、统计、导出/导入、深色模式、通知、登录同步

// ==================== Supabase Config ====================
const SUPABASE_URL = 'https://zwmulguxnpidlmyjnpge.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3bXVsZ3V4bnBpZGxteWpucGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTIwMjIsImV4cCI6MjA4NzE2ODAyMn0.Ft7u2_oco7JkQBrbEzhG2_rDihIaGs60f-Sfwb2FSAU';

// 初始化 Supabase 客户端
let supabaseClient = null;

// ==================== Storage ====================
const Storage = {
    get(key) {
        try {
            const data = localStorage.getItem('dayflow_' + key);
            if (!data || data === 'undefined' || data === 'null') return null;
            return JSON.parse(data);
        } catch (e) {
            console.warn('⚠️ Storage get error for key:', key, e);
            return null;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem('dayflow_' + key, JSON.stringify(value));
        } catch (e) {
            console.error('❌ Storage set error:', e);
        }
    }
};

// ==================== State ====================
// 安全获取数据，防止 localStorage 损坏
function safeGet(key, defaultValue = null) {
    try {
        const result = Storage.get(key);
        return result === undefined ? defaultValue : (result || defaultValue);
    } catch (e) {
        console.warn('safeGet error:', key, e);
        return defaultValue;
    }
}

let todos = safeGet('todos', []);
let habits = safeGet('habits', []);
let diets = safeGet('diets', []);
let diaries = safeGet('diaries', []);
let pomodoroHistory = safeGet('pomodoroHistory', []);
let schedules = safeGet('schedules', []); // 行程数据
let currentDate = new Date();
let selectedMood = 3;
let editingDiaryId = null; // 当前编辑的日记ID

// ==================== Auth State ====================
let currentUser = null;
let lastSyncTime = 0;

// ==================== Supabase Init ====================
async function initSupabase() {
    try {
        // 动态加载 Supabase 库
        if (typeof supabase === 'undefined') {
            await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.3/dist/umd/supabase.min.js');
        }
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
        // 检查登录状态
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session) {
            currentUser = session.user;
            await loadCloudData();
        }
        
        updateAuthUI();
        return true;
    } catch (e) {
        console.error('Supabase init error:', e);
        return false;
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// ==================== Auth Functions ====================
async function signIn(email, password) {
    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = data.user;
        await loadCloudData();
        updateAuthUI();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function signUp(email, password) {
    try {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function signOut() {
    try {
        await supabaseClient.auth.signOut();
        currentUser = null;
        updateAuthUI();
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function updateAuthUI() {
    const userEmailDisplay = document.getElementById('userEmailDisplay');
    const syncBtn = document.getElementById('syncBtn');
    const loginActionItem = document.getElementById('loginActionItem');
    const logoutActionItem = document.getElementById('logoutActionItem');
    
    if (userEmailDisplay) {
        userEmailDisplay.textContent = currentUser ? currentUser.email : '未登录';
    }
    if (syncBtn) {
        syncBtn.style.display = currentUser ? 'inline-block' : 'none';
    }
    if (loginActionItem) {
        loginActionItem.style.display = currentUser ? 'none' : 'block';
    }
    if (logoutActionItem) {
        logoutActionItem.style.display = currentUser ? 'block' : 'none';
    }
}

// ==================== Cloud Sync (使用分開的表) ====================
async function saveAllData() {
    // 保存到本地
    Storage.set('todos', todos);
    Storage.set('habits', habits);
    Storage.set('diets', diets);
    Storage.set('diaries', diaries);
    Storage.set('pomodoroHistory', pomodoroHistory);
    
    // 如果已登录，同步到云端
    if (currentUser && supabaseClient) {
        await syncToCloud();
    }
}

async function syncToCloud() {
    if (!currentUser || !supabaseClient) return;
    
    showSyncLoading(true);
    
    try {
        const userId = currentUser.id;
        
        // 上傳 todos
        if (todos.length > 0) {
            const todosWithUser = todos.map(t => ({
                ...t,
                user_id: userId
            }));
            const { error } = await supabaseClient
                .from('todos')
                .upsert(todosWithUser, { onConflict: 'id' });
            if (error) console.error('Todos sync error:', error);
        }
        
        // 上傳 habits
        if (habits.length > 0) {
            const habitsWithUser = habits.map(h => ({
                ...h,
                user_id: userId
            }));
            const { error } = await supabaseClient
                .from('habits')
                .upsert(habitsWithUser, { onConflict: 'id' });
            if (error) console.error('Habits sync error:', error);
        }
        
        // 上傳 diets
        if (diets.length > 0) {
            const dietsWithUser = diets.map(d => ({
                ...d,
                user_id: userId
            }));
            const { error } = await supabaseClient
                .from('diets')
                .upsert(dietsWithUser, { onConflict: 'id' });
            if (error) console.error('Diets sync error:', error);
        }
        
        // 上傳 diaries
        if (diaries.length > 0) {
            const diariesWithUser = diaries.map(d => ({
                ...d,
                user_id: userId
            }));
            const { error } = await supabaseClient
                .from('diaries')
                .upsert(diariesWithUser, { onConflict: 'id' });
            if (error) console.error('Diaries sync error:', error);
        }
        
        // 上傳 schedules
        if (schedules.length > 0) {
            const schedulesWithUser = schedules.map(s => ({
                ...s,
                user_id: userId
            }));
            const { error } = await supabaseClient
                .from('schedules')
                .upsert(schedulesWithUser, { onConflict: 'id' });
            if (error) console.error('Schedules sync error:', error);
        }
        
        lastSyncTime = Date.now();
        updateLastSyncDisplay();
        
    } catch (e) {
        console.error('Sync error:', e);
    } finally {
        showSyncLoading(false);
    }
}

async function loadCloudData() {
    if (!currentUser || !supabaseClient) return;
    
    try {
        const userId = currentUser.id;
        
        // 下載 todos
        const { data: todosData, error: todosError } = await supabaseClient
            .from('todos')
            .select('*')
            .eq('user_id', userId);
        if (todosError) console.error('Todos load error:', todosError);
        else if (todosData) todos = mergeArrays(todos, todosData);
        
        // 下載 habits
        const { data: habitsData, error: habitsError } = await supabaseClient
            .from('habits')
            .select('*')
            .eq('user_id', userId);
        if (habitsError) console.error('Habits load error:', habitsError);
        else if (habitsData) habits = mergeArrays(habits, habitsData);
        
        // 下載 diets
        const { data: dietsData, error: dietsError } = await supabaseClient
            .from('diets')
            .select('*')
            .eq('user_id', userId);
        if (dietsError) console.error('Diets load error:', dietsError);
        else if (dietsData) diets = mergeArrays(diets, dietsData);
        
        // 下載 diaries
        const { data: diariesData, error: diariesError } = await supabaseClient
            .from('diaries')
            .select('*')
            .eq('user_id', userId);
        if (diariesError) console.error('Diaries load error:', diariesError);
        else if (diariesData) diaries = mergeArrays(diaries, diariesData);
        
        // 下載 schedules
        const { data: schedulesData, error: schedulesError } = await supabaseClient
            .from('schedules')
            .select('*')
            .eq('user_id', userId);
        if (schedulesError) console.error('Schedules load error:', schedulesError);
        else if (schedulesData) schedules = mergeArrays(schedules, schedulesData);
        
        // 保存到本地
        Storage.set('todos', todos);
        Storage.set('habits', habits);
        Storage.set('diets', diets);
        Storage.set('diaries', diaries);
        Storage.set('schedules', schedules);
        
        renderAll();
        
        lastSyncTime = Date.now();
        updateLastSyncDisplay();
        
    } catch (e) {
        console.error('Load cloud data error:', e);
    }
}

function mergeArrays(local, remote) {
    const merged = new Map();
    
    // 先添加本地数据
    local.forEach(item => merged.set(item.id, item));
    
    // 合并远程数据
    remote.forEach(item => {
        const localItem = merged.get(item.id);
        if (!localItem) {
            merged.set(item.id, item);
        } else {
            // 比较更新时间，取最新的
            const remoteTime = new Date(item.updated_at || 0).getTime();
            const localTime = new Date(localItem.updated_at || 0).getTime();
            if (remoteTime > localTime) {
                merged.set(item.id, item);
            }
        }
    });
    
    return Array.from(merged.values());
}

function updateLastSyncDisplay() {
    const display = document.getElementById('lastSyncDisplay');
    if (display) {
        if (lastSyncTime) {
            const date = new Date(lastSyncTime);
            display.textContent = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        } else {
            display.textContent = '从未同步';
        }
    }
}

function showSyncLoading(show) {
    const btn = document.getElementById('syncBtn');
    if (btn) {
        btn.innerHTML = show ? '<i class="fas fa-spinner fa-spin"></i> 同步中...' : '<i class="fas fa-cloud-upload-alt"></i> 立即同步';
        btn.disabled = show;
    }
}

// ==================== Lock App ====================
function lockApp() {
    localStorage.removeItem('dayflow_unlocked');
    location.reload();
}

// ==================== Pomodoro Timer ====================
let pomodoroTimer = null;
let pomodoroTimeLeft = 25 * 60; // 25 minutes in seconds
let pomodoroTotalTime = 25 * 60;
let pomodoroIsRunning = false;
let pomodoroIsPaused = false;
let pomodoroMode = 'focus'; // 'focus', 'shortBreak', 'longBreak'
let pomodoroCurrentTask = '';
let whiteNoiseEnabled = false;
let whiteNoiseAudio = null;

// Pomodoro Mode Settings
const POMODORO_MODES = {
    focus: { time: 25 * 60, label: '专注模式', color: '#ef4444', gradient: 'pomodoroGradient' },
    shortBreak: { time: 5 * 60, label: '短休息', color: '#10b981', gradient: 'breakGradient' },
    longBreak: { time: 15 * 60, label: '长休息', color: '#3b82f6', gradient: 'breakGradient' }
};

// ==================== Settings ====================
let settings = Storage.get('settings') || {
    darkMode: false,
    notifications: false
};

// ==================== Utils ====================
const formatDate = (date) => {
    const d = new Date(date);
    const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    return {
        date: `${d.getDate()}`,
        month: months[d.getMonth()],
        year: d.getFullYear(),
        weekday: weekdays[d.getDay()],
        full: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    };
};

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', async () => {
    await initSupabase();
    initSettings();
    updateDate();
    renderAll();
    initPomodoro();
});

function initSettings() {
    // Apply dark mode
    if (settings.darkMode) {
        document.body.classList.add('dark-mode');
        document.getElementById('darkModeToggle').classList.add('active');
    }
    
    // Apply notification setting
    if (settings.notifications) {
        document.getElementById('notificationToggle').classList.add('active');
    }
}

// ==================== Navigation ====================
function showPage(page) {
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    
    // Show selected
    const pageEl = document.getElementById(page + 'Page');
    if (pageEl) {
        pageEl.style.display = 'block';
    }
    
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const clickedBtn = event.target.closest('.nav-btn');
    if (clickedBtn) {
        clickedBtn.classList.add('active');
    }
    
    // Show/hide FAB
    const fab = document.getElementById('diaryFab');
    if (fab) {
        fab.style.display = page === 'diary' ? 'flex' : 'none';
    }
    
    // Refresh page-specific content
    if (page === 'diary') renderDiaryList();
    if (page === 'stats') {
        updateStats();
        initStatsDate();
    }
    if (page === 'settings') {
        updateSettingsAuthUI();
    }
    if (page === 'calendar') {
        renderCalendarPage();
    }
    if (page === 'pomodoro') {
        updatePomodoroPage();
    }
}

// ==================== Today Page ====================
function updateDate() {
    const today = formatDate(currentDate);
    document.getElementById('currentDate').textContent = today.month + today.date + '日';
    document.getElementById('currentWeekday').textContent = today.weekday;
    
    // Update date selector display
    const dateDisplay = document.getElementById('todayDateDisplay');
    const weekdayDisplay = document.getElementById('todayWeekdayDisplay');
    const dateInput = document.getElementById('todayDateInput');
    
    if (dateDisplay) dateDisplay.textContent = today.month + today.date + '日';
    if (weekdayDisplay) weekdayDisplay.textContent = today.weekday;
    if (dateInput) dateInput.value = formatDateForInput(currentDate);
}

function changeTodayDate(days) {
    currentDate.setDate(currentDate.getDate() + days);
    updateDate();
    renderAll();
}

function onTodayDateChange() {
    const dateInput = document.getElementById('todayDateInput');
    if (dateInput && dateInput.value) {
        currentDate = new Date(dateInput.value);
        updateDate();
        renderAll();
    }
}

function goToTodayDate() {
    currentDate = new Date();
    updateDate();
    renderAll();
}

// ==================== Calendar Modal ====================
let calendarCurrentMonth = new Date();

function openCalendarModal() {
    console.log('Opening calendar modal...');
    try {
        calendarCurrentMonth = new Date(currentDate);
        renderCalendar();
        const modal = document.getElementById('calendarModal');
        if (modal) {
            modal.classList.add('active');
            console.log('Calendar modal opened successfully');
        } else {
            console.error('calendarModal element not found');
            alert('日曆元素未找到，請刷新頁面重試');
        }
    } catch (e) {
        console.error('Error opening calendar modal:', e);
        alert('打開日曆失敗: ' + e.message);
    }
}

function changeCalendarMonth(delta) {
    calendarCurrentMonth.setMonth(calendarCurrentMonth.getMonth() + delta);
    renderCalendar();
}

function renderCalendar() {
    const year = calendarCurrentMonth.getFullYear();
    const month = calendarCurrentMonth.getMonth();
    
    // Update title
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    document.getElementById('calendarMonthTitle').textContent = `${year}年${months[month]}`;
    
    // Get first day of month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    
    // Generate calendar days
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';
    
    // Previous month padding
    for (let i = 0; i < startDayOfWeek; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.style.height = '44px';
        grid.appendChild(emptyCell);
    }
    
    // Days of current month
    const today = new Date();
    const currentDateStr = formatDate(currentDate).full;
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDate(date).full;
        const isToday = dateStr === formatDate(today).full;
        const isSelected = dateStr === currentDateStr;
        
        const dayCell = document.createElement('button');
        dayCell.style.cssText = `
            height: 44px;
            border-radius: 12px;
            border: none;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            background: ${isSelected ? 'var(--primary)' : isToday ? 'var(--bg)' : 'white'};
            color: ${isSelected ? 'white' : isToday ? 'var(--primary)' : 'var(--text)'};
            box-shadow: ${isSelected ? '0 4px 12px rgba(99, 102, 241, 0.4)' : '0 2px 4px rgba(0,0,0,0.05)'};
            position: relative;
        `;
        dayCell.textContent = day;
        
        // Check if has data
        const hasTodo = todos.some(t => t.date === dateStr);
        const hasHabit = habits.some(h => h.checkIns.includes(dateStr));
        const hasDiet = diets.some(d => d.date === dateStr);
        const hasDiary = diaries.some(d => d.date === dateStr);
        
        if (hasTodo || hasHabit || hasDiet || hasDiary) {
            const dot = document.createElement('div');
            dot.style.cssText = `
                position: absolute;
                bottom: 4px;
                left: 50%;
                transform: translateX(-50%);
                width: 4px;
                height: 4px;
                border-radius: 50%;
                background: ${isSelected ? 'white' : 'var(--primary)'};
            `;
            dayCell.appendChild(dot);
        }
        
        dayCell.onclick = () => {
            currentDate = new Date(date);
            updateDate();
            renderAll();
            closeModal('calendarModal');
        };
        
        grid.appendChild(dayCell);
    }
}

function renderAll() {
    const dateStr = formatDate(currentDate).full;
    
    // Todos
    const todayTodos = todos.filter(t => t.date === dateStr);
    const completedTodos = todayTodos.filter(t => t.completed).length;
    document.getElementById('todoCount').textContent = `${completedTodos}/${todayTodos.length}`;
    renderTodoList(todayTodos);
    document.getElementById('todoSection').style.display = todayTodos.length > 0 ? 'block' : 'none';
    
    // Habits
    const checkedHabits = habits.filter(h => h.checkIns && h.checkIns.includes(dateStr));
    document.getElementById('habitCount').textContent = `${checkedHabits.length}/${habits.length}`;
    renderHabitList();
    document.getElementById('habitSection').style.display = habits.length > 0 ? 'block' : 'none';
    
    // Diet
    const todayDiet = diets.find(d => d.date === dateStr);
    const totalCal = todayDiet ? 
        (todayDiet.breakfastCal || 0) + (todayDiet.lunchCal || 0) + 
        (todayDiet.dinnerCal || 0) + (todayDiet.snackCal || 0) : 0;
    const calEl = document.getElementById('calorieCount');
    if (calEl) calEl.textContent = totalCal;
    
    // Pomodoro
    const todayPomos = pomodoroHistory.filter(p => p.date === dateStr).length;
    const pomoEl = document.getElementById('pomodoroDayCount');
    if (pomoEl) pomoEl.textContent = todayPomos;
    
    // Schedules - 更新行程數量顯示
    const todaySchedules = schedules.filter(s => s.date === dateStr);
    const scheduleEl = document.getElementById('scheduleCount');
    if (scheduleEl) scheduleEl.textContent = todaySchedules.length;
    
    // Render schedules list
    renderScheduleList(todaySchedules);
    
    // Review
    renderReview(todayTodos, checkedHabits, totalCal, todaySchedules);
    
    // Stats
    updateStats();
}

// ==================== Schedule Functions ====================
function renderScheduleList(todaySchedules) {
    const scheduleSection = document.getElementById('scheduleSection');
    const scheduleList = document.getElementById('scheduleList');
    
    if (!scheduleSection || !scheduleList) return;
    
    if (todaySchedules.length === 0) {
        scheduleSection.style.display = 'none';
        return;
    }
    
    scheduleSection.style.display = 'block';
    
    // Sort by time
    const sorted = [...todaySchedules].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    
    scheduleList.innerHTML = sorted.map(schedule => {
        const isPast = schedule.time && new Date(`${schedule.date}T${schedule.time}`) < new Date();
        return `
            <div style="display: flex; align-items: center; padding: 16px; background: ${isPast ? '#f8fafc' : 'white'}; 
                        border-radius: 12px; margin-bottom: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                        border-left: 4px solid ${getScheduleTypeColor(schedule.type)};">
                <div style="width: 60px; text-align: center; padding-right: 12px; border-right: 1px solid #e2e8f0;">
                    <div style="font-size: 18px; font-weight: 700; color: ${isPast ? '#94a3b8' : '#1e293b'};">
                        ${schedule.time || '--:--'}
                    </div>
                </div>
                <div style="flex: 1; padding: 0 12px;">
                    <div style="font-weight: 600; color: ${isPast ? '#94a3b8' : '#1e293b'}; margin-bottom: 4px;">
                        ${schedule.title}
                    </div>
                    <div style="font-size: 12px; color: #64748b;">
                        ${schedule.location ? '📍 ' + schedule.location : ''}
                        ${schedule.reminder ? ' ⏰ ' + schedule.reminder : ''}
                    </div>
                </div>
                <button onclick="deleteSchedule('${schedule.id}')" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 8px;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');
}

function getScheduleTypeColor(type) {
    const colors = {
        work: '#6366f1',
        personal: '#10b981',
        meeting: '#f59e0b',
        exercise: '#ef4444',
        study: '#8b5cf6',
        other: '#64748b'
    };
    return colors[type] || colors.other;
}

function openScheduleModal() {
    // Reset form
    document.getElementById('scheduleTitle').value = '';
    document.getElementById('scheduleTime').value = '';
    document.getElementById('scheduleLocation').value = '';
    document.getElementById('scheduleType').value = 'work';
    document.getElementById('scheduleReminder').value = '0';
    
    // Set default date to current selected date
    const dateStr = formatDate(currentDate).full;
    document.getElementById('scheduleDate').value = dateStr;
    
    openModal('scheduleModal');
}

function saveSchedule() {
    const title = document.getElementById('scheduleTitle').value.trim();
    const time = document.getElementById('scheduleTime').value;
    const location = document.getElementById('scheduleLocation').value.trim();
    const type = document.getElementById('scheduleType').value;
    const reminder = document.getElementById('scheduleReminder').value;
    const date = document.getElementById('scheduleDate').value;
    
    if (!title) {
        alert('请输入行程标题');
        return;
    }
    
    if (!date) {
        alert('请选择日期');
        return;
    }
    
    const schedule = {
        id: generateId(),
        title,
        date,
        time,
        location,
        type,
        reminder,
        created_at: Date.now()
    };
    
    schedules.push(schedule);
    Storage.set('schedules', schedules);
    
    closeModal('scheduleModal');
    renderAll();
    
    // If added for current date, show success message
    if (date === formatDate(currentDate).full) {
        console.log('✅ Schedule added for today:', title);
    }
}

function deleteSchedule(id) {
    if (confirm('确定要删除这个行程吗？')) {
        schedules = schedules.filter(s => s.id !== id);
        Storage.set('schedules', schedules);
        renderAll();
    }
}

function renderReview(todayTodos, checkedHabits, totalCal, todaySchedules) {
    const reviewContent = document.getElementById('reviewContent');
    
    console.log('📊 renderReview:', { todos: todayTodos.length, habits: checkedHabits.length, calories: totalCal });
    
    // 检查今天是否有任何记录（待办、习惯打卡、饮食）
    const hasRecords = todayTodos.length > 0 || checkedHabits.length > 0 || totalCal > 0;
    
    if (!hasRecords) {
        reviewContent.innerHTML = `
            <div style="text-align:center;color:#94a3b8;padding:20px;">
                <div style="font-size:48px;margin-bottom:12px;">🌟</div>
                <div>今天还没有记录，开始行动吧！</div>
            </div>
        `;
        return;
    }
    
    let html = '<div class="review-card">';
    html += '<div class="review-title">✨ 今日成就</div>';
    
    if (todayTodos.length > 0) {
        const completed = todayTodos.filter(t => t.completed).length;
        const rate = Math.round((completed / todayTodos.length) * 100);
        html += `
            <div class="review-item">
                <span class="review-emoji">📝</span>
                <span>完成 ${completed}/${todayTodos.length} 个待办 (${rate}%)</span>
            </div>
        `;
    }
    
    if (checkedHabits.length > 0) {
        html += `
            <div class="review-item">
                <span class="review-emoji">✅</span>
                <span>完成 ${checkedHabits.length} 个习惯打卡</span>
            </div>
        `;
    }
    
    if (totalCal > 0) {
        html += `
            <div class="review-item">
                <span class="review-emoji">🍽️</span>
                <span>今日摄入 ${totalCal} 卡路里</span>
            </div>
        `;
    }
    
    html += '</div>';
    reviewContent.innerHTML = html;
}

// ==================== Todo Functions ====================
function addTodo() {
    const input = document.getElementById('todoInput');
    const text = input.value.trim();
    if (!text) return;
    
    // 强制使用主页当前日期
    const todoDate = formatDate(currentDate).full;
    
    todos.unshift({
        id: generateId(),
        text: text,
        date: todoDate,
        completed: false,
        created_at: Date.now()
    });
    
    Storage.set('todos', todos);
    input.value = '';
    renderTodoList(todos.filter(t => t.date === todoDate));
    renderAll();
    closeModal('todoModal');
    
    // Send notification if enabled
    if (settings.notifications && 'Notification' in window) {
        setTimeout(() => {
            new Notification('待办已添加', { body: text });
        }, 100);
    }
}

function toggleTodo(id) {
    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        Storage.set('todos', todos);
        renderAll();
    }
}

function deleteTodo(id) {
    todos = todos.filter(t => t.id !== id);
    Storage.set('todos', todos);
    renderAll();
}

function renderTodoList(todayTodos) {
    const previewList = document.getElementById('todoList');
    if (previewList) {
        previewList.innerHTML = todayTodos.slice(0, 3).map(todo => `
            <div class="todo-item" onclick="toggleTodo('${todo.id}')">
                <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''} onclick="event.stopPropagation()">
                <span class="todo-text ${todo.completed ? 'todo-completed' : ''}">${todo.text}</span>
            </div>
        `).join('');
    }
    
    const modalList = document.getElementById('todoModalList');
    if (modalList) {
        modalList.innerHTML = todayTodos.map(todo => `
            <div class="todo-item">
                <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''} onclick="toggleTodo('${todo.id}')">
                <span class="todo-text ${todo.completed ? 'todo-completed' : ''}">${todo.text}</span>
                <span class="todo-delete" onclick="deleteTodo('${todo.id}')">
                    <i class="fas fa-trash"></i>
                </span>
            </div>
        `).join('');
    }
}

// ==================== Habit Functions ====================
function addHabit() {
    const input = document.getElementById('habitInput');
    const name = input.value.trim();
    if (!name) return;
    
    habits.unshift({
        id: generateId(),
        name: name,
        icon: '✅',
        checkIns: [],
        created_at: Date.now()
    });
    
    Storage.set('habits', habits);
    input.value = '';
    renderAll();
}

function toggleHabit(id) {
    const habit = habits.find(h => h.id === id);
    if (habit) {
        const dateStr = formatDate(currentDate).full;
        const index = habit.checkIns.indexOf(dateStr);
        if (index >= 0) {
            habit.checkIns.splice(index, 1);
        } else {
            habit.checkIns.push(dateStr);
            // Send notification if enabled
            if (settings.notifications && 'Notification' in window) {
                new Notification('习惯打卡成功！', { body: `已完成：${habit.name}` });
            }
        }
        Storage.set('habits', habits);
        renderAll();
    }
}

function deleteHabit(id) {
    habits = habits.filter(h => h.id !== id);
    Storage.set('habits', habits);
    renderAll();
}

function renderHabitList() {
    const dateStr = formatDate(currentDate).full;
    
    const previewList = document.getElementById('habitList');
    if (previewList) {
        previewList.innerHTML = habits.slice(0, 4).map(habit => {
            const isChecked = habit.checkIns && habit.checkIns.includes(dateStr);
            return `
                <div class="habit-item ${isChecked ? 'habit-checked' : ''}" onclick="toggleHabit('${habit.id}')">
                    <div class="habit-icon">${habit.icon}</div>
                    <div class="habit-name">${habit.name}</div>
                    ${isChecked ? '<div class="habit-check"><i class="fas fa-check"></i></div>' : ''}
                </div>
            `;
        }).join('');
    }
    
    const modalList = document.getElementById('habitModalList');
    if (modalList) {
        modalList.innerHTML = habits.map(habit => {
            const isChecked = habit.checkIns && habit.checkIns.includes(dateStr);
            return `
                <div class="todo-item">
                    <div style="display:flex;align-items:center;flex:1;" onclick="toggleHabit('${habit.id}')">
                        <div class="habit-item ${isChecked ? 'habit-checked' : ''}" style="margin-right:12px;width:44px;height:44px;padding:0;">
                            <div class="habit-icon" style="margin:0;">${habit.icon}</div>
                        </div>
                        <span style="font-size:16px;font-weight:500;">${habit.name}</span>
                    </div>
                    <span class="todo-delete" onclick="deleteHabit('${habit.id}')">
                        <i class="fas fa-trash"></i>
                    </span>
                </div>
            `;
        }).join('');
    }
}

// ==================== Diet Functions ====================
function openDietModal() {
    const dateStr = formatDate(currentDate).full;
    const diet = diets.find(d => d.date === dateStr);
    
    if (diet) {
        document.getElementById('breakfastInput').value = diet.breakfast || '';
        document.getElementById('breakfastCal').value = diet.breakfastCal || '';
        document.getElementById('lunchInput').value = diet.lunch || '';
        document.getElementById('lunchCal').value = diet.lunchCal || '';
        document.getElementById('dinnerInput').value = diet.dinner || '';
        document.getElementById('dinnerCal').value = diet.dinnerCal || '';
        document.getElementById('snackInput').value = diet.snack || '';
        document.getElementById('snackCal').value = diet.snackCal || '';
    } else {
        document.getElementById('breakfastInput').value = '';
        document.getElementById('breakfastCal').value = '';
        document.getElementById('lunchInput').value = '';
        document.getElementById('lunchCal').value = '';
        document.getElementById('dinnerInput').value = '';
        document.getElementById('dinnerCal').value = '';
        document.getElementById('snackInput').value = '';
        document.getElementById('snackCal').value = '';
    }
    
    openModal('dietModal');
}

function saveDiet() {
    const dateStr = formatDate(currentDate).full;
    const existingIndex = diets.findIndex(d => d.date === dateStr);
    
    // 获取输入值并转换为数字
    const breakfastCal = parseInt(document.getElementById('breakfastCal').value) || 0;
    const lunchCal = parseInt(document.getElementById('lunchCal').value) || 0;
    const dinnerCal = parseInt(document.getElementById('dinnerCal').value) || 0;
    const snackCal = parseInt(document.getElementById('snackCal').value) || 0;
    const totalCalories = breakfastCal + lunchCal + dinnerCal + snackCal;
    
    console.log('🍽️ 保存饮食:', dateStr, '卡路里:', totalCalories);
    
    const dietData = {
        id: existingIndex >= 0 ? diets[existingIndex].id : generateId(),
        date: dateStr,
        breakfast: document.getElementById('breakfastInput').value,
        breakfastCal: breakfastCal,
        lunch: document.getElementById('lunchInput').value,
        lunchCal: lunchCal,
        dinner: document.getElementById('dinnerInput').value,
        dinnerCal: dinnerCal,
        snack: document.getElementById('snackInput').value,
        snackCal: snackCal,
        created_at: existingIndex >= 0 ? diets[existingIndex].created_at : Date.now(),
        updated_at: Date.now()
    };
    
    if (existingIndex >= 0) {
        diets[existingIndex] = dietData;
    } else {
        diets.unshift(dietData);
    }
    
    Storage.set('diets', diets);
    closeModal('dietModal');
    renderAll();
}

// ==================== Diary Functions ====================
function selectMood(mood) {
    selectedMood = mood;
    document.querySelectorAll('.mood-item').forEach(item => {
        item.classList.remove('selected');
    });
    document.querySelector(`.mood-item[data-mood="${mood}"]`).classList.add('selected');
}

function openDiaryModal() {
    editingDiaryId = null;
    selectedMood = 3;
    document.getElementById('diaryTitle').value = '';
    document.getElementById('diaryContent').value = '';
    document.getElementById('diaryModalTitle').textContent = '📝 写日记';
    selectMood(3);
    openModal('diaryModal');
}

function editDiary(id) {
    const diary = diaries.find(d => d.id === id);
    if (!diary) return;
    
    editingDiaryId = id;
    currentDate = new Date(diary.date);
    selectedMood = diary.mood || 3;
    
    document.getElementById('diaryTitle').value = diary.title || '';
    document.getElementById('diaryContent').value = diary.content || '';
    document.getElementById('diaryModalTitle').textContent = '✏️ 编辑日记';
    selectMood(selectedMood);
    openModal('diaryModal');
}

function saveDiary() {
    const title = document.getElementById('diaryTitle').value.trim();
    const content = document.getElementById('diaryContent').value.trim();
    
    if (!title && !content) {
        alert('请填写标题或内容');
        return;
    }
    
    if (editingDiaryId) {
        // 编辑现有日记
        const index = diaries.findIndex(d => d.id === editingDiaryId);
        if (index >= 0) {
            diaries[index] = {
                ...diaries[index],
                title: title || '无标题',
                content: content,
                mood: selectedMood,
                updated_at: Date.now()
            };
        }
    } else {
        // 新建日记
        diaries.unshift({
            id: generateId(),
            date: formatDate(currentDate).full,
            title: title || '无标题',
            content: content,
            mood: selectedMood,
            created_at: Date.now(),
            updated_at: Date.now()
        });
    }
    
    Storage.set('diaries', diaries);
    closeModal('diaryModal');
    editingDiaryId = null;
    renderAll();
}

function deleteDiary(id) {
    if (confirm('确定要删除这篇日记吗？')) {
        diaries = diaries.filter(d => d.id !== id);
        Storage.set('diaries', diaries);
        renderAll();
    }
}

function renderDiaryList() {
    const list = document.getElementById('diaryList');
    const empty = document.getElementById('diaryEmpty');
    
    if (!list) return;
    
    if (diaries.length === 0) {
        list.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    
    if (empty) empty.style.display = 'none';
    
    const sorted = [...diaries].sort((a, b) => new Date(b.date) - new Date(a.date));
    const moods = ['😫','😔','😐','😊','😄'];
    const moodColors = ['#ef4444', '#f97316', '#94a3b8', '#3b82f6', '#10b981'];
    
    list.innerHTML = sorted.map(diary => {
        const dateInfo = formatDate(diary.date);
        const mood = moods[(diary.mood || 3) - 1] || '😐';
        const moodColor = moodColors[(diary.mood || 3) - 1] || '#94a3b8';
        
        return `
            <div class="diary-card" onclick="editDiary('${diary.id}')" style="cursor:pointer;">
                <div class="diary-header">
                    <div style="display:flex;align-items:center;gap:16px;">
                        <div class="diary-date" style="background:${moodColor}20;border:2px solid ${moodColor};">
                            <div class="diary-month">${dateInfo.month}</div>
                            <div class="diary-day">${dateInfo.date}</div>
                        </div>
                        <div>
                            <div class="diary-title">${diary.title}</div>
                            <div style="color:#94a3b8;font-size:13px;">${dateInfo.weekday} · 點擊編輯</div>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;" onclick="event.stopPropagation();">
                        <div style="font-size:32px;">${mood}</div>
                        <i class="fas fa-trash" style="color:#ef4444;cursor:pointer;padding:8px;" onclick="deleteDiary('${diary.id}')"></i>
                    </div>
                </div>
                ${diary.content ? `<div class="diary-content">${diary.content}</div>` : ''}
            </div>
        `;
    }).join('');
}

// ==================== Pomodoro Timer ====================
function initPomodoro() {
    updatePomodoroDisplay();
    updatePomodoroHistory();
}

// ==================== Pomodoro Full Functions ====================
function startPomodoroFull() {
    if (pomodoroIsRunning) return;
    
    // Get task name
    const taskInput = document.getElementById('pomodoroTask');
    pomodoroCurrentTask = taskInput ? taskInput.value.trim() : '';
    
    pomodoroIsRunning = true;
    pomodoroIsPaused = false;
    
    // Update UI
    const startBtn = document.getElementById('pomodoroStartBtn');
    const pauseBtn = document.getElementById('pomodoroPauseBtn');
    const status = document.getElementById('pomodoroStatus');
    
    if (startBtn) startBtn.style.display = 'none';
    if (pauseBtn) pauseBtn.style.display = 'flex';
    if (status) status.textContent = pomodoroMode === 'focus' ? '专注中...' : '休息中...';
    
    // Play white noise if enabled
    if (whiteNoiseEnabled) playWhiteNoise();
    
    pomodoroTimer = setInterval(() => {
        if (pomodoroTimeLeft > 0) {
            pomodoroTimeLeft--;
            updatePomodoroFullDisplay();
        } else {
            completePomodoroFull();
        }
    }, 1000);
}

function pausePomodoroFull() {
    if (!pomodoroIsRunning) return;
    
    clearInterval(pomodoroTimer);
    pomodoroIsRunning = false;
    pomodoroIsPaused = true;
    
    // Update UI
    const startBtn = document.getElementById('pomodoroStartBtn');
    const pauseBtn = document.getElementById('pomodoroPauseBtn');
    const status = document.getElementById('pomodoroStatus');
    
    if (startBtn) startBtn.style.display = 'flex';
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (status) status.textContent = '已暂停';
    
    // Pause white noise
    if (whiteNoiseAudio) whiteNoiseAudio.pause();
}

function resetPomodoroFull() {
    clearInterval(pomodoroTimer);
    pomodoroIsRunning = false;
    pomodoroIsPaused = false;
    
    const mode = POMODORO_MODES[pomodoroMode];
    pomodoroTimeLeft = mode.time;
    pomodoroTotalTime = mode.time;
    
    // Update UI
    const startBtn = document.getElementById('pomodoroStartBtn');
    const pauseBtn = document.getElementById('pomodoroPauseBtn');
    const status = document.getElementById('pomodoroStatus');
    
    if (startBtn) startBtn.style.display = 'flex';
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (status) status.textContent = '准备开始';
    
    updatePomodoroFullDisplay();
    
    // Stop white noise
    if (whiteNoiseAudio) whiteNoiseAudio.pause();
}

function skipPomodoro() {
    clearInterval(pomodoroTimer);
    pomodoroIsRunning = false;
    pomodoroIsPaused = false;
    
    // Switch to appropriate mode
    if (pomodoroMode === 'focus') {
        // After 4 focus sessions, take long break
        const todayCount = pomodoroHistory.filter(p => 
            p.date === formatDate(new Date()).full && p.mode === 'focus'
        ).length;
        
        if (todayCount % 4 === 0 && todayCount > 0) {
            switchPomodoroMode('longBreak');
        } else {
            switchPomodoroMode('shortBreak');
        }
    } else {
        switchPomodoroMode('focus');
    }
}

function completePomodoroFull() {
    clearInterval(pomodoroTimer);
    pomodoroIsRunning = false;
    
    const today = formatDate(new Date()).full;
    const mode = pomodoroMode;
    
    // Save to history
    if (mode === 'focus') {
        pomodoroHistory.push({
            id: generateId(),
            date: today,
            mode: mode,
            task: pomodoroCurrentTask,
            completed_at: Date.now()
        });
        Storage.set('pomodoroHistory', pomodoroHistory);
    }
    
    // Notification
    const title = mode === 'focus' ? '专注完成！' : '休息结束！';
    const body = mode === 'focus' ? '专注时间结束，休息一下吧 🎉' : '休息结束，准备开始新的专注 💪';
    
    if (settings.notifications && 'Notification' in window) {
        new Notification(title, { body: body, icon: '🍅' });
    } else {
        alert(`🎉 ${body}`);
    }
    
    // Auto switch mode
    if (mode === 'focus') {
        const todayCount = pomodoroHistory.filter(p => 
            p.date === today && p.mode === 'focus'
        ).length;
        
        if (todayCount % 4 === 0) {
            switchPomodoroMode('longBreak');
        } else {
            switchPomodoroMode('shortBreak');
        }
    } else {
        switchPomodoroMode('focus');
    }
    
    updatePomodoroPage();
}

function switchPomodoroMode(mode) {
    pomodoroMode = mode;
    const modeConfig = POMODORO_MODES[mode];
    
    pomodoroTimeLeft = modeConfig.time;
    pomodoroTotalTime = modeConfig.time;
    pomodoroIsRunning = false;
    pomodoroIsPaused = false;
    clearInterval(pomodoroTimer);
    
    // Update UI
    const timeDisplay = document.getElementById('pomodoroTimeDisplay');
    const status = document.getElementById('pomodoroStatus');
    const modeText = document.getElementById('pomodoroModeText');
    const startBtn = document.getElementById('pomodoroStartBtn');
    const pauseBtn = document.getElementById('pomodoroPauseBtn');
    const circle = document.getElementById('pomodoroCircle');
    
    if (timeDisplay) {
        const minutes = Math.floor(modeConfig.time / 60);
        timeDisplay.textContent = `${minutes}:00`;
    }
    if (status) status.textContent = '准备开始';
    if (modeText) modeText.textContent = `${modeConfig.label} · ${Math.floor(modeConfig.time / 60)}分钟`;
    if (startBtn) startBtn.style.display = 'flex';
    if (pauseBtn) pauseBtn.style.display = 'none';
    
    // Update circle color
    if (circle) {
        circle.setAttribute('stroke', mode === 'focus' ? 'url(#pomodoroGradient)' : 'url(#breakGradient)');
        circle.style.strokeDashoffset = 0;
    }
    
    // Update mode buttons
    document.querySelectorAll('[id^="mode"]').forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.color = '#64748b';
        btn.style.boxShadow = 'none';
    });
    
    const activeBtn = document.getElementById(`mode${mode.charAt(0).toUpperCase() + mode.slice(1)}`);
    if (activeBtn) {
        activeBtn.style.background = 'white';
        activeBtn.style.color = modeConfig.color;
        activeBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    }
    
    updatePomodoroFullDisplay();
}

function updatePomodoroFullDisplay() {
    const timeDisplay = document.getElementById('pomodoroTimeDisplay');
    const circle = document.getElementById('pomodoroCircle');
    
    if (timeDisplay) {
        const minutes = Math.floor(pomodoroTimeLeft / 60);
        const seconds = pomodoroTimeLeft % 60;
        timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    if (circle) {
        const progress = (pomodoroTotalTime - pomodoroTimeLeft) / pomodoroTotalTime;
        const circumference = 2 * Math.PI * 120; // r=120
        const offset = circumference - (progress * circumference);
        circle.style.strokeDashoffset = offset;
    }
}

function updatePomodoroPage() {
    const today = formatDate(new Date()).full;
    const todaySessions = pomodoroHistory.filter(p => p.date === today && p.mode === 'focus');
    
    // Update stats
    const completedEl = document.getElementById('pomodoroCompletedToday');
    const minutesEl = document.getElementById('pomodoroMinutesToday');
    const tasksEl = document.getElementById('pomodoroTasksToday');
    
    if (completedEl) completedEl.textContent = todaySessions.length;
    if (minutesEl) minutesEl.textContent = todaySessions.length * 25;
    
    // Count unique tasks
    const uniqueTasks = new Set(todaySessions.map(s => s.task).filter(t => t));
    if (tasksEl) tasksEl.textContent = uniqueTasks.size;
    
    // Update history list
    const historyList = document.getElementById('pomodoroHistoryList');
    if (historyList) {
        if (todaySessions.length === 0) {
            historyList.innerHTML = `
                <div style="text-align: center; color: #94a3b8; padding: 20px;">
                    还没有专注记录，开始第一个番茄吧！
                </div>
            `;
        } else {
            historyList.innerHTML = todaySessions.slice().reverse().map((session, index) => {
                const time = new Date(session.completed_at).toLocaleTimeString('zh-CN', { 
                    hour: '2-digit', minute: '2-digit' 
                });
                return `
                    <div style="display: flex; align-items: center; padding: 12px; 
                                background: #f8fafc; border-radius: 12px; margin-bottom: 8px;">
                        <div style="width: 32px; height: 32px; border-radius: 50%; 
                                    background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
                                    display: flex; align-items: center; justify-content: center;
                                    color: white; font-size: 14px; margin-right: 12px;">
                            🍅
                        </div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: #1e293b;">
                                ${session.task || `专注 #${todaySessions.length - index}`}
                            </div>
                            <div style="font-size: 12px; color: #64748b;">${time}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

function toggleWhiteNoise() {
    whiteNoiseEnabled = !whiteNoiseEnabled;
    const toggle = document.getElementById('whiteNoiseToggle');
    if (toggle) toggle.classList.toggle('active', whiteNoiseEnabled);
    
    if (!whiteNoiseEnabled && whiteNoiseAudio) {
        whiteNoiseAudio.pause();
    } else if (whiteNoiseEnabled && pomodoroIsRunning) {
        playWhiteNoise();
    }
}

function playWhiteNoise() {
    // Placeholder for white noise - in production, would load actual audio file
    // For now, just console log
    console.log('White noise would play here');
}

// Legacy functions for compatibility
function startPomodoro() {
    showPage('pomodoro');
    setTimeout(() => startPomodoroFull(), 100);
}

function pausePomodoro() {
    pausePomodoroFull();
}

function resetPomodoro() {
    resetPomodoroFull();
}

function updatePomodoroDisplay() {
    updatePomodoroFullDisplay();
}

function updatePomodoroHistory() {
    updatePomodoroPage();
}

// ==================== Calendar Page ====================
let calendarPageCurrentMonth = new Date();
let calendarPageSelectedDate = new Date();

function renderCalendarPage() {
    const year = calendarPageCurrentMonth.getFullYear();
    const month = calendarPageCurrentMonth.getMonth();
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    
    // Update title
    const titleEl = document.getElementById('calendarPageMonthTitle');
    if (titleEl) titleEl.textContent = `${year}年${months[month]}`;
    
    // Get first day of month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    
    // Generate calendar grid
    const grid = document.getElementById('calendarPageGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    // Previous month padding
    for (let i = 0; i < startDayOfWeek; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.style.height = '48px';
        grid.appendChild(emptyCell);
    }
    
    // Days of current month
    const today = new Date();
    const selectedStr = formatDate(calendarPageSelectedDate).full;
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDate(date).full;
        const isToday = dateStr === formatDate(today).full;
        const isSelected = dateStr === selectedStr;
        
        const dayCell = document.createElement('button');
        dayCell.style.cssText = `
            height: 48px;
            border-radius: 12px;
            border: none;
            font-size: 15px;
            font-weight: 600;
            cursor: pointer;
            background: ${isSelected ? 'var(--primary)' : isToday ? 'var(--bg)' : 'white'};
            color: ${isSelected ? 'white' : isToday ? 'var(--primary)' : 'var(--text)'};
            box-shadow: ${isSelected ? '0 4px 12px rgba(99, 102, 241, 0.4)' : '0 2px 4px rgba(0,0,0,0.05)'};
            position: relative;
            transition: all 0.2s;
        `;
        dayCell.textContent = day;
        
        // Check if has data
        const hasTodo = todos.some(t => t.date === dateStr);
        const hasHabit = habits.some(h => h.checkIns && h.checkIns.includes(dateStr));
        const hasDiet = diets.some(d => d.date === dateStr);
        const hasDiary = diaries.some(d => d.date === dateStr);
        
        if (hasTodo || hasHabit || hasDiet || hasDiary) {
            const dot = document.createElement('div');
            dot.style.cssText = `
                position: absolute;
                bottom: 6px;
                left: 50%;
                transform: translateX(-50%);
                width: 4px;
                height: 4px;
                border-radius: 50%;
                background: ${isSelected ? 'white' : 'var(--primary)'};
            `;
            dayCell.appendChild(dot);
        }
        
        dayCell.onclick = () => {
            calendarPageSelectedDate = new Date(date);
            renderCalendarPage();
            updateCalendarDaySummary();
        };
        
        grid.appendChild(dayCell);
    }
    
    updateCalendarDaySummary();
}

function changeCalendarPageMonth(delta) {
    calendarPageCurrentMonth.setMonth(calendarPageCurrentMonth.getMonth() + delta);
    renderCalendarPage();
}

function updateCalendarDaySummary() {
    const dateStr = formatDate(calendarPageSelectedDate).full;
    const dateInfo = formatDate(calendarPageSelectedDate);
    
    // Update title
    const titleEl = document.getElementById('calendarSelectedDateTitle');
    if (titleEl) titleEl.textContent = `📋 ${dateInfo.month}${dateInfo.date}日 概览`;
    
    // Get data for selected date
    const dayTodos = todos.filter(t => t.date === dateStr);
    const completedTodos = dayTodos.filter(t => t.completed).length;
    const todoEl = document.getElementById('calDayTodos');
    if (todoEl) todoEl.textContent = `${completedTodos}/${dayTodos.length}`;
    
    const checkedHabits = habits.filter(h => h.checkIns && h.checkIns.includes(dateStr));
    const habitEl = document.getElementById('calDayHabits');
    if (habitEl) habitEl.textContent = `${checkedHabits.length}/${habits.length}`;
    
    const diet = diets.find(d => d.date === dateStr);
    const calories = diet ? (diet.breakfastCal || 0) + (diet.lunchCal || 0) + (diet.dinnerCal || 0) + (diet.snackCal || 0) : 0;
    const calEl = document.getElementById('calDayCalories');
    if (calEl) calEl.textContent = calories;
    
    const diary = diaries.find(d => d.date === dateStr);
    const diaryEl = document.getElementById('calDayDiary');
    if (diaryEl) diaryEl.textContent = diary ? '✓' : '-';
}

function goToCalendarDate() {
    currentDate = new Date(calendarPageSelectedDate);
    updateDate();
    renderAll();
    showPage('today');
    // Update nav button
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    const todayBtn = document.querySelector('[data-page="today"]');
    if (todayBtn) todayBtn.classList.add('active');
}

// ==================== Stats Date Selector ====================
let statsSelectedDate = new Date();

function initStatsDate() {
    const dateInput = document.getElementById('statsDateInput');
    if (dateInput) {
        dateInput.value = formatDateForInput(statsSelectedDate);
        updateStatsDaySummary();
    }
}

function formatDateForInput(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function changeStatsDate(days) {
    statsSelectedDate.setDate(statsSelectedDate.getDate() + days);
    document.getElementById('statsDateInput').value = formatDateForInput(statsSelectedDate);
    updateStatsDaySummary();
}

function onStatsDateChange() {
    const dateInput = document.getElementById('statsDateInput');
    if (dateInput.value) {
        statsSelectedDate = new Date(dateInput.value);
        updateStatsDaySummary();
    }
}

function goToStatsToday() {
    statsSelectedDate = new Date();
    document.getElementById('statsDateInput').value = formatDateForInput(statsSelectedDate);
    updateStatsDaySummary();
}

function updateStatsDaySummary() {
    const dateStr = formatDate(statsSelectedDate).full;
    const isToday = dateStr === formatDate(new Date()).full;
    
    // Update label
    const dateLabel = isToday ? '今日' : `${formatDate(statsSelectedDate).month}${formatDate(statsSelectedDate).date}日`;
    document.getElementById('statsSelectedDate').textContent = dateLabel;
    
    // Get data for selected date
    const dayTodos = todos.filter(t => t.date === dateStr);
    const completedTodos = dayTodos.filter(t => t.completed).length;
    document.getElementById('statsDayTodos').textContent = `${completedTodos}/${dayTodos.length}`;
    
    const checkedHabits = habits.filter(h => h.checkIns && h.checkIns.includes(dateStr));
    document.getElementById('statsDayHabits').textContent = `${checkedHabits.length}/${habits.length}`;
    
    const diet = diets.find(d => d.date === dateStr);
    const calories = diet ? 
        (diet.breakfastCal || 0) + (diet.lunchCal || 0) + 
        (diet.dinnerCal || 0) + (diet.snackCal || 0) : 0;
    document.getElementById('statsDayCalories').textContent = calories;
    
    const diary = diaries.find(d => d.date === dateStr);
    document.getElementById('statsDayDiary').textContent = diary ? '✓' : '-';
    
    // Also update currentDate for editing
    currentDate = new Date(statsSelectedDate);
}

// ==================== Stats ====================
function updateStats() {
    // Initialize stats date picker
    initStatsDate();
    // Todo rate
    const totalTodos = todos.length;
    const completedTodos = todos.filter(t => t.completed).length;
    const todoRate = totalTodos > 0 ? Math.round((completedTodos / totalTodos) * 100) : 0;
    document.getElementById('statTodoRate').textContent = todoRate + '%';
    
    // Habit rate
    const totalCheckIns = habits.reduce((sum, h) => sum + (h.checkIns ? h.checkIns.length : 0), 0);
    const habitRate = habits.length > 0 ? Math.round(totalCheckIns / (habits.length * 7) * 100) : 0;
    document.getElementById('statHabitRate').textContent = habitRate + '%';
    
    // Avg calories
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        last7Days.push(formatDate(d).full);
    }
    const totalCal = last7Days.reduce((sum, date) => {
        const diet = diets.find(d => d.date === date);
        return sum + (diet ? 
            (diet.breakfastCal || 0) + (diet.lunchCal || 0) + 
            (diet.dinnerCal || 0) + (diet.snackCal || 0) : 0);
    }, 0);
    document.getElementById('statAvgCal').textContent = Math.round(totalCal / 7);
    
    // Diary count
    document.getElementById('statDiaryCount').textContent = diaries.length;
}

// ==================== Settings ====================
function toggleDarkMode() {
    settings.darkMode = !settings.darkMode;
    Storage.set('settings', settings);
    
    document.getElementById('darkModeToggle').classList.toggle('active');
    document.body.classList.toggle('dark-mode');
}

function toggleNotifications() {
    if (!('Notification' in window)) {
        alert('您的浏览器不支持通知功能');
        return;
    }
    
    if (Notification.permission === 'granted') {
        settings.notifications = !settings.notifications;
        Storage.set('settings', settings);
        document.getElementById('notificationToggle').classList.toggle('active');
        document.getElementById('notificationBanner').style.display = 'none';
    } else {
        document.getElementById('notificationBanner').style.display = 'block';
    }
}

function requestNotificationPermission() {
    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            settings.notifications = true;
            Storage.set('settings', settings);
            document.getElementById('notificationToggle').classList.add('active');
            document.getElementById('notificationBanner').style.display = 'none';
            new Notification('通知已开启！', { body: '您将收到习惯打卡提醒' });
        } else {
            alert('需要通知权限才能开启提醒功能');
        }
    });
}

// ==================== Export/Import ====================
function exportData() {
    const data = {
        todos,
        habits,
        diets,
        diaries,
        pomodoroHistory,
        settings,
        exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dayflow-backup-${formatDate(new Date()).full}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('数据导出成功！');
}

function importData(input) {
    const file = input.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            if (confirm('导入数据将覆盖现有数据，确定继续吗？')) {
                if (data.todos) {
                    todos = data.todos;
                    Storage.set('todos', todos);
                }
                if (data.habits) {
                    habits = data.habits;
                    Storage.set('habits', habits);
                }
                if (data.diets) {
                    diets = data.diets;
                    Storage.set('diets', diets);
                }
                if (data.diaries) {
                    diaries = data.diaries;
                    Storage.set('diaries', diaries);
                }
                if (data.pomodoroHistory) {
                    pomodoroHistory = data.pomodoroHistory;
                    Storage.set('pomodoroHistory', pomodoroHistory);
                }
                if (data.settings) {
                    settings = data.settings;
                    Storage.set('settings', settings);
                    initSettings();
                }
                
                renderAll();
                alert('数据导入成功！');
            }
        } catch (error) {
            alert('导入失败：文件格式错误');
        }
    };
    reader.readAsText(file);
    input.value = '';
}

function clearAllData() {
    if (confirm('⚠️ 确定要清除所有数据吗？此操作不可恢复！')) {
        if (confirm('再次确认：所有待办、习惯、饮食记录、日记都将被删除？')) {
            todos = [];
            habits = [];
            diets = [];
            diaries = [];
            pomodoroHistory = [];
            
            Storage.set('todos', []);
            Storage.set('habits', []);
            Storage.set('diets', []);
            Storage.set('diaries', []);
            Storage.set('pomodoroHistory', []);
            
            renderAll();
            alert('所有数据已清除');
        }
    }
}

// ==================== Modal Date Variables ====================
let modalDates = {
    todo: new Date(),
    diet: new Date(),
    habit: new Date(),
    diary: new Date()
};

function updateModalDateDisplay(type) {
    const date = modalDates[type];
    const dateInfo = formatDate(date);
    
    const displayEl = document.getElementById(type + 'ModalDateDisplay');
    const weekdayEl = document.getElementById(type + 'ModalWeekdayDisplay');
    const inputEl = document.getElementById(type + 'ModalDateInput');
    
    if (displayEl) displayEl.textContent = dateInfo.month + dateInfo.date + '日';
    if (weekdayEl) weekdayEl.textContent = dateInfo.weekday;
    if (inputEl) inputEl.value = formatDateForInput(date);
}

function changeModalDate(type, days) {
    modalDates[type].setDate(modalDates[type].getDate() + days);
    updateModalDateDisplay(type);
    
    // Refresh list for this date
    if (type === 'todo') {
        renderTodoList(todos.filter(t => t.date === formatDate(modalDates.todo).full));
    } else if (type === 'habit') {
        renderHabitListForDate(formatDate(modalDates.habit).full);
    } else if (type === 'diet') {
        loadDietForDate(formatDate(modalDates.diet).full);
    }
}

function onModalDateChange(type) {
    const inputEl = document.getElementById(type + 'ModalDateInput');
    if (inputEl && inputEl.value) {
        modalDates[type] = new Date(inputEl.value);
        updateModalDateDisplay(type);
        
        // Refresh list for this date
        if (type === 'todo') {
            renderTodoList(todos.filter(t => t.date === formatDate(modalDates.todo).full));
        } else if (type === 'habit') {
            renderHabitListForDate(formatDate(modalDates.habit).full);
        } else if (type === 'diet') {
            loadDietForDate(formatDate(modalDates.diet).full);
        }
    }
}

function renderHabitListForDate(dateStr) {
    const modalList = document.getElementById('habitModalList');
    if (modalList) {
        modalList.innerHTML = habits.map(habit => {
            const isChecked = habit.checkIns && habit.checkIns.includes(dateStr);
            return `
                <div class="todo-item">
                    <div style="display:flex;align-items:center;flex:1;" onclick="toggleHabitForDate('${habit.id}', '${dateStr}')">
                        <div class="habit-item ${isChecked ? 'habit-checked' : ''}" style="margin-right:12px;width:44px;height:44px;padding:0;">
                            <div class="habit-icon" style="margin:0;">${habit.icon}</div>
                        </div>
                        <span style="font-size:16px;font-weight:500;">${habit.name}</span>
                    </div>
                    <span class="todo-delete" onclick="deleteHabit('${habit.id}')">
                        <i class="fas fa-trash"></i>
                    </span>
                </div>
            `;
        }).join('');
    }
}

function toggleHabitForDate(id, dateStr) {
    const habit = habits.find(h => h.id === id);
    if (habit) {
        const index = habit.checkIns.indexOf(dateStr);
        if (index >= 0) {
            habit.checkIns.splice(index, 1);
        } else {
            habit.checkIns.push(dateStr);
        }
        Storage.set('habits', habits);
        renderHabitListForDate(dateStr);
        renderAll();
    }
}

function loadDietForDate(dateStr) {
    const diet = diets.find(d => d.date === dateStr);
    if (diet) {
        document.getElementById('breakfastInput').value = diet.breakfast || '';
        document.getElementById('breakfastCal').value = diet.breakfastCal || '';
        document.getElementById('lunchInput').value = diet.lunch || '';
        document.getElementById('lunchCal').value = diet.lunchCal || '';
        document.getElementById('dinnerInput').value = diet.dinner || '';
        document.getElementById('dinnerCal').value = diet.dinnerCal || '';
        document.getElementById('snackInput').value = diet.snack || '';
        document.getElementById('snackCal').value = diet.snackCal || '';
    } else {
        document.getElementById('breakfastInput').value = '';
        document.getElementById('breakfastCal').value = '';
        document.getElementById('lunchInput').value = '';
        document.getElementById('lunchCal').value = '';
        document.getElementById('dinnerInput').value = '';
        document.getElementById('dinnerCal').value = '';
        document.getElementById('snackInput').value = '';
        document.getElementById('snackCal').value = '';
    }
}

// ==================== Modal Functions ====================
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function openTodoModal() {
    modalDates.todo = new Date(currentDate);
    updateModalDateDisplay('todo');
    renderTodoList(todos.filter(t => t.date === formatDate(modalDates.todo).full));
    openModal('todoModal');
}

function openHabitModal() {
    modalDates.habit = new Date(currentDate);
    updateModalDateDisplay('habit');
    renderHabitListForDate(formatDate(modalDates.habit).full);
    openModal('habitModal');
}

function openDietModal() {
    modalDates.diet = new Date(currentDate);
    updateModalDateDisplay('diet');
    loadDietForDate(formatDate(modalDates.diet).full);
    openModal('dietModal');
}

function openDiaryModal() {
    modalDates.diary = new Date(currentDate);
    updateModalDateDisplay('diary');
    selectedMood = 3;
    document.getElementById('diaryTitle').value = '';
    document.getElementById('diaryContent').value = '';
    selectMood(3);
    openModal('diaryModal');
}

// ==================== Event Listeners ====================
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('todoInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });

    document.getElementById('habitInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addHabit();
    });
});

// ==================== Login Functions ====================
function showLoginPage() {
    openModal('loginModal');
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    
    if (!email || !password) {
        errorEl.textContent = '请输入邮箱和密码';
        errorEl.style.display = 'block';
        return;
    }
    
    const result = await signIn(email, password);
    
    if (result.success) {
        closeModal('loginModal');
        errorEl.style.display = 'none';
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
        alert('登录成功！数据将自动同步到云端。');
    } else {
        errorEl.textContent = result.error || '登录失败';
        errorEl.style.display = 'block';
    }
}

async function handleRegister() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    
    if (!email || !password) {
        errorEl.textContent = '请输入邮箱和密码';
        errorEl.style.display = 'block';
        return;
    }
    
    if (password.length < 6) {
        errorEl.textContent = '密码至少需要6位';
        errorEl.style.display = 'block';
        return;
    }
    
    const result = await signUp(email, password);
    
    if (result.success) {
        errorEl.textContent = '注册成功！请查收验证邮件，然后登录。';
        errorEl.style.color = '#10b981';
        errorEl.style.display = 'block';
    } else {
        errorEl.textContent = result.error || '注册失败';
        errorEl.style.color = '#ef4444';
        errorEl.style.display = 'block';
    }
}

// Override lock function to also sign out
const originalLockApp = lockApp;
lockApp = function() {
    if (currentUser) {
        signOut();
    }
    localStorage.removeItem('dayflow_unlocked');
    location.reload();
};
