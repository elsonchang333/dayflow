// DayFlow Web - 完整功能版（含 Supabase 登录同步）
// 功能：待办、饮食、习惯、日记、番茄钟、统计、导出/导入、深色模式、通知、登录同步

// ==================== Supabase Config ====================
const SUPABASE_URL = 'https://zwmulguxnpidlmyjnpge.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3bXVsZ3V4bnBpZGxteWpucGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1OTIwMjIsImV4cCI6MjA4NzE2ODAyMn0.Ft7u2_oco7JkQBrbEzhG2_rDihIaGs60f-Sfwb2FSAU';

// ==================== Storage ====================
const Storage = {
    get(key) {
        const data = localStorage.getItem('dayflow_' + key);
        return data ? JSON.parse(data) : null;
    },
    set(key, value) {
        localStorage.setItem('dayflow_' + key, JSON.stringify(value));
    }
};

// ==================== State ====================
let todos = Storage.get('todos') || [];
let habits = Storage.get('habits') || [];
let diets = Storage.get('diets') || [];
let diaries = Storage.get('diaries') || [];
let pomodoroHistory = Storage.get('pomodoroHistory') || [];
let currentDate = new Date();
let selectedMood = 3;

// ==================== Auth State ====================
let currentUser = null;
let authToken = Storage.get('auth_token');
let lastSyncTime = Storage.get('last_sync_time') || 0;

// ==================== Auth Functions ====================
function isLoggedIn() {
  return !!currentUser;
}

function getAuthHeaders() {
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${authToken || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function signUp(email, password) {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error_description || data.error);
    }
    
    if (data.user && data.session) {
      currentUser = data.user;
      authToken = data.session.access_token;
      Storage.set('auth_token', authToken);
      Storage.set('user_email', email);
      return { success: true, user: data.user };
    }
    
    return { success: true, message: '注册成功，请查收验证邮件' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function signIn(email, password) {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error_description || data.error);
    }
    
    currentUser = data.user;
    authToken = data.access_token;
    Storage.set('auth_token', authToken);
    Storage.set('user_email', email);
    
    // Sync data after login
    await syncAll();
    
    return { success: true, user: data.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function signOut() {
  currentUser = null;
  authToken = null;
  Storage.set('auth_token', null);
  Storage.set('user_email', null);
  renderAuthUI();
}

async function getCurrentUser() {
  if (!authToken) return null;
  
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: getAuthHeaders()
    });
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
    currentUser = data;
    return data;
  } catch (error) {
    console.error('Get user failed:', error);
    return null;
  }
}

// ==================== Sync Functions ====================
async function syncAll() {
  if (!isLoggedIn()) {
    alert('请先登录');
    return { success: false, error: '未登录' };
  }
  
  try {
    showSyncLoading(true);
    
    // Upload local data
    await uploadTodos();
    await uploadHabits();
    await uploadDiets();
    await uploadDiaries();
    
    // Download cloud data
    await downloadTodos();
    await downloadHabits();
    await downloadDiets();
    await downloadDiaries();
    
    // Save locally
    saveAllData();
    
    lastSyncTime = Date.now();
    Storage.set('last_sync_time', lastSyncTime);
    
    renderAll();
    showSyncLoading(false);
    
    return { success: true };
  } catch (error) {
    console.error('Sync failed:', error);
    showSyncLoading(false);
    return { success: false, error: error.message };
  }
}

async function uploadTodos() {
  const records = todos.map(t => ({
    id: t.id,
    user_id: currentUser.id,
    text: t.text,
    date: t.date,
    completed: t.completed,
    created_at: new Date(t.created_at).toISOString(),
    updated_at: new Date(t.updated_at || t.created_at).toISOString()
  }));
  
  if (records.length === 0) return;
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/todos`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(records)
  });
  
  if (!response.ok) {
    throw new Error('Upload todos failed');
  }
}

async function uploadHabits() {
  const records = habits.map(h => ({
    id: h.id,
    user_id: currentUser.id,
    name: h.name,
    icon: h.icon,
    check_ins: h.checkIns || [],
    created_at: new Date(h.created_at).toISOString()
  }));
  
  if (records.length === 0) return;
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/habits`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(records)
  });
  
  if (!response.ok) {
    throw new Error('Upload habits failed');
  }
}

