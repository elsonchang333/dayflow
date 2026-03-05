// DayFlow App - Complete Version with Expense Tracking
// Features: Todos, Habits, Diet, Events, Diary, Expenses
// Sync: localStorage + Supabase Cloud

const SUPABASE_URL = 'https://xucrjpvmqpcrthlvrnxg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1Y3JqcHZtcXBjcnRobHZybnhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NTY0ODcsImV4cCI6MjA4NzAzMjQ4N30.5hcHWVHlx1feMIbgm7jvnFWwxxS5WKmBI1g5W8L5p9E';

let supabaseClient = null;

// App State
const AppState = {
  currentPage: 'today',
  habits: [], 
  todos: [], 
  diets: [], 
  events: [], 
  diaries: [],
  expenses: [], // 记账数据数组
  currentDate: new Date(), 
  todoFilter: 'all', 
  selectedDiaryMood: 3,
  currentDiaryId: null,
  currentUser: null,
  statsDates: null
};

// Utility Functions
const Utils = {
  formatDate(date) {
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
  },
  generateId() { 
    return Date.now().toString(36) + Math.random().toString(36).substr(2,9); 
  },
  getMoodEmoji(mood) { 
    const emojis = ['😫','😔','😐','😊','😄']; 
    return emojis[(mood||3)-1] || '😐'; 
  },
  // 格式化金额显示
  formatCurrency(amount) {
    return '¥' + parseFloat(amount).toFixed(2);
  },
  // 获取今天的日期字符串
  getTodayString() {
    return this.formatDate(new Date()).full;
  }
};

// Local Database
const LocalDB = {
  get(key) { 
    const d = localStorage.getItem(`dayflow_${key}`); 
    return d ? JSON.parse(d) : null; 
  },
  set(key, val) { 
    localStorage.setItem(`dayflow_${key}`, JSON.stringify(val)); 
  },
  remove(key) {
    localStorage.removeItem(`dayflow_${key}`);
  }
};

// Initialize Supabase
function initSupabase() {
  if (typeof supabase !== 'undefined') {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase initialized');
  } else {
    console.log('⚠️ Supabase library not loaded');
  }
}

// ==================== DATA LOADING & SAVING ====================

// Load all data from localStorage
function loadData() {
  AppState.todos = LocalDB.get('todos') || [];
  AppState.habits = LocalDB.get('habits') || [];
  AppState.diets = LocalDB.get('diets') || [];
  AppState.events = LocalDB.get('events') || [];
  AppState.diaries = LocalDB.get('diaries') || [];
  AppState.expenses = LocalDB.get('expenses') || []; // 加载记账数据
  AppState.currentUser = LocalDB.get('user');
}

// Save all data to localStorage
function saveAllData() {
  LocalDB.set('todos', AppState.todos);
  LocalDB.set('habits', AppState.habits);
  LocalDB.set('diets', AppState.diets);
  LocalDB.set('events', AppState.events);
  LocalDB.set('diaries', AppState.diaries);
  LocalDB.set('expenses', AppState.expenses); // 保存记账数据
  console.log('💾 Saved to localStorage');
}

// ==================== CLOUD SYNC ====================

// Sync data to cloud (Supabase)
async function syncToCloud() {
  if (!supabaseClient || !AppState.currentUser) {
    console.log('⚠️ Cannot sync: not logged in or no supabase');
    return false;
  }

  try {
    const userId = AppState.currentUser.id;
    const timestamp = Date.now();

    // Prepare data with timestamps
    const dataToSync = {
      user_id: userId,
      todos: AppState.todos.map(t => ({...t, updated_at: t.updated_at || timestamp})),
      habits: AppState.habits.map(h => ({...h, updated_at: h.updated_at || timestamp})),
      diets: AppState.diets.map(d => ({...d, updated_at: d.updated_at || timestamp})),
      events: AppState.events.map(e => ({...e, updated_at: e.updated_at || timestamp})),
      diaries: AppState.diaries.map(d => ({...d, updated_at: d.updated_at || timestamp})),
      expenses: AppState.expenses.map(e => ({...e, updated_at: e.updated_at || timestamp})), // 同步记账数据
      last_sync: new Date().toISOString()
    };

    // Upsert to sync_data table
    const { error } = await supabaseClient
      .from('sync_data')
      .upsert(dataToSync, { onConflict: 'user_id' });

    if (error) throw error;

    console.log('✅ Synced to cloud');
    showToast('已同步到云端');
    return true;
  } catch (e) {
    console.error('❌ Sync failed:', e);
    showToast('同步失败: ' + e.message);
    return false;
  }
}

