// DayFlow Web - 精美升级版
// 使用 localStorage 存储数据

// Storage
const Storage = {
    get(key) {
        const data = localStorage.getItem('dayflow_' + key);
        return data ? JSON.parse(data) : null;
    },
    set(key, value) {
        localStorage.setItem('dayflow_' + key, JSON.stringify(value));
    }
};

// State
let todos = Storage.get('todos') || [];
let habits = Storage.get('habits') || [];
let diets = Storage.get('diets') || [];
let diaries = Storage.get('diaries') || [];
let currentDate = new Date();
let selectedMood = 3;

// Utils
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

const getToday = () => formatDate(new Date()).full;

// Init
document.addEventListener('DOMContentLoaded', () => {
    updateDate();
    renderAll();
    
    // Close modal on background click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
});

// Update date display
function updateDate() {
    const today = formatDate(currentDate);
    document.getElementById('currentDate').textContent = today.month + today.date + '日';
    document.getElementById('currentWeekday').textContent = today.weekday;
}

// Render all
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
    renderReview();
    
    // Stats
    updateStats();
    
    // Diary
    renderDiaryList();
}

// Render Today's Review
function renderReview() {
    const dateStr = formatDate(currentDate).full;
    const todayTodos = todos.filter(t => t.date === dateStr);
    const completedTodos = todayTodos.filter(t => t.completed);
    const checkedHabits = habits.filter(h => h.checkIns && h.checkIns.includes(dateStr));
    const todayDiet = diets.find(d => d.date === dateStr);
    const todayDiary = diaries.find(d => d.date === dateStr);
    
    let reviewHTML = '<div class="review-card">';
    reviewHTML += '<div class="review-title">🌟 今日复盘</div>';
    
    if (todayTodos.length === 0 && habits.length === 0 && !todayDiet) {
        reviewHTML += '<div style="text-align:center;padding:20px;opacity:0.9;">';
        reviewHTML += '<div style="font-size:40px;margin-bottom:12px;">👋</div>';
        reviewHTML += '<div>今天还没有记录哦，快开始吧！</div>';
        reviewHTML += '</div>';
    } else {
        // Todos summary
        if (todayTodos.length > 0) {
            const rate = Math.round((completedTodos.length / todayTodos.length) * 100);
            let emoji = rate === 100 ? '🎉' : rate >= 70 ? '👍' : rate >= 40 ? '💪' : '🔥';
            reviewHTML += `<div class="review-item">`;
            reviewHTML += `<span class="review-emoji">${emoji}</span>`;
            reviewHTML += `<span>完成 ${completedTodos.length}/${todayTodos.length} 个待办 (${rate}%)</span>`;
            reviewHTML += `</div>`;
        }
        
        // Habits summary
        if (habits.length > 0) {
            const habitRate = Math.round((checkedHabits.length / habits.length) * 100);
            let emoji = habitRate === 100 ? '🌟' : habitRate >= 70 ? '✨' : habitRate >= 40 ? '📌' : '📍';
            reviewHTML += `<div class="review-item">`;
            reviewHTML += `<span class="review-emoji">${emoji}</span>`;
            reviewHTML += `<span>打卡 ${checkedHabits.length}/${habits.length} 个习惯 (${habitRate}%)</span>`;
            reviewHTML += `</div>`;
        }
        
        // Diet summary
        if (todayDiet) {
            const totalCal = (todayDiet.breakfastCal || 0) + (todayDiet.lunchCal || 0) + 
                           (todayDiet.dinnerCal || 0) + (todayDiet.snackCal || 0);
            let emoji = totalCal > 2500 ? '🍔' : totalCal > 2000 ? '😋' : totalCal > 1500 ? '🥗' : '🥗';
            reviewHTML += `<div class="review-item">`;
            reviewHTML += `<span class="review-emoji">${emoji}</span>`;
            reviewHTML += `<span>今日摄入 ${totalCal} 卡路里</span>`;
            reviewHTML += `</div>`;
        }
        
        // Diary summary
        if (todayDiary) {
            const moods = ['😫','😔','😐','😊','😄'];
            reviewHTML += `<div class="review-item">`;
            reviewHTML += `<span class="review-emoji">${moods[todayDiary.mood - 1] || '😐'}</span>`;
            reviewHTML += `<span>今日心情: ${todayDiary.title || '已记录'}</span>`;
            reviewHTML += `</div>`;
        }
    }
    
    reviewHTML += '</div>';
    document.getElementById('reviewContent').innerHTML = reviewHTML;
}

