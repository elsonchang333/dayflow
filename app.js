// DayFlow App - Zeabur Version
const SUPABASE_URL = 'https://xucrjpvmqpcrthlvrnxg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1Y3JqcHZtcXBjcnRobHZybnhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NTY0ODcsImV4cCI6MjA4NzAzMjQ4N30.5hcHWVHlx1feMIbgm7jvnFWwxxS5WKmBI1g5W8L5p9E';

let supabaseClient = null;
let isOnline = false;

const AppState = {
  currentPage: 'today',
  habits: [], todos: [], diet: {}, events: [], diaries: [],
  currentDate: new Date(), todoFilter: 'all', selectedDiaryMood: 3,
  currentDiaryId: null
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

async function initSupabase() {
  try {
    // Wait for supabase to be available (retry up to 5 times)
    let retries = 0;
    while (typeof window.supabase === 'undefined' && retries < 5) {
      await new Promise(r => setTimeout(r, 500));
      retries++;
    }
    
    if (typeof window.supabase === 'undefined') { 
      console.warn('⚠️ Supabase SDK not loaded, using local storage only'); 
      return false; 
    }
    
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await supabaseClient.from('todos').select('count');
    if (error) throw error;
    isOnline = true; 
    console.log('✅ Supabase connected - data will sync to cloud'); 
    
    // Try to sync local data to Supabase
    await syncToSupabase();
    
    return true;
  } catch(e) { 
    console.warn('❌ Supabase connection failed:', e.message); 
    isOnline = false; 
    return false; 
  }
}

// Sync local data to Supabase
async function syncToSupabase() {
  if (!isOnline || !supabaseClient) return;
  
  try {
    console.log('🔄 Syncing local data to Supabase...');
    
    // Sync todos
    for (const todo of AppState.todos) {
      const { error } = await supabaseClient.from('todos').upsert(todo);
      if (error) console.warn('Failed to sync todo:', error);
    }
    
    // Sync habits
    for (const habit of AppState.habits) {
      const { error } = await supabaseClient.from('habits').upsert(habit);
      if (error) console.warn('Failed to sync habit:', error);
    }
    
    // Sync diaries
    for (const diary of AppState.diaries) {
      const { error } = await supabaseClient.from('diaries').upsert(diary);
      if (error) console.warn('Failed to sync diary:', error);
    }
    
    console.log('✅ Sync complete');
  } catch(e) {
    console.warn('❌ Sync failed:', e.message);
  }
}

function loadData() {
  AppState.todos = LocalDB.get('todos') || [];
  AppState.habits = LocalDB.get('habits') || [];
  AppState.diet = LocalDB.get('diet') || {};
  AppState.events = LocalDB.get('events') || [];
  AppState.diaries = LocalDB.get('diaries') || [];
}

function saveData() {
  LocalDB.set('todos', AppState.todos);
  LocalDB.set('habits', AppState.habits);
  LocalDB.set('diet', AppState.diet);
  LocalDB.set('events', AppState.events);
  LocalDB.set('diaries', AppState.diaries);
}

function initToday() {
  const today = Utils.formatDate(new Date());
  document.getElementById('currentDate').textContent = `${today.month}${today.date}日`;
  document.getElementById('currentWeekday').textContent = today.weekday;
  renderOverview(); renderReview();
}

function renderOverview() {
  const today = Utils.formatDate(new Date()).full;
  const todos = AppState.todos.filter(t => t.date === today);
  const completed = todos.filter(t => t.completed).length;
  document.querySelector('#overviewTodos .overview-count').textContent = `${completed}/${todos.length}`;
  
  const checked = AppState.habits.filter(h => (h.checkIns||[]).includes(today)).length;
  document.querySelector('#overviewHabits .overview-count').textContent = `${checked}/${AppState.habits.length}`;
  
  const diet = AppState.diet[today];
  let cal = 0;
  if (diet) cal = (diet.breakfast?.calories||0)+(diet.lunch?.calories||0)+(diet.dinner?.calories||0)+(diet.snack?.calories||0);
  document.querySelector('#overviewDiet .overview-count').textContent = cal;
  
  const events = AppState.events.filter(e => e.date === today).length;
  document.querySelector('#overviewEvents .overview-count').textContent = events;
}

function renderReview() {
  const container = document.getElementById('reviewContent');
  const today = Utils.formatDate(new Date()).full;
  let html = '';
  
  const completedTodos = AppState.todos.filter(t => t.date === today && t.completed);
  if (completedTodos.length) {
    html += `<div class="review-section"><h4>✅ 完成的待办 (${completedTodos.length})</h4><ul>`;
    html += completedTodos.map(t => `<li>${t.text}</li>`).join('');
    html += '</ul></div>';
  }
  
  const checkedHabits = AppState.habits.filter(h => (h.checkIns||[]).includes(today));
  if (checkedHabits.length) {
    html += `<div class="review-section"><h4>🎯 打卡的习惯 (${checkedHabits.length})</h4><ul>`;
    html += checkedHabits.map(h => `<li>${h.icon||'✨'} ${h.name}</li>`).join('');
    html += '</ul></div>';
  }
  
  const todayDiet = AppState.diet[today];
  if (todayDiet) {
    const meals = [];
    if (todayDiet.breakfast?.food) meals.push(`早餐：${todayDiet.breakfast.food}`);
    if (todayDiet.lunch?.food) meals.push(`午餐：${todayDiet.lunch.food}`);
    if (todayDiet.dinner?.food) meals.push(`晚餐：${todayDiet.dinner.food}`);
    if (todayDiet.snack?.food) meals.push(`加餐：${todayDiet.snack.food}`);
    if (meals.length) {
      html += `<div class="review-section"><h4>🍽️ 饮食记录 (${meals.length}餐)</h4><ul>`;
      html += meals.map(m => `<li>${m}</li>`).join('');
      html += '</ul></div>';
    }
  }
  
  const todayEvents = AppState.events.filter(e => e.date === today);
  if (todayEvents.length) {
    html += `<div class="review-section"><h4>📅 今日行程 (${todayEvents.length})</h4><ul>`;
    html += todayEvents.map(e => `<li>${e.time||'全天'} - ${e.title}</li>`).join('');
    html += '</ul></div>';
  }
  
  const todayDiary = AppState.diaries.find(d => d.date === today);
  if (todayDiary) {
    html += `<div class="review-section"><h4>📖 今日日记</h4><div class="review-diary"><strong>${todayDiary.title}</strong><p>${todayDiary.content?.substring(0,100)||''}</p></div></div>`;
  }
  
  container.innerHTML = html || '<div class="review-empty">今天还没有记录任何内容，开始记录吧！</div>';
}

function showPage(page) {
  AppState.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`${page}Page`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  if (page === 'calendar') { renderCalendar(); renderDayEvents(); }
  if (page === 'stats') { setTimeout(renderStats, 100); }
  if (page === 'diary') renderDiaryList();
}

// Statistics
let habitChart, dietChart, todoChart, moodChart;

function getWeekDates() {
  const dates = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(Utils.formatDate(d).full);
  }
  return dates;
}