// Load data from cloud
async function loadCloudData() {
  if (!supabaseClient || !AppState.currentUser) {
    console.log('⚠️ Cannot load cloud: not logged in');
    return false;
  }

  try {
    const { data, error } = await supabaseClient
      .from('sync_data')
      .select('*')
      .eq('user_id', AppState.currentUser.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.log('ℹ️ No cloud data found');
        return true;
      }
      throw error;
    }

    if (data) {
      // Merge cloud data with local (timestamp-based)
      AppState.todos = mergeByTimestamp(AppState.todos, data.todos || []);
      AppState.habits = mergeByTimestamp(AppState.habits, data.habits || []);
      AppState.diets = mergeByTimestamp(AppState.diets, data.diets || []);
      AppState.events = mergeByTimestamp(AppState.events, data.events || []);
      AppState.diaries = mergeByTimestamp(AppState.diaries, data.diaries || []);
      AppState.expenses = mergeByTimestamp(AppState.expenses, data.expenses || []); // 合并记账数据

      saveAllData();
      console.log('✅ Loaded from cloud');
      showToast('已从云端加载');
      renderAll();
      return true;
    }
  } catch (e) {
    console.error('❌ Load cloud failed:', e);
    showToast('加载云端数据失败');
    return false;
  }
}

// Merge arrays by timestamp (last-write-wins)
function mergeByTimestamp(localItems, cloudItems) {
  const merged = {};
  const now = Date.now();

  // Process local items
  (localItems || []).forEach(item => {
    if (!item.id) return;
    merged[item.id] = {
      ...item,
      updated_at: item.updated_at || now
    };
  });

  // Process cloud items (overwrite if newer)
  (cloudItems || []).forEach(item => {
    if (!item.id) return;
    const existing = merged[item.id];
    const cloudTime = item.updated_at || now;

    if (!existing || cloudTime > existing.updated_at) {
      merged[item.id] = item;
    }
  });

  return Object.values(merged);
}

// ==================== EXPORT & IMPORT ====================

