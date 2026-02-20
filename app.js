// DayFlow App - Simplified Version (Local Only)
// This version uses only localStorage, no cloud sync required

const SUPABASE_URL = 'https://xucrjpvmqpcrthlvrnxg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1Y3JqcHZtcXBjcnRobHZybnhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NTY0ODcsImV4cCI6MjA4NzAzMjQ4N30.5hcHWVHlx1feMIbgm7jvnFWwxxS5WKmBI1g5W8L5p9E';

let supabaseClient = null;

const AppState = {
  currentPage: 'today',
  habits: [], todos: [], diets: [], events: [], diaries: [],
  currentDate: new Date(), todoFilter: 'all', selectedDiaryMood: 3,
  currentDiaryId: null,
  currentUser: null,
  statsDates: null
};

const Utils = {
  formatDate(date) {
    const d = new Date(date);
    const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    const weekdays = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    return {
      date: `${d.getDate()}`, month: months[d.getMonth()], year: d.getFullYear(),
      weekday: weekdays[d.getDay()],
      full: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    };
  },
  generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2,9); },
  getMoodEmoji(mood) { const emojis = ['😫','😔','😐','😊','😄']; return emojis[(mood||3)-1] || '😐'; }
};

const LocalDB = {
  get(key) { const d = localStorage.getItem(`dayflow_${key}`); return d ? JSON.parse(d) : null; },
  set(key, val) { localStorage.setItem(`dayflow_${key}`, JSON.stringify(val)); }
};

// Load data from localStorage only
function loadData() {
  AppState.todos = LocalDB.get('todos') || [];
  AppState.habits = LocalDB.get('habits') || [];
  AppState.diets = LocalDB.get('diets') || [];
  AppState.events = LocalDB.get('events') || [];
  AppState.diaries = LocalDB.get('diaries') || [];
}

// Save data to localStorage only (no cloud)
function saveData() {
  LocalDB.set('todos', AppState.todos);
  LocalDB.set('habits', AppState.habits);
  LocalDB.set('diets', AppState.diets);
  LocalDB.set('events', AppState.events);
  LocalDB.set('diaries', AppState.diaries);
  console.log('💾 Saved to localStorage');
}

// Simple diet save
function saveDiet() {
  const date = document.getElementById('dietDate')?.value || Utils.formatDate(new Date()).full;
  const getVal = id => document.getElementById(id)?.value?.trim() || '';
  const getNum = id => parseInt(document.getElementById(id)?.value) || 0;
  
  const existingIndex = AppState.diets.findIndex(d => d.date === date);
  
  const dietData = {
    id: existingIndex >= 0 ? AppState.diets[existingIndex].id : Utils.generateId(),
    date: date,
    breakfast: getVal('breakfastInput'),
    breakfastCal: getNum('breakfastCal'),
    lunch: getVal('lunchInput'),
    lunchCal: getNum('lunchCal'),
    dinner: getVal('dinnerInput'),
    dinnerCal: getNum('dinnerCal'),
    snack: getVal('snackInput'),
    snackCal: getNum('snackCal'),
    created_at: existingIndex >= 0 ? AppState.diets[existingIndex].created_at : new Date().toISOString()
  };
  
  if (existingIndex >= 0) {
    AppState.diets[existingIndex] = dietData;
  } else {
    AppState.diets.unshift(dietData);
  }
  
  saveData();
  document.getElementById('dietModal').classList.remove('active');
  renderOverview();
  renderReview();
  alert('饮食记录已保存！（本地）');
}

// Render overview
function renderOverview() {
  const currentDate = Utils.formatDate(AppState.currentDate).full;
  
  const todos = AppState.todos.filter(t => t.date === currentDate);
  const completed = todos.filter(t => t.completed).length;
  document.querySelector('#overviewTodos .overview-count').textContent = `${completed}/${todos.length}`;
  
  const checked = AppState.habits.filter(h => (h.checkIns||[]).includes(currentDate)).length;
  document.querySelector('#overviewHabits .overview-count').textContent = `${checked}/${AppState.habits.length}`;
  
  const diet = AppState.diets.find(d => d.date === currentDate);
  let cal = 0;
  if (diet) cal = (diet.breakfastCal || 0) + (diet.lunchCal || 0) + (diet.dinnerCal || 0) + (diet.snackCal || 0);
  document.querySelector('#overviewDiet .overview-count').textContent = cal;
  
  const events = AppState.events.filter(e => e.date === currentDate).length;
  document.querySelector('#overviewEvents .overview-count').textContent = events;
}

function renderReview() {
  const container = document.getElementById('reviewContent');
  const currentDate = Utils.formatDate(AppState.currentDate).full;
  let html = '';
  
  const completedTodos = AppState.todos.filter(t => t.date === currentDate && t.completed);
  if (completedTodos.length) {
    html += `<div class="review-section"><h4>✅ 完成的待办 (${completedTodos.length})</h4><ul>`;
    html += completedTodos.map(t => `<li>${t.text}</li>`).join('');
    html += '</ul></div>';
  }
  
  const checkedHabits = AppState.habits.filter(h => (h.checkIns||[]).includes(currentDate));
  if (checkedHabits.length) {
    html += `<div class="review-section"><h4>🎯 打卡的习惯 (${checkedHabits.length})</h4><ul>`;
    html += checkedHabits.map(h => `<li>${h.icon||'✨'} ${h.name}</li>`).join('');
    html += '</ul></div>';
  }
  
  const currentDiet = AppState.diets.find(d => d.date === currentDate);
  if (currentDiet) {
    const meals = [];
    if (currentDiet.breakfast) meals.push(`早餐：${currentDiet.breakfast}`);
    if (currentDiet.lunch) meals.push(`午餐：${currentDiet.lunch}`);
    if (currentDiet.dinner) meals.push(`晚餐：${currentDiet.dinner}`);
    if (currentDiet.snack) meals.push(`加餐：${currentDiet.snack}`);
    if (meals.length) {
      html += `<div class="review-section"><h4>🍽️ 饮食记录 (${meals.length}餐)</h4><ul>`;
      html += meals.map(m => `<li>${m}</li>`).join('');
      html += '</ul></div>';
    }
  }
  
  container.innerHTML = html || '<div class="review-empty">今天还没有记录任何内容，开始记录吧！</div>';
}

function initToday() {
  AppState.currentDate = new Date();
  const today = Utils.formatDate(AppState.currentDate);
  document.getElementById('currentDate').textContent = `${today.month}${today.date}日`;
  document.getElementById('currentWeekday').textContent = today.weekday;
  renderOverview();
  renderReview();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  initToday();
  
  // Bind buttons
  document.getElementById('dietBtn')?.addEventListener('click', () => {
    document.getElementById('dietModal').classList.add('active');
    document.getElementById('dietDate').value = Utils.formatDate(new Date()).full;
  });
  
  document.getElementById('saveDiet')?.addEventListener('click', saveDiet);
  document.getElementById('closeDiet')?.addEventListener('click', () => {
    document.getElementById('dietModal').classList.remove('active');
  });
  
  console.log('✅ DayFlow initialized (local only)');
});
