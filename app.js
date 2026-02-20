// DayFlow Web - 纯网页版
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
    
    // Stats
    updateStats();
    
    // Diary
    renderDiaryList();
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
                    <div class="habit-item ${isChecked ? 'habit-checked' : ''}" onclick="toggleHabit('${habit.id}')">
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
    alert('饮食记录已保存！');
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

// Diary
function renderDiaryList() {
    const list = document.getElementById('diaryList');
    if (!list) return;
    
    if (diaries.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📖</div>
                <div>还没有日记</div>
            </div>
        `;
        return;
    }
    
    const sorted = [...diaries].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    list.innerHTML = sorted.map(diary => {
        const dateInfo = formatDate(diary.date);
        const moods = ['😫','😔','😐','😊','😄'];
        const mood = moods[(diary.mood || 3) - 1] || '😐';
        
        return `
            <div class="section">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <div style="font-weight:600;">${dateInfo.month}${dateInfo.date}日</div>
                    <div style="font-size:24px;">${mood}</div>
                </div>
                <div style="font-weight:600;margin-bottom:4px;">${diary.title || '无标题'}</div>
                <div style="color:#64748b;font-size:14px;">${diary.content || ''}</div>
            </div>
        `;
    }).join('');
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

// Close modal on background click
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});

// Enter key support
document.getElementById('todoInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTodo();
});

document.getElementById('habitInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addHabit();
});
