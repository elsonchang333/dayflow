// DayFlow Web - 完整功能版
// 功能：待办、饮食、习惯、日记、番茄钟、统计、导出/导入、深色模式、通知

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
document.addEventListener('DOMContentLoaded', () => {
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
        date: formatDate(currentDate).full,
        completed: false,
        created_at: Date.now()
    });
    
    Storage.set('todos', todos);
    input.value = '';
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

// ==================== Modal Functions ====================
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function openTodoModal() {
    renderTodoList(todos.filter(t => t.date === formatDate(currentDate).full));
    openModal('todoModal');
}

function openHabitModal() {
    renderHabitList();
    openModal('habitModal');
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