async function uploadDiets() {
  const records = diets.map(d => ({
    id: d.id,
    user_id: currentUser.id,
    date: d.date,
    breakfast: d.breakfast,
    breakfast_cal: d.breakfastCal || 0,
    lunch: d.lunch,
    lunch_cal: d.lunchCal || 0,
    dinner: d.dinner,
    dinner_cal: d.dinnerCal || 0,
    snack: d.snack,
    snack_cal: d.snackCal || 0,
    created_at: new Date(d.created_at).toISOString(),
    updated_at: new Date(d.updated_at || d.created_at).toISOString()
  }));
  
  if (records.length === 0) return;
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/diets`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(records)
  });
  
  if (!response.ok) {
    throw new Error('Upload diets failed');
  }
}

async function uploadDiaries() {
  const records = diaries.map(d => ({
    id: d.id,
    user_id: currentUser.id,
    date: d.date,
    title: d.title,
    content: d.content,
    mood: d.mood,
    created_at: new Date(d.created_at).toISOString(),
    updated_at: new Date(d.updated_at || d.created_at).toISOString()
  }));
  
  if (records.length === 0) return;
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/diaries`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(records)
  });
  
  if (!response.ok) {
    throw new Error('Upload diaries failed');
  }
}

async function downloadTodos() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/todos?select=*`, {
    headers: getAuthHeaders()
  });
  
  if (!response.ok) return;
  
  const data = await response.json();
  
  // Merge with local data
  data.forEach(remote => {
    const local = todos.find(t => t.id === remote.id);
    if (!local) {
      todos.push({
        id: remote.id,
        text: remote.text,
        date: remote.date,
        completed: remote.completed,
        created_at: new Date(remote.created_at).getTime(),
        updated_at: new Date(remote.updated_at).getTime()
      });
    }
  });
}

async function downloadHabits() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/habits?select=*`, {
    headers: getAuthHeaders()
  });
  
  if (!response.ok) return;
  
  const data = await response.json();
  
  data.forEach(remote => {
    const local = habits.find(h => h.id === remote.id);
    if (!local) {
      habits.push({
        id: remote.id,
        name: remote.name,
        icon: remote.icon,
        checkIns: remote.check_ins || [],
        created_at: new Date(remote.created_at).getTime()
      });
    } else {
      // Merge check-ins
      local.checkIns = [...new Set([...local.checkIns, ...(remote.check_ins || [])])];
    }
  });
}

async function downloadDiets() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/diets?select=*`, {
    headers: getAuthHeaders()
  });
  
  if (!response.ok) return;
  
  const data = await response.json();
  
  data.forEach(remote => {
    const local = diets.find(d => d.id === remote.id);
    if (!local) {
      diets.push({
        id: remote.id,
        date: remote.date,
        breakfast: remote.breakfast,
        breakfastCal: remote.breakfast_cal,
        lunch: remote.lunch,
        lunchCal: remote.lunch_cal,
        dinner: remote.dinner,
        dinnerCal: remote.dinner_cal,
        snack: remote.snack,
        snackCal: remote.snack_cal,
        created_at: new Date(remote.created_at).getTime(),
        updated_at: new Date(remote.updated_at).getTime()
      });
    }
  });
}

async function downloadDiaries() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/diaries?select=*`, {
    headers: getAuthHeaders()
  });
  
  if (!response.ok) return;
  
  const data = await response.json();
  
  data.forEach(remote => {
    const local = diaries.find(d => d.id === remote.id);
    if (!local) {
      diaries.push({
        id: remote.id,
        date: remote.date,
        title: remote.title,
        content: remote.content,
        mood: remote.mood,
        created_at: new Date(remote.created_at).getTime(),
        updated_at: new Date(remote.updated_at).getTime()
      });
    }
  });
}

function saveAllData() {
  Storage.set('todos', todos);
  Storage.set('habits', habits);
  Storage.set('diets', diets);
  Storage.set('diaries', diaries);
}

function showSyncLoading(show) {
  const btn = document.getElementById('syncBtn');
  if (btn) {
    btn.innerHTML = show ? '<i class="fas fa-spinner fa-spin"></i> 同步中...' : '<i class="fas fa-cloud-upload-alt"></i> 立即同步';
    btn.disabled = show;
  }
}

// ==================== Pomodoro Timer ====================
let pomodoroTimer = null;
let pomodoroTimeLeft = 25 * 60; // 25 minutes in seconds
let pomodoroTotalTime = 25 * 60;
let pomodoroIsRunning = false;
let pomodoroIsPaused = false;

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
    initSettings();
    updateDate();
    renderAll();
    initPomodoro();
    
    // Check login status
    await initAuth();
});

async function initAuth() {
    // Try to get current user from token
    if (authToken) {
        const user = await getCurrentUser();
        if (user) {
            currentUser = user;
            renderAuthUI();
            return;
        }
    }
    
    // Show login page if not logged in
    renderAuthUI();
}

function renderAuthUI() {
    const loginPage = document.getElementById('loginPage');
    const todayPage = document.getElementById('todayPage');
    const bottomNav = document.querySelector('.bottom-nav');
    
    if (!isLoggedIn()) {
        // Show login page
        if (loginPage) loginPage.style.display = 'block';
        if (todayPage) todayPage.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';
    } else {
        // Show main app
        if (loginPage) loginPage.style.display = 'none';
        if (todayPage) todayPage.style.display = 'block';
        if (bottomNav) bottomNav.style.display = 'flex';
        
        // Update settings page
        updateSettingsAuthUI();
    }
}