function renderStats() {
  const weekDates = getWeekDates();
  renderHabitStats(weekDates);
  renderDietStats(weekDates);
  renderTodoStats(weekDates);
  renderMoodStats();
}

function renderHabitStats(dates) {
  if (!AppState.habits.length) {
    document.getElementById('habitRate').textContent = '0%';
    document.getElementById('habitStreak').textContent = '0 天';
    if (habitChart) habitChart.destroy();
    return;
  }
  
  let totalChecks = 0, totalPossible = AppState.habits.length * dates.length;
  let maxStreak = 0;
  
  AppState.habits.forEach(h => {
    let streak = h.streak || 0;
    maxStreak = Math.max(maxStreak, streak);
    dates.forEach(date => {
      if ((h.checkIns || []).includes(date)) totalChecks++;
    });
  });
  
  const rate = totalPossible > 0 ? Math.round((totalChecks / totalPossible) * 100) : 0;
  document.getElementById('habitRate').textContent = rate + '%';
  document.getElementById('habitStreak').textContent = maxStreak + ' 天';
  
  const ctx = document.getElementById('habitChart');
  if (!ctx) return;
  
  const data = dates.map(date => AppState.habits.filter(h => (h.checkIns || []).includes(date)).length);
  
  if (habitChart) habitChart.destroy();
  habitChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: dates.map(d => d.slice(5)), datasets: [{ data: data, backgroundColor: '#3b82f6', borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });
}