// Export all data as JSON file
function exportData() {
  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    todos: AppState.todos,
    habits: AppState.habits,
    diets: AppState.diets,
    events: AppState.events,
    diaries: AppState.diaries,
    expenses: AppState.expenses // 导出记账数据
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dayflow-backup-${Utils.getTodayString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('数据已导出');
}

// Import data from JSON file
function importData(jsonString) {
  try {
    const data = JSON.parse(jsonString);

    // Validate
    if (!data.todos || !data.habits) {
      throw new Error('Invalid backup file');
    }

    // Confirm
    if (!confirm('导入数据将覆盖现有数据，确定继续？')) return false;

    // Import
    AppState.todos = data.todos || [];
    AppState.habits = data.habits || [];
    AppState.diets = data.diets || [];
    AppState.events = data.events || [];
    AppState.diaries = data.diaries || [];
    AppState.expenses = data.expenses || []; // 导入记账数据

    saveAllData();
    renderAll();
    showToast('数据导入成功');
    return true;
  } catch (e) {
    showToast('导入失败: ' + e.message);
    return false;
  }
}

// Clear all data
function clearAllData() {
  if (!confirm('确定要清空所有数据？此操作不可恢复！')) return;

  AppState.todos = [];
  AppState.habits = [];
  AppState.diets = [];
  AppState.events = [];
  AppState.diaries = [];
  AppState.expenses = []; // 清空记账数据

  saveAllData();
  renderAll();
  showToast('所有数据已清空');
}

// ==================== EXPENSE FUNCTIONS (记账功能) ====================

// 支出分类
const EXPENSE_CATEGORIES = [
  { id: 'food', name: '餐饮', icon: '🍽️' },
  { id: 'transport', name: '交通', icon: '🚗' },
  { id: 'shopping', name: '购物', icon: '🛍️' },
  { id: 'entertainment', name: '娱乐', icon: '🎮' },
  { id: 'housing', name: '居住', icon: '🏠' },
  { id: 'medical', name: '医疗', icon: '💊' },
  { id: 'education', name: '教育', icon: '📚' },
  { id: 'other', name: '其他', icon: '📦' }
];

// 添加支出记录
function addExpense(amount, category, note = '', date = null) {
  if (!amount || amount <= 0) {
    showToast('请输入有效金额');
    return null;
  }

  const expenseDate = date || Utils.getTodayString();
  const timestamp = Date.now();

  const expense = {
    id: Utils.generateId(),
    amount: parseFloat(amount),
    category: category || 'other',
    note: note.trim(),
    date: expenseDate,
    created_at: timestamp,
    updated_at: timestamp
  };

  AppState.expenses.unshift(expense);
  saveAllData();
  
  // 同步到云端
  if (navigator.onLine && AppState.currentUser) {
    syncToCloud();
  }

  renderExpenseList();
  renderOverview();
  showToast('记账成功');
  return expense;
}

// 删除支出记录
function deleteExpense(id) {
  if (!confirm('确定删除这条记录？')) return false;

  const index = AppState.expenses.findIndex(e => e.id === id);
  if (index === -1) {
    showToast('记录不存在');
    return false;
  }

  AppState.expenses.splice(index, 1);
  saveAllData();

  // 同步到云端
  if (navigator.onLine && AppState.currentUser) {
    syncToCloud();
  }

  renderExpenseList();
  renderOverview();
  showToast('已删除');
  return true;
}

// 获取今日支出
function getTodayExpenses() {
  const today = Utils.getTodayString();
  return AppState.expenses.filter(e => e.date === today);
}

// 获取今日支出总额
function getTodayExpenseTotal() {
  const todayExpenses = getTodayExpenses();
  return todayExpenses.reduce((sum, e) => sum + e.amount, 0);
}

// 获取本月支出统计
function getMonthlyExpenseStats(year, month) {
  const targetMonth = `${year}-${String(month).padStart(2, '0')}`;
  const monthlyExpenses = AppState.expenses.filter(e => e.date.startsWith(targetMonth));
  
  const total = monthlyExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  // 按分类统计
  const byCategory = {};
  monthlyExpenses.forEach(e => {
    if (!byCategory[e.category]) {
      byCategory[e.category] = 0;
    }
    byCategory[e.category] += e.amount;
  });

  return { total, byCategory, count: monthlyExpenses.length };
}

// 打开记账 Modal
function openExpenseModal() {
  const modal = document.getElementById('expenseModal');
  if (!modal) return;

  // 重置表单
  document.getElementById('expenseAmount').value = '';
  document.getElementById('expenseNote').value = '';
  document.getElementById('expenseDate').value = Utils.getTodayString();
  
  // 重置分类选择
  document.querySelectorAll('.expense-category-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  modal.classList.add('active');
}

// 关闭记账 Modal
function closeExpenseModal() {
  const modal = document.getElementById('expenseModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// 保存记账（从 Modal）
function saveExpenseFromModal() {
  const amount = parseFloat(document.getElementById('expenseAmount').value);
  const category = document.getElementById('expenseCategory').value;
  const note = document.getElementById('expenseNote').value;
  const date = document.getElementById('expenseDate').value;

  if (!amount || amount <= 0) {
    showToast('请输入有效金额');
    return;
  }

  addExpense(amount, category, note, date);
  closeExpenseModal();
}

// 渲染记账列表
function renderExpenseList() {
  const container = document.getElementById('expenseList');
  const todayTotalEl = document.getElementById('todayExpenseTotal');
  const expenseCountEl = document.getElementById('expenseCount');
  
  if (!container) return;

  const todayExpenses = getTodayExpenses();
  const todayTotal = getTodayExpenseTotal();

  // 更新今日总额显示
  if (todayTotalEl) {
    todayTotalEl.textContent = Utils.formatCurrency(todayTotal);
  }
  if (expenseCountEl) {
    expenseCountEl.textContent = `${todayExpenses.length}笔`;
  }

  // 渲染列表
  if (todayExpenses.length === 0) {
    container.innerHTML = '<div class="expense-empty">今天还没有记账记录</div>';
    return;
  }

  // 按时间倒序排列
  const sorted = [...todayExpenses].sort((a, b) => b.created_at - a.created_at);

  container.innerHTML = sorted.map(expense => {
    const category = EXPENSE_CATEGORIES.find(c => c.id === expense.category) || EXPENSE_CATEGORIES[7];
    return `
      <div class="expense-item" data-id="${expense.id}">
        <div class="expense-icon">${category.icon}</div>
        <div class="expense-info">
          <div class="expense-category-name">${category.name}</div>
          ${expense.note ? `<div class="expense-note">${expense.note}</div>` : ''}
        </div>
        <div class="expense-amount">${Utils.formatCurrency(expense.amount)}</div>
        <button class="expense-delete" onclick="deleteExpense('${expense.id}')" title="删除">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `;
  }).join('');
}

// ==================== RENDER FUNCTIONS ====================

// Render overview cards
function renderOverview() {
  const currentDate = Utils.formatDate(AppState.currentDate).full;

  // Todos
  const todos = AppState.todos.filter(t => t.date === currentDate);
  const completed = todos.filter(t => t.completed).length;
  const todoEl = document.querySelector('#overviewTodos .overview-count');
  if (todoEl) todoEl.textContent = `${completed}/${todos.length}`;

  // Habits
  const checked = AppState.habits.filter(h => (h.checkIns || []).includes(currentDate)).length;
  const habitEl = document.querySelector('#overviewHabits .overview-count');
  if (habitEl) habitEl.textContent = `${checked}/${AppState.habits.length}`;

  // Diet
  const diet = AppState.diets.find(d => d.date === currentDate);
  let cal = 0;
  if (diet) {
    cal = (diet.breakfastCal || 0) + (diet.lunchCal || 0) + 
          (diet.dinnerCal || 0) + (diet.snackCal || 0);
  }
  const dietEl = document.querySelector('#overviewDiet .overview-count');
  if (dietEl) dietEl.textContent = cal;

  // Events
  const events = AppState.events.filter(e => e.date === currentDate).length;
  const eventEl = document.querySelector('#overviewEvents .overview-count');
  if (eventEl) eventEl.textContent = events;

  // Expenses (新增)
  const todayTotal = getTodayExpenseTotal();
  const expenseEl = document.querySelector('#overviewExpenses .overview-count');
  if (expenseEl) expenseEl.textContent = Utils.formatCurrency(todayTotal);
}

// Render review section
function renderReview() {
  const container = document.getElementById('reviewContent');
  if (!container) return;

  const currentDate = Utils.formatDate(AppState.currentDate).full;
  let html = '';

  // Completed todos
  const completedTodos = AppState.todos.filter(t => t.date === currentDate && t.completed);
  if (completedTodos.length) {
    html += `<div class="review-section"><h4>✅ 完成的待办 (${completedTodos.length})</h4><ul>`;
    html += completedTodos.map(t => `<li>${t.text}</li>`).join('');
    html += '</ul></div>';
  }

  // Checked habits
  const checkedHabits = AppState.habits.filter(h => (h.checkIns || []).includes(currentDate));
  if (checkedHabits.length) {
    html += `<div class="review-section"><h4>🎯 打卡的习惯 (${checkedHabits.length})</h4><ul>`;
    html += checkedHabits.map(h => `<li>${h.icon || '✨'} ${h.name}</li>`).join('');
    html += '</ul></div>';
  }

  // Diet
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

  // Expenses (新增)
  const todayExpenses = getTodayExpenses();
  if (todayExpenses.length) {
    html += `<div class="review-section"><h4>💰 今日支出 (${todayExpenses.length}笔)</h4><ul>`;
    html += todayExpenses.map(e => {
      const category = EXPENSE_CATEGORIES.find(c => c.id === e.category) || EXPENSE_CATEGORIES[7];
      return `<li>${category.icon} ${category.name}: ${Utils.formatCurrency(e.amount)}${e.note ? ` (${e.note})` : ''}</li>`;
    }).join('');
    html += '</ul></div>';
  }

  container.innerHTML = html || '<div class="review-empty">今天还没有记录任何内容，开始记录吧！</div>';
}

// Render all
function renderAll() {
  renderOverview();
  renderReview();
  renderExpenseList();
}

// ==================== UTILITY UI FUNCTIONS ====================

// Show toast notification
function showToast(message) {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  } else {
    alert(message);
  }
}

// ==================== DIET FUNCTIONS ====================

function saveDiet() {
  const date = document.getElementById('dietDate')?.value || Utils.formatDate(new Date()).full;
  const getVal = id => document.getElementById(id)?.value?.trim() || '';
  const getNum = id => parseInt(document.getElementById(id)?.value) || 0;

  const existingIndex = AppState.diets.findIndex(d => d.date === date);
  const timestamp = Date.now();

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
    created_at: existingIndex >= 0 ? AppState.diets[existingIndex].created_at : timestamp,
    updated_at: timestamp
  };

  if (existingIndex >= 0) {
    AppState.diets[existingIndex] = dietData;
  } else {
    AppState.diets.unshift(dietData);
  }

  saveAllData();
  
  if (navigator.onLine && AppState.currentUser) {
    syncToCloud();
  }

  document.getElementById('dietModal').classList.remove('active');
  renderOverview();
  renderReview();
  showToast('饮食记录已保存');
}

// ==================== INITIALIZATION ====================

function initToday() {
  AppState.currentDate = new Date();
  const today = Utils.formatDate(AppState.currentDate);
  
  const dateEl = document.getElementById('currentDate');
  const weekdayEl = document.getElementById('currentWeekday');
  
  if (dateEl) dateEl.textContent = `${today.month}${today.date}日`;
  if (weekdayEl) weekdayEl.textContent = today.weekday;
}

function initEventListeners() {
  // Diet modal
  document.getElementById('dietBtn')?.addEventListener('click', () => {
    document.getElementById('dietModal').classList.add('active');
    const dietDate = document.getElementById('dietDate');
    if (dietDate) dietDate.value = Utils.formatDate(new Date()).full;
  });

  document.getElementById('saveDiet')?.addEventListener('click', saveDiet);
  document.getElementById('closeDiet')?.addEventListener('click', () => {
    document.getElementById('dietModal').classList.remove('active');
  });

  // Expense modal (新增)
  document.getElementById('expenseBtn')?.addEventListener('click', openExpenseModal);
  document.getElementById('saveExpense')?.addEventListener('click', saveExpenseFromModal);
  document.getElementById('closeExpense')?.addEventListener('click', closeExpenseModal);
  document.getElementById('cancelExpense')?.addEventListener('click', closeExpenseModal);

  // Category selection in expense modal
  document.querySelectorAll('.expense-category-item').forEach(item => {
    item.addEventListener('click', function() {
      document.querySelectorAll('.expense-category-item').forEach(i => i.classList.remove('selected'));
      this.classList.add('selected');
      document.getElementById('expenseCategory').value = this.dataset.category;
    });
  });

  // Network status
  window.addEventListener('online', () => {
    console.log('🌐 网络已连接');
    showToast('网络已连接');
    if (AppState.currentUser) {
      syncToCloud();
    }
  });

  window.addEventListener('offline', () => {
    console.log('📴 网络已断开');
    showToast('进入离线模式');
  });
}

// Main initialization
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  loadData();
  initToday();
  initEventListeners();
  renderAll();

  console.log('✅ DayFlow initialized with Expense Tracking');
});