function updateSettingsAuthUI() {
    const userEmailDisplay = document.getElementById('userEmailDisplay');
    const lastSyncDisplay = document.getElementById('lastSyncDisplay');
    const syncBtn = document.getElementById('syncBtn');
    const loginActionItem = document.getElementById('loginActionItem');
    const logoutActionItem = document.getElementById('logoutActionItem');
    
    if (isLoggedIn()) {
        if (userEmailDisplay) userEmailDisplay.textContent = Storage.get('user_email') || '已登录';
        if (lastSyncDisplay) lastSyncDisplay.textContent = lastSyncTime ? new Date(lastSyncTime).toLocaleString() : '从未同步';
        if (syncBtn) syncBtn.style.display = 'block';
        if (loginActionItem) loginActionItem.style.display = 'none';
        if (logoutActionItem) logoutActionItem.style.display = 'block';
    } else {
        if (userEmailDisplay) userEmailDisplay.textContent = '未登录';
        if (lastSyncDisplay) lastSyncDisplay.textContent = '离线使用';
        if (syncBtn) syncBtn.style.display = 'none';
        if (loginActionItem) loginActionItem.style.display = 'block';
        if (logoutActionItem) logoutActionItem.style.display = 'none';
    }
}

function showLoginPage() {
    showPage('settings');
    document.getElementById('settingsPage').style.display = 'none';
    document.getElementById('loginPage').style.display = 'block';
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        alert('请输入邮箱和密码');
        return;
    }
    
    const btn = document.getElementById('loginBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 登录中...';
    btn.disabled = true;
    
    const result = await signIn(email, password);
    
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> 登录';
    btn.disabled = false;
    
    if (result.success) {
        alert('登录成功！');
        renderAuthUI();
    } else {
        alert('登录失败: ' + result.error);
    }
}

async function handleRegister() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        alert('请输入邮箱和密码');
        return;
    }
    
    if (password.length < 6) {
        alert('密码至少需要6位');
        return;
    }
    
    const btn = document.getElementById('registerBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 注册中...';
    btn.disabled = true;
    
    const result = await signUp(email, password);
    
    btn.innerHTML = '<i class="fas fa-user-plus"></i> 注册新账号';
    btn.disabled = false;
    
    if (result.success) {
        if (result.user) {
            alert('注册成功！已自动登录。');
            renderAuthUI();
        } else {
            alert('注册成功！请查收验证邮件后登录。');
        }
    } else {
        alert('注册失败: ' + result.error);
    }
}

function skipLogin() {
    // Hide login page, show main app
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('todayPage').style.display = 'block';
    document.querySelector('.bottom-nav').style.display = 'flex';
}

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
    document.getElementById(page + 'Page').style.display = 'block';
    
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    event.target.closest('.nav-btn').classList.add('active');
    
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
    if (page === 'pomodoro') updatePomodoroHistory();
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
    calendarCurrentMonth = new Date(currentDate);
    renderCalendar();
    openModal('calendarModal');
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
    document.getElementById('calorieCount').textContent = totalCal;
    
    // Review
    renderReview(todayTodos, checkedHabits, totalCal);
    
    // Stats
    updateStats();
}