function renderDietStats(dates) {
  let totalCal = 0, days = 0;
  const mealData = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
  
  dates.forEach(date => {
    const diet = AppState.diet[date];
    if (diet) {
      const dayCal = (diet.breakfast?.calories || 0) + (diet.lunch?.calories || 0) + (diet.dinner?.calories || 0) + (diet.snack?.calories || 0);
      if (dayCal > 0) {
        totalCal += dayCal; days++;
        mealData.breakfast += diet.breakfast?.calories || 0;
        mealData.lunch += diet.lunch?.calories || 0;
        mealData.dinner += diet.dinner?.calories || 0;
        mealData.snack += diet.snack?.calories || 0;
      }
    }
  });
  
  document.getElementById('avgCalories').textContent = (days > 0 ? Math.round(totalCal / days) : 0) + ' 千卡';
  document.getElementById('dietDays').textContent = days + ' 天';
  
  const ctx = document.getElementById('dietChart');
  if (!ctx) return;
  
  if (dietChart) dietChart.destroy();
  dietChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: ['早餐', '午餐', '晚餐', '加餐'], datasets: [{ data: [mealData.breakfast, mealData.lunch, mealData.dinner, mealData.snack], backgroundColor: ['#fbbf24', '#3b82f6', '#8b5cf6', '#f472b6'] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } }
  });
}