// Todo Functions
function addTodo() {
    const input = document.getElementById('todoInput');
    const text = input.value.trim();
    if (!text) return;
    
    const todo = {
        id: generateId(),
        text: text,
        date: formatDate(currentDate).full,
        completed: false,
        created_at: Date.now()
    };
    
    todos.unshift(todo);
    Storage.set('todos', todos);
    input.value = '';
    renderAll();
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
    // Preview list
    const previewList = document.getElementById('todoList');
    if (previewList) {
        previewList.innerHTML = todayTodos.slice(0, 3).map(todo => `
            <div class="todo-item" onclick="toggleTodo('${todo.id}')">
                <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''}>
                <span class="todo-text ${todo.completed ? 'todo-completed' : ''}">${todo.text}</span>
            </div>
        `).join('');
    }
    
    // Modal list
    const modalList = document.getElementById('todoModalList');
    if (modalList) {
        modalList.innerHTML = todayTodos.map(todo => `
            <div class="todo-item">
                <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''} 
                       onclick="toggleTodo('${todo.id}')">
                <span class="todo-text ${todo.completed ? 'todo-completed' : ''}">${todo.text}</span>
                <span class="todo-delete" onclick="deleteTodo('${todo.id}')">
                    <i class="fas fa-trash"></i>
                </span>
            </div>
        `).join('');
    }
}

// Habit Functions
function addHabit() {
    const input = document.getElementById('habitInput');
    const name = input.value.trim();
    if (!name) return;
    
    const habit = {
        id: generateId(),
        name: name,
        icon: '✅',
        checkIns: [],
        created_at: Date.now()
    };
    
    habits.unshift(habit);
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
    
    // Preview
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
    
    // Modal
    const modalList = document.getElementById('habitModalList');
    if (modalList) {
        modalList.innerHTML = habits.map(habit => {
            const isChecked = habit.checkIns && habit.checkIns.includes(dateStr);
            return `
                <div class="todo-item">
                    <div class="habit-item ${isChecked ? 'habit-checked' : ''}" onclick="toggleHabit('${habit.id}')" style="flex:1;margin-right:12px;">
                        <div class="habit-icon">${habit.icon}</div>
                        <span class="habit-name">${habit.name}</span>
                    </div>
                    <span class="todo-delete" onclick="deleteHabit('${habit.id}')">
                        <i class="fas fa-trash"></i>
                    </span>
                </div>
            `;
        }).join('');
    }
}

// Diet Functions
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
    
    // Show toast
    showToast('饮食记录已保存！');
}

// Diary Functions
function selectMood(mood) {
    selectedMood = mood;
    document.querySelectorAll('.mood-item').forEach(item => {
        item.classList.remove('selected');
        if (parseInt(item.dataset.mood) === mood) {
            item.classList.add('selected');
        }
    });
}