function renderReview(todayTodos, checkedHabits, totalCal) {
    const reviewContent = document.getElementById('reviewContent');
    
    if (todayTodos.length === 0 && habits.length === 0) {
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
    
    if (habits.length > 0) {
        html += `
            <div class="review-item">
                <span class="review-emoji">✅</span>
                <span>完成 ${checkedHabits.length}/${habits.length} 个习惯打卡</span>
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
    
    todos.unshift({
        id: generateId(),
        text: text,
        date: formatDate(modalDates.todo).full,
        completed: false,
        created_at: Date.now()
    });
    
    Storage.set('todos', todos);
    input.value = '';
    renderTodoList(todos.filter(t => t.date === formatDate(modalDates.todo).full));
    renderAll();
    
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
    
    const dietData = {
        id: existingIndex >= 0 ? diets[existingIndex].id : generateId(),
        date: dateStr,
        breakfast: document.getElementById('breakfastInput').value,
        breakfastCal: parseInt(document.getElementById('breakfastCal').value) || 0,
        lunch: document.getElementById('lunchInput').value,
        lunchCal: parseInt(document.getElementById('lunchCal').value) || 0,
        dinner: document.getElementById('dinnerInput').value,
        dinnerCal: parseInt(document.getElementById('dinnerCal').value) || 0,
        snack: document.getElementById('snackInput').value,
        snackCal: parseInt(document.getElementById('snackCal').value) || 0,
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
    selectedMood = 3;
    document.getElementById('diaryTitle').value = '';
    document.getElementById('diaryContent').value = '';
    selectMood(3);
    openModal('diaryModal');
}

function saveDiary() {
    const title = document.getElementById('diaryTitle').value.trim();
    const content = document.getElementById('diaryContent').value.trim();
    
    if (!title && !content) {
        alert('请填写标题或内容');
        return;
    }
    
    diaries.unshift({
        id: generateId(),
        date: formatDate(currentDate).full,
        title: title || '无标题',
        content: content,
        mood: selectedMood,
        created_at: Date.now(),
        updated_at: Date.now()
    });
    
    Storage.set('diaries', diaries);
    closeModal('diaryModal');
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
            <div class="diary-card">
                <div class="diary-header">
                    <div style="display:flex;align-items:center;gap:16px;">
                        <div class="diary-date" style="background:${moodColor}20;border:2px solid ${moodColor};">
                            <div class="diary-month">${dateInfo.month}</div>
                            <div class="diary-day">${dateInfo.date}</div>
                        </div>
                        <div>
                            <div class="diary-title">${diary.title}</div>
                            <div style="color:#94a3b8;font-size:13px;">${dateInfo.weekday}</div>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div style="font-size:32px;">${mood}</div>
                        <i class="fas fa-trash" style="color:#ef4444;cursor:pointer;" onclick="deleteDiary('${diary.id}')"></i>
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

function startPomodoro() {
    if (pomodoroIsRunning) return;
    
    pomodoroIsRunning = true;
    pomodoroIsPaused = false;
    
    document.getElementById('pomodoroStartBtn').style.display = 'none';
    document.getElementById('pomodoroPauseBtn').style.display = 'inline-block';
    document.getElementById('pomodoroStatus').textContent = '专注中...';
    
    pomodoroTimer = setInterval(() => {
        if (pomodoroTimeLeft > 0) {
            pomodoroTimeLeft--;
            updatePomodoroDisplay();
        } else {
            completePomodoro();
        }
    }, 1000);
}

function pausePomodoro() {
    if (!pomodoroIsRunning) return;
    
    clearInterval(pomodoroTimer);
    pomodoroIsRunning = false;
    pomodoroIsPaused = true;
    
    document.getElementById('pomodoroStartBtn').style.display = 'inline-block';
    document.getElementById('pomodoroPauseBtn').style.display = 'none';
    document.getElementById('pomodoroStatus').textContent = '已暂停';
}

function resetPomodoro() {
    clearInterval(pomodoroTimer);
    pomodoroIsRunning = false;
    pomodoroIsPaused = false;
    pomodoroTimeLeft = pomodoroTotalTime;
    
    document.getElementById('pomodoroStartBtn').style.display = 'inline-block';
    document.getElementById('pomodoroPauseBtn').style.display = 'none';
    document.getElementById('pomodoroStatus').textContent = '准备开始专注';
    
    updatePomodoroDisplay();
}

function completePomodoro() {
    clearInterval(pomodoroTimer);
    pomodoroIsRunning = false;
    
    // Save to history
    const today = formatDate(new Date()).full;
    const todayHistory = pomodoroHistory.filter(p => p.date === today);
    pomodoroHistory.push({
        id: generateId(),
        date: today,
        completed_at: Date.now()
    });
    Storage.set('pomodoroHistory', pomodoroHistory);
    
    // Reset
    pomodoroTimeLeft = pomodoroTotalTime;
    document.getElementById('pomodoroStartBtn').style.display = 'inline-block';
    document.getElementById('pomodoroPauseBtn').style.display = 'none';
    document.getElementById('pomodoroStatus').textContent = '专注完成！休息一下吧 🎉';
    
    updatePomodoroDisplay();
    updatePomodoroHistory();
    
    // Notification
    if (settings.notifications && 'Notification' in window) {
        new Notification('番茄钟完成！', { 
            body: '专注时间结束，休息一下吧 🎉',
            icon: '🍅'
        });
    } else {
        alert('🎉 番茄钟完成！休息一下吧');
    }
}

function updatePomodoroDisplay() {
    const minutes = Math.floor(pomodoroTimeLeft / 60);
    const seconds = pomodoroTimeLeft % 60;
    document.getElementById('pomodoroTime').textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    // Update progress circle
    const progress = (pomodoroTotalTime - pomodoroTimeLeft) / pomodoroTotalTime;
    const circumference = 2 * Math.PI * 90;
    const offset = circumference - (progress * circumference);
    document.getElementById('progressCircle').style.strokeDashoffset = offset;
}

function updatePomodoroHistory() {
    const today = formatDate(new Date()).full;
    const todayCount = pomodoroHistory.filter(p => p.date === today).length;
    document.getElementById('pomodoroHistory').textContent = `${todayCount} 次`;
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