function renderTodoStats(dates) {
  let completed = 0, total = 0;
  AppState.todos.forEach(t => { if (dates.includes(t.date)) { total++; if (t.completed) completed++; } });
  
  document.getElementById('todoRate').textContent = (total > 0 ? Math.round((completed / total) * 100) : 0) + '%';
  document.getElementById('todoCompleted').textContent = completed + ' 个';
  
  const ctx = document.getElementById('todoChart');
  if (!ctx) return;
  
  if (todoChart) todoChart.destroy();
  todoChart = new Chart(ctx, {
    type: 'pie',
    data: { labels: ['已完成', '未完成'], datasets: [{ data: [completed, total - completed], backgroundColor: ['#10b981', '#e5e7eb'] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}

function renderMoodStats() {
  const moodCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalMood = 0, count = 0;
  
  AppState.diaries.forEach(d => { if (d.mood) { moodCounts[d.mood]++; totalMood += d.mood; count++; } });
  
  document.getElementById('avgMood').textContent = Utils.getMoodEmoji(count > 0 ? Math.round(totalMood / count) : 3);
  document.getElementById('diaryCount').textContent = AppState.diaries.length + ' 篇';
  
  const ctx = document.getElementById('moodChart');
  if (!ctx) return;
  
  if (moodChart) moodChart.destroy();
  moodChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: ['😫', '😔', '😐', '😊', '😄'], datasets: [{ data: [moodCounts[1], moodCounts[2], moodCounts[3], moodCounts[4], moodCounts[5]], backgroundColor: ['#ef4444', '#f97316', '#94a3b8', '#3b82f6', '#10b981'], borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
  });
}

function renderTodos() {
  const container = document.getElementById('todoList');
  const date = document.getElementById('todoDate')?.value || Utils.formatDate(new Date()).full;
  const todos = AppState.todos.filter(t => t.date === date);
  if (!todos.length) { container.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px;">暂无待办</p>'; return; }
  container.innerHTML = todos.map(t => `
    <div class="todo-item ${t.completed?'completed':''}" data-id="${t.id}">
      <input type="checkbox" class="todo-checkbox" ${t.completed?'checked':''}>
      <span class="todo-text">${t.text}</span>
      <button class="todo-delete"><i class="fas fa-trash"></i></button>
    </div>
  `).join('');
  container.querySelectorAll('.todo-checkbox').forEach(cb => cb.addEventListener('change', e => toggleTodo(e.target.closest('.todo-item').dataset.id)));
  container.querySelectorAll('.todo-delete').forEach(btn => btn.addEventListener('click', e => deleteTodo(e.target.closest('.todo-item').dataset.id)));
}

function addTodo(text) {
  if (!text.trim()) return;
  const todo = { id: Utils.generateId(), text: text.trim(), date: document.getElementById('todoDate')?.value || Utils.formatDate(new Date()).full, completed: false, created_at: new Date().toISOString() };
  AppState.todos.unshift(todo); saveData(); renderTodos(); renderOverview(); renderReview();
}

function toggleTodo(id) {
  const todo = AppState.todos.find(t => t.id === id);
  if (todo) { todo.completed = !todo.completed; saveData(); renderTodos(); renderOverview(); renderReview(); }
}

function deleteTodo(id) { AppState.todos = AppState.todos.filter(t => t.id !== id); saveData(); renderTodos(); renderOverview(); renderReview(); }

function renderHabits() {
  const container = document.getElementById('habitList');
  const date = document.getElementById('habitDate')?.value || Utils.formatDate(new Date()).full;
  if (!AppState.habits.length) { container.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px;">还没有习惯</p>'; return; }
  container.innerHTML = AppState.habits.map(h => {
    const checked = (h.checkIns||[]).includes(date);
    return `
      <div class="habit-item" data-id="${h.id}">
        <div class="habit-info"><span class="habit-icon">${h.icon||'✨'}</span><div><span class="habit-name">${h.name}</span><span class="habit-streak">🔥 连续 ${h.streak||0} 天</span></div></div>
        <button class="habit-check ${checked?'checked':''}">${checked?'✓':'○'}</button>
      </div>
    `;
  }).join('');
  container.querySelectorAll('.habit-check').forEach(btn => btn.addEventListener('click', e => checkHabit(e.target.closest('.habit-item').dataset.id)));
}

function addHabit(name, icon) {
  if (!name.trim()) return;
  AppState.habits.push({ id: Utils.generateId(), name: name.trim(), icon: icon||'✨', checkIns: [], streak: 0 });
  saveData(); renderHabits(); renderOverview(); renderReview();
}

function checkHabit(id) {
  const habit = AppState.habits.find(h => h.id === id);
  if (!habit) return;
  const date = document.getElementById('habitDate')?.value || Utils.formatDate(new Date()).full;
  const idx = (habit.checkIns||[]).indexOf(date);
  if (idx === -1) { habit.checkIns.push(date); habit.streak = (habit.streak||0)+1; }
  else { habit.checkIns.splice(idx,1); habit.streak = Math.max(0,(habit.streak||0)-1); }
  saveData(); renderHabits(); renderOverview(); renderReview();
}

function loadDiet() {
  const date = document.getElementById('dietDate')?.value || Utils.formatDate(new Date()).full;
  const diet = AppState.diet[date] || { breakfast: {food:'',calories:0}, lunch: {food:'',calories:0}, dinner: {food:'',calories:0}, snack: {food:'',calories:0} };
  const set = (id,val) => { const el = document.getElementById(id); if(el) el.value = val; };
  set('breakfastInput', diet.breakfast?.food||''); set('breakfastCal', diet.breakfast?.calories||'');
  set('lunchInput', diet.lunch?.food||''); set('lunchCal', diet.lunch?.calories||'');
  set('dinnerInput', diet.dinner?.food||''); set('dinnerCal', diet.dinner?.calories||'');
  set('snackInput', diet.snack?.food||''); set('snackCal', diet.snack?.calories||'');
  updateTotalCal();
}

function updateTotalCal() {
  const get = id => parseInt(document.getElementById(id)?.value) || 0;
  document.getElementById('totalCalories').textContent = get('breakfastCal')+get('lunchCal')+get('dinnerCal')+get('snackCal');
}

function saveDiet() {
  const date = document.getElementById('dietDate')?.value || Utils.formatDate(new Date()).full;
  const get = id => document.getElementById(id)?.value || '';
  const getNum = id => parseInt(document.getElementById(id)?.value) || 0;
  AppState.diet[date] = { breakfast: {food:get('breakfastInput'),calories:getNum('breakfastCal')}, lunch: {food:get('lunchInput'),calories:getNum('lunchCal')}, dinner: {food:get('dinnerInput'),calories:getNum('dinnerCal')}, snack: {food:get('snackInput'),calories:getNum('snackCal')} };
  saveData(); document.getElementById('dietModal').classList.remove('active'); renderOverview(); renderReview(); alert('饮食记录已保存！');
}

function renderDiaryList() {
  const container = document.getElementById('diaryList');
  if (!AppState.diaries.length) { container.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:40px;">还没有日记</p>'; return; }
  container.innerHTML = AppState.diaries.map(d => {
    const date = Utils.formatDate(d.date);
    return `
      <div class="diary-item" data-id="${d.id}">
        <div class="diary-header-small"><span class="diary-date">${date.full}</span><span class="diary-mood">${Utils.getMoodEmoji(d.mood)}</span></div>
        <h4 class="diary-title">${d.title}</h4><p class="diary-preview">${d.content?.substring(0,100)||''}${d.content?.length>100?'...':''}</p>
      </div>
    `;
  }).join('');
  container.querySelectorAll('.diary-item').forEach(item => item.addEventListener('click', () => viewDiary(item.dataset.id)));
}

function viewDiary(id) {
  const d = AppState.diaries.find(x => x.id === id);
  if (!d) return;
  AppState.currentDiaryId = id;
  document.getElementById('viewDiaryTitle').textContent = d.title;
  document.getElementById('viewDiaryDate').textContent = Utils.formatDate(d.date).full;
  document.getElementById('viewDiaryMood').textContent = Utils.getMoodEmoji(d.mood);
  document.getElementById('viewDiaryText').textContent = d.content || '';
  document.getElementById('viewDiaryModal').classList.add('active');
}

function editDiary() {
  const d = AppState.diaries.find(x => x.id === AppState.currentDiaryId);
  if (!d) return;
  document.getElementById('viewDiaryModal').classList.remove('active');
  document.getElementById('diaryModal').classList.add('active');
  document.getElementById('diaryDate').value = d.date;
  document.getElementById('diaryTitle').value = d.title;
  document.getElementById('diaryContent').value = d.content || '';
  AppState.selectedDiaryMood = d.mood || 3;
  document.querySelectorAll('.diary-mood-btn').forEach(b => {
    b.classList.remove('active');
    if (parseInt(b.dataset.mood) === AppState.selectedDiaryMood) b.classList.add('active');
  });
}

function deleteDiary() {
  if (!AppState.currentDiaryId) return;
  if (confirm('确定要删除这篇日记吗？')) {
    AppState.diaries = AppState.diaries.filter(d => d.id !== AppState.currentDiaryId);
    saveData();
    document.getElementById('viewDiaryModal').classList.remove('active');
    if (AppState.currentPage === 'diary') renderDiaryList();
    renderOverview(); renderReview();
    alert('日记已删除');
  }
}

function saveDiary() {
  const title = document.getElementById('diaryTitle')?.value?.trim();
  const content = document.getElementById('diaryContent')?.value?.trim();
  const date = document.getElementById('diaryDate')?.value || Utils.formatDate(new Date()).full;
  if (!title && !content) { alert('请填写标题或内容'); return; }
  
  if (AppState.currentDiaryId) {
    // 更新现有日记
    const index = AppState.diaries.findIndex(d => d.id === AppState.currentDiaryId);
    if (index !== -1) {
      AppState.diaries[index] = {
        ...AppState.diaries[index],
        title: title || '无标题',
        content: content || '',
        date,
        mood: AppState.selectedDiaryMood || 3,
        updated_at: new Date().toISOString()
      };
      AppState.currentDiaryId = null;
    }
  } else {
    // 新建日记
    const diary = { id: Utils.generateId(), title: title || '无标题', content: content || '', date, mood: AppState.selectedDiaryMood || 3, created_at: new Date().toISOString() };
    AppState.diaries.unshift(diary);
  }
  
  saveData();
  document.getElementById('diaryModal').classList.remove('active');
  document.getElementById('diaryTitle').value = '';
  document.getElementById('diaryContent').value = '';
  if (AppState.currentPage === 'diary') renderDiaryList();
  renderOverview(); renderReview();
  alert(AppState.currentDiaryId ? '日记更新成功！' : '日记保存成功！');
}

function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const title = document.getElementById('calendarTitle');
  const date = AppState.currentDate;
  const year = date.getFullYear(), month = date.getMonth();
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  title.textContent = `${year}年 ${months[month]}`;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  let html = '';
  ['日','一','二','三','四','五','六'].forEach(d => html += `<div class="calendar-weekday">${d}</div>`);
  for (let i=0; i<firstDay; i++) html += `<div class="calendar-day empty"></div>`;
  const today = Utils.formatDate(new Date()).full;
  for (let day=1; day<=daysInMonth; day++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday = dateStr === today;
    const hasEvent = AppState.events.some(e => e.date === dateStr) || AppState.diaries.some(d => d.date === dateStr);
    html += `<div class="calendar-day ${isToday?'today':''} ${hasEvent?'has-event':''}" data-date="${dateStr}">${day}</div>`;
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.calendar-day:not(.empty)').forEach(el => el.addEventListener('click', () => { document.getElementById('calendarDatePicker').value = el.dataset.date; renderDayEvents(); }));
}

function renderDayEvents() {
  const container = document.getElementById('eventListCalendar');
  const title = document.getElementById('selectedDateTitle');
  const date = document.getElementById('calendarDatePicker')?.value || Utils.formatDate(new Date()).full;
  title.textContent = date;
  const events = AppState.events.filter(e => e.date === date);
  const diary = AppState.diaries.find(d => d.date === date);
  let html = '';
  if (events.length) { html += `<div><h4>📅 行程 (${events.length})</h4><ul>`; html += events.map(e => `<li>${e.time||'全天'} - ${e.title}</li>`).join(''); html += '</ul></div>'; }
  if (diary) { html += `<div><h4>📖 日记</h4><p><strong>${diary.title}</strong></p></div>`; }
  container.innerHTML = html || '<p style="text-align:center;color:#94a3b8;">这一天还没有记录</p>';
}

function saveEvent() {
  const title = document.getElementById('newEventTitle')?.value?.trim();
  const date = document.getElementById('newEventDate')?.value;
  const time = document.getElementById('newEventTime')?.value;
  if (!title) { alert('请输入行程标题'); return; }
  AppState.events.push({ id: Utils.generateId(), title, date: date||Utils.formatDate(new Date()).full, time: time||'', type: document.getElementById('newEventType')?.value||'other', created_at: new Date().toISOString() });
  saveData(); document.getElementById('addEventModal').classList.remove('active'); document.getElementById('newEventTitle').value = '';
  renderDayEvents(); renderCalendar(); renderOverview(); renderReview(); alert('行程添加成功！');
}

function exportData() {
  const data = { ...AppState, exportDate: new Date().toISOString(), version: '1.0' };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `dayflow-backup-${Utils.formatDate(new Date()).full}.json`; a.click(); URL.revokeObjectURL(url);
  alert('数据已导出！');
}

function importData(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = event => {
    try {
      const data = JSON.parse(event.target.result);
      if (confirm('确定导入？这将覆盖当前数据')) {
        AppState.todos = data.todos || []; AppState.habits = data.habits || []; AppState.diet = data.diet || {};
        AppState.events = data.events || []; AppState.diaries = data.diaries || [];
        saveData(); location.reload();
      }
    } catch(err) { alert('导入失败：文件格式错误'); }
  };
  reader.readAsText(file); e.target.value = '';
}

function clearData() {
  if (confirm('警告：这将删除所有数据！') && confirm('再次确认：无法恢复！')) {
    AppState.todos = []; AppState.habits = []; AppState.diet = {}; AppState.events = []; AppState.diaries = [];
    saveData(); location.reload();
  }
}

// Pomodoro
let timerInterval = null, timeLeft = 25*60, duration = 25, running = false;
function updateTimer() {
  const m = Math.floor(timeLeft/60), s = timeLeft%60;
  document.getElementById('timerMinutes').textContent = String(m).padStart(2,'0');
  document.getElementById('timerSeconds').textContent = String(s).padStart(2,'0');
}
function toggleTimer() {
  const btn = document.getElementById('timerToggle');
  if (running) { clearInterval(timerInterval); running = false; btn.innerHTML = '<i class="fas fa-play"></i> 开始'; }
  else { running = true; btn.innerHTML = '<i class="fas fa-pause"></i> 暂停'; timerInterval = setInterval(() => { timeLeft--; updateTimer(); if (timeLeft <= 0) { clearInterval(timerInterval); running = false; alert('番茄钟完成！'); btn.innerHTML = '<i class="fas fa-play"></i> 开始'; } }, 1000); }
}
function resetTimer() { clearInterval(timerInterval); running = false; timeLeft = duration*60; updateTimer(); document.getElementById('timerToggle').innerHTML = '<i class="fas fa-play"></i> 开始'; }

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
  await initSupabase(); loadData(); initToday();
  
  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
  
  // Quick actions
  document.getElementById('todoBtn')?.addEventListener('click', () => { document.getElementById('todoModal').classList.add('active'); document.getElementById('todoDate').value = Utils.formatDate(new Date()).full; renderTodos(); });
  document.getElementById('habitBtn')?.addEventListener('click', () => { document.getElementById('habitModal').classList.add('active'); document.getElementById('habitDate').value = Utils.formatDate(new Date()).full; renderHabits(); });
  document.getElementById('dietBtn')?.addEventListener('click', () => { document.getElementById('dietModal').classList.add('active'); document.getElementById('dietDate').value = Utils.formatDate(new Date()).full; loadDiet(); });
  document.getElementById('pomodoroBtn')?.addEventListener('click', () => document.getElementById('pomodoroModal').classList.add('active'));
  
  // Close modals
  document.getElementById('closeTodo')?.addEventListener('click', () => document.getElementById('todoModal').classList.remove('active'));
  document.getElementById('closeHabit')?.addEventListener('click', () => document.getElementById('habitModal').classList.remove('active'));
  document.getElementById('closeDiet')?.addEventListener('click', () => document.getElementById('dietModal').classList.remove('active'));
  document.getElementById('closePomodoro')?.addEventListener('click', () => document.getElementById('pomodoroModal').classList.remove('active'));
  document.getElementById('closeDiaryModal')?.addEventListener('click', () => document.getElementById('diaryModal').classList.remove('active'));
  document.getElementById('closeViewDiary')?.addEventListener('click', () => { document.getElementById('viewDiaryModal').classList.remove('active'); AppState.currentDiaryId = null; });
  document.getElementById('editDiaryBtn')?.addEventListener('click', editDiary);
  document.getElementById('deleteDiaryBtn')?.addEventListener('click', deleteDiary);
  document.getElementById('closeAddEvent')?.addEventListener('click', () => document.getElementById('addEventModal').classList.remove('active'));
  document.getElementById('closeSettings')?.addEventListener('click', () => document.getElementById('settingsModal').classList.remove('active'));
  
  // Actions
  document.getElementById('addTodoBtn')?.addEventListener('click', () => { addTodo(document.getElementById('todoInput').value); document.getElementById('todoInput').value = ''; });
  document.getElementById('addHabitBtn')?.addEventListener('click', () => { addHabit(document.getElementById('habitInput').value, document.getElementById('habitIcon').value); document.getElementById('habitInput').value = ''; });
  document.getElementById('saveDiet')?.addEventListener('click', saveDiet);
  document.getElementById('addDiaryBtn')?.addEventListener('click', () => { AppState.currentDiaryId = null; document.getElementById('diaryModal').classList.add('active'); document.getElementById('diaryDate').value = Utils.formatDate(new Date()).full; document.getElementById('diaryTitle').value = ''; document.getElementById('diaryContent').value = ''; });
  document.getElementById('saveDiaryBtn')?.addEventListener('click', saveDiary);
  document.getElementById('addEventFromCalendar')?.addEventListener('click', () => { document.getElementById('addEventModal').classList.add('active'); document.getElementById('newEventDate').value = document.getElementById('calendarDatePicker').value || Utils.formatDate(new Date()).full; });
  document.getElementById('saveNewEvent')?.addEventListener('click', saveEvent);
  document.getElementById('settingsBtn')?.addEventListener('click', () => document.getElementById('settingsModal').classList.add('active'));
  
  // Calendar
  document.getElementById('prevMonth')?.addEventListener('click', () => { AppState.currentDate.setMonth(AppState.currentDate.getMonth()-1); renderCalendar(); });
  document.getElementById('nextMonth')?.addEventListener('click', () => { AppState.currentDate.setMonth(AppState.currentDate.getMonth()+1); renderCalendar(); });
  
  // Settings
  document.getElementById('exportData')?.addEventListener('click', exportData);
  document.getElementById('importData')?.addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile')?.addEventListener('change', importData);
  document.getElementById('clearData')?.addEventListener('click', clearData);
  
  // Diary mood
  document.querySelectorAll('.diary-mood-btn').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('.diary-mood-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); AppState.selectedDiaryMood = parseInt(btn.dataset.mood); }));
  
  // Pomodoro
  document.getElementById('timerToggle')?.addEventListener('click', toggleTimer);
  document.getElementById('timerReset')?.addEventListener('click', resetTimer);
  document.querySelectorAll('.duration-btn').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); duration = parseInt(btn.dataset.duration); resetTimer(); }));
  
  // Overview clicks
  document.getElementById('overviewTodos')?.addEventListener('click', () => document.getElementById('todoBtn').click());
  document.getElementById('overviewHabits')?.addEventListener('click', () => document.getElementById('habitBtn').click());
  document.getElementById('overviewDiet')?.addEventListener('click', () => document.getElementById('dietBtn').click());
  document.getElementById('overviewEvents')?.addEventListener('click', () => showPage('calendar'));
  
  // Diet calories
  ['breakfastCal','lunchCal','dinnerCal','snackCal'].forEach(id => document.getElementById(id)?.addEventListener('input', updateTotalCal));
  
  // Date changes
  document.getElementById('todoDate')?.addEventListener('change', renderTodos);
  document.getElementById('habitDate')?.addEventListener('change', renderHabits);
  document.getElementById('dietDate')?.addEventListener('change', loadDiet);
  
  // Stats period selector
  document.querySelectorAll('.period-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderStats();
  }));
  
  console.log('DayFlow initialized');
});