function saveDiary() {
    const title = document.getElementById('diaryTitle').value.trim();
    const content = document.getElementById('diaryContent').value.trim();
    
    if (!title && !content) {
        alert('请填写标题或内容');
        return;
    }
    
    const dateStr = formatDate(currentDate).full;
    const existingIndex = diaries.findIndex(d => d.date === dateStr);
    
    const diaryData = {
        id: existingIndex >= 0 ? diaries[existingIndex].id : generateId(),
        date: dateStr,
        title: title || '无标题',
        content: content,
        mood: selectedMood,
        created_at: existingIndex >= 0 ? diaries[existingIndex].created_at : Date.now(),
        updated_at: Date.now()
    };
    
    if (existingIndex >= 0) {
        diaries[existingIndex] = diaryData;
    } else {
        diaries.unshift(diaryData);
    }
    
    Storage.set('diaries', diaries);
    closeModal('diaryModal');
    
    // Reset form
    document.getElementById('diaryTitle').value = '';
    document.getElementById('diaryContent').value = '';
    selectMood(3);
    
    renderAll();
    showToast('日记已保存！');
}

function deleteDiary(id) {
    if (confirm('确定要删除这篇日记吗？')) {
        diaries = diaries.filter(d => d.id !== id);
        Storage.set('diaries', diaries);
        renderAll();
        showToast('日记已删除');
    }
}

function renderDiaryList() {
    const list = document.getElementById('diaryList');
    const empty = document.getElementById('diaryEmpty');
    const fab = document.getElementById('diaryFab');
    
    if (!list) return;
    
    if (diaries.length === 0) {
        list.innerHTML = '';
        empty.style.display = 'block';
    } else {
        empty.style.display = 'none';
        
        const sorted = [...diaries].sort((a, b) => new Date(b.date) - new Date(a.date));
        
        list.innerHTML = sorted.map(diary => {
            const dateInfo = formatDate(diary.date);
            const moods = ['😫','😔','😐','😊','😄'];
            const mood = moods[(diary.mood || 3) - 1] || '😐';
            
            return `
                <div class="diary-card">
                    <div class="diary-header">
                        <div style="display:flex;align-items:center;gap:12px;">
                            <div class="diary-date">
                                <div class="diary-month">${dateInfo.month}</div>
                                <div class="diary-day">${dateInfo.date}</div>
                            </div>
                            <div class="diary-mood">${mood}</div>
                        </div>
                        <span style="color:#ef4444;cursor:pointer;" onclick="deleteDiary('${diary.id}')">
                            <i class="fas fa-trash"></i>
                        </span>
                    </div>
                    <div class="diary-title">${diary.title}</div>
                    <div class="diary-content">${diary.content || ''}</div>
                </div>
            `;
        }).join('');
    }
    
    // Show FAB on diary page
    if (fab) {
        const isDiaryPage = document.getElementById('diaryPage').style.display !== 'none';
        fab.style.display = isDiaryPage ? 'flex' : 'none';
    }
}

// Stats
function updateStats() {
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

// Navigation
function showPage(page) {
    // Hide all pages
    document.getElementById('todayPage').style.display = 'none';
    document.getElementById('statsPage').style.display = 'none';
    document.getElementById('diaryPage').style.display = 'none';
    
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
    
    // Re-render if needed
    if (page === 'diary') {
        renderDiaryList();
    }
}

// Modal Functions
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

function openDiaryModal() {
    const dateStr = formatDate(currentDate).full;
    const existingDiary = diaries.find(d => d.date === dateStr);
    
    if (existingDiary) {
        document.getElementById('diaryTitle').value = existingDiary.title === '无标题' ? '' : existingDiary.title;
        document.getElementById('diaryContent').value = existingDiary.content || '';
        selectMood(existingDiary.mood || 3);
    } else {
        document.getElementById('diaryTitle').value = '';
        document.getElementById('diaryContent').value = '';
        selectMood(3);
    }
    
    openModal('diaryModal');
}

// Toast
function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 16px 32px;
        border-radius: 12px;
        font-size: 16px;
        z-index: 9999;
        animation: fadeIn 0.3s;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 1500);
}

// Enter key support
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('todoInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addTodo();
    });
    
    document.getElementById('habitInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addHabit();
    });
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeIn {
        from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
    @keyframes fadeOut {
        from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        to { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
    }
`;
document.head.appendChild(style);
