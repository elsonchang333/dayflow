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
// ==================== AI INSIGHT FUNCTIONS ====================

const AI_CONFIG = {
  EMOTION_KEYWORDS: {
    positive: ['开心', '快乐', '满足', '充实', '兴奋', '期待', '感谢', '幸福', '舒服', '棒', '好', '成功', '完成', '赢', '进步'],
    negative: ['焦虑', '压力', '累', '疲惫', '难过', '失望', '担心', '紧张', '烦躁', '生气', '无聊', '孤独', '郁闷', '痛苦', '失败'],
    neutral: ['平淡', '普通', '一般', '正常', '还行', '可以', '继续', '保持']
  },
  EMOTION_WEIGHTS: {
    diary: 0.4,
    tasks: 0.25,
    habits: 0.2,
    expenses: 0.1,
    pomodoro: 0.05
  }
};

function analyzeDiaryEmotion(content) {
  const { EMOTION_KEYWORDS } = AI_CONFIG;
  const text = content.toLowerCase();
  
  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  const foundKeywords = [];
  
  EMOTION_KEYWORDS.positive.forEach(word => {
    if (text.includes(word)) {
      positiveCount++;
      foundKeywords.push(word);
    }
  });
  
  EMOTION_KEYWORDS.negative.forEach(word => {
    if (text.includes(word)) {
      negativeCount++;
      foundKeywords.push(word);
    }
  });
  
  EMOTION_KEYWORDS.neutral.forEach(word => {
    if (text.includes(word)) {
      neutralCount++;
      foundKeywords.push(word);
    }
  });
  
  const total = positiveCount + negativeCount + neutralCount || 1;
  const positiveRatio = positiveCount / total;
  const negativeRatio = negativeCount / total;
  const score = Math.round(50 + (positiveRatio - negativeRatio) * 50);
  
  let primaryEmotion = '平静';
  if (score >= 80) primaryEmotion = '非常开心';
  else if (score >= 65) primaryEmotion = '开心';
  else if (score >= 55) primaryEmotion = '满足';
  else if (score >= 45) primaryEmotion = '平淡';
  else if (score >= 35) primaryEmotion = '有点累';
  else if (score >= 25) primaryEmotion = '焦虑';
  else primaryEmotion = '压力大';
  
  return {
    score: Math.max(0, Math.min(100, score)),
    primaryEmotion,
    emotions: {
      positive: parseFloat(positiveRatio.toFixed(2)),
      negative: parseFloat(negativeRatio.toFixed(2)),
      neutral: parseFloat((neutralCount / total).toFixed(2))
    },
    keywords: [...new Set(foundKeywords)],
    confidence: Math.min(1, total * 0.2)
  };
}

function generateWeeklyReport() {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);
  
  const weekDiaries = AppState.diaries.filter(d => {
    const dDate = new Date(d.date);
    return dDate >= weekStart && dDate <= today;
  });
  
  const weekTodos = AppState.todos.filter(t => {
    const tDate = new Date(t.date);
    return tDate >= weekStart && tDate <= today;
  });
  
  const completedTodos = weekTodos.filter(t => t.completed).length;
  const taskRate = weekTodos.length > 0 ? completedTodos / weekTodos.length : 0;
  
  const diaryAnalyses = weekDiaries.map(d => analyzeDiaryEmotion(d.content));
  const avgMoodScore = diaryAnalyses.length > 0
    ? diaryAnalyses.reduce((sum, a) => sum + a.score, 0) / diaryAnalyses.length
    : 50;
  
  const insights = [];
  if (taskRate >= 0.7) insights.push('任务完成率很高，效率满满！');
  if (taskRate <= 0.3 && weekTodos.length > 0) insights.push('任务完成较少，试着分解大任务。');
  if (avgMoodScore >= 70) insights.push('这周整体心情很好！');
  if (avgMoodScore <= 45) insights.push('这周有点辛苦，记得对自己好一点。');
  
  const achievements = [];
  if (completedTodos >= 15) achievements.push('✅ 任务收割机');
  if (weekDiaries.length >= 5) achievements.push('📝 记录狂魔');
  
  return {
    avgScore: Math.round(avgMoodScore),
    taskCompleted: completedTodos,
    taskTotal: weekTodos.length,
    diaryCount: weekDiaries.length,
    insights: insights.length > 0 ? insights : ['继续记录，见证自己的成长。'],
    achievements: achievements,
    aiComment: avgMoodScore >= 60 ? '这周表现不错，继续保持！' : '下周会更好，加油！'
  };
}

function renderAIInsight() {
  const report = generateWeeklyReport();
  const container = document.getElementById('weekly-report-content');
  
  if (!container) return;
  
  container.innerHTML = `
    <div class="ai-report-card">
      <div style="display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 20px;">
        <div class="ai-score-circle">
          <div class="ai-score-value">${report.avgScore}</div>
          <div class="ai-score-label">心情指数</div>
        </div>
      </div>
      
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 20px;">
        <div style="text-align: center; padding: 12px; background: #f8fafc; border-radius: 12px;">
          <div style="font-size: 24px; font-weight: 700; color: #6366f1;">${report.taskCompleted}</div>
          <div style="font-size: 12px; color: #64748b;">完成任务</div>
        </div>
        <div style="text-align: center; padding: 12px; background: #f8fafc; border-radius: 12px;">
          <div style="font-size: 24px; font-weight: 700; color: #10b981;">${report.diaryCount}</div>
          <div style="font-size: 12px; color: #64748b;">写日记</div>
        </div>
      </div>
    </div>
    
    <div class="ai-comment-card">
      <div class="ai-comment-title"><i class="fas fa-magic"></i> AI 评语</div>
      <div class="ai-comment-text">${report.aiComment}</div>
    </div>
    
    <div class="ai-report-card">
      <div class="overview-title" style="margin-bottom: 16px;">💡 本周洞察</div>
      ${report.insights.map(i => `
        <div class="ai-insight-item">
          <div class="ai-insight-bullet">•</div>
          <div class="ai-insight-text">${i}</div>
        </div>
      `).join('')}
    </div>
    
    ${report.achievements.length > 0 ? `
    <div class="ai-report-card">
      <div class="overview-title" style="margin-bottom: 16px;">🏆 本周成就</div>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        ${report.achievements.map(a => `<span class="ai-achievement-badge">${a}</span>`).join('')}
      </div>
    </div>
    ` : ''}
  `;
}

function showAIView(view) {
  document.getElementById('weekly-view-btn').classList.toggle('active', view === 'weekly');
  document.getElementById('trend-view-btn').classList.toggle('active', view === 'trend');
  document.getElementById('ai-weekly-view').style.display = view === 'weekly' ? 'block' : 'none';
  document.getElementById('ai-trend-view').style.display = view === 'trend' ? 'block' : 'none';
  
  if (view === 'weekly') {
    renderAIInsight();
  } else if (view === 'trend') {
    renderMoodTrendChart();
  }
}

function renderMoodTrendChart() {
  const chartContainer = document.getElementById('mood-trend-chart');
  if (!chartContainer) return;
  
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  const today = new Date();
  let html = '';
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = Utils.formatDate(date).full;
    const diary = AppState.diaries.find(d => d.date === dateStr);
    const score = diary ? analyzeDiaryEmotion(diary.content).score : 50;
    const color = score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
    
    html += `
      <div class="mood-bar-row">
        <div class="mood-bar-label">${days[date.getDay()]}</div>
        <div class="mood-bar-wrapper">
          <div class="mood-bar" style="width: ${score}%; background: ${color};"></div>
        </div>
        <div class="mood-bar-value">${score}</div>
      </div>
    `;
  }
  
  chartContainer.innerHTML = html;
}

// ==================== COMMUNITY FUNCTIONS ====================

let currentPostType = 'mood';
let currentMood = 'happy';

const MOOD_OPTIONS = {
  happy: { emoji: '😊', label: '开心', color: '#10b981' },
  calm: { emoji: '😌', label: '平静', color: '#3b82f6' },
  tired: { emoji: '😴', label: '疲惫', color: '#64748b' },
  anxious: { emoji: '😰', label: '焦虑', color: '#f59e0b' },
  excited: { emoji: '🤩', label: '兴奋', color: '#ec4899' },
  grateful: { emoji: '🙏', label: '感恩', color: '#8b5cf6' }
};

const POST_TYPE_LABELS = {
  mood: '心情',
  achievement: '成就',
  insight: '感悟'
};

// Load posts from localStorage
function loadPosts() {
  return LocalDB.get('community_posts') || [];
}

// Save posts to localStorage
function savePosts(posts) {
  LocalDB.set('community_posts', posts);
}

function renderCommunityPosts(filter = 'all') {
  const container = document.getElementById('community-posts');
  if (!container) return;
  
  let posts = loadPosts();
  
  if (filter !== 'all') {
    posts = posts.filter(p => p.type === filter);
  }
  
  // Sort by date, newest first
  posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  
  if (posts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-users" style="font-size: 64px; color: #cbd5e1;"></i>
        <div class="empty-title">广场空空如也</div>
        <div class="empty-text">成为第一个分享心情的人吧！</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = posts.map(post => {
    const moodInfo = MOOD_OPTIONS[post.mood] || MOOD_OPTIONS.happy;
    const timeAgo = getTimeAgo(post.created_at);
    
    return `
      <div class="post-card">
        <div class="post-header">
          <div class="post-avatar" style="background: ${moodInfo.color}20;">${moodInfo.emoji}</div>
          <div class="post-meta">
            <div class="post-username">${post.user_name || '匿名用户'}</div>
            <div class="post-time">${timeAgo}</div>
          </div>
          <div class="post-type-badge" style="background: ${moodInfo.color}15; color: ${moodInfo.color};">
            ${POST_TYPE_LABELS[post.type]}
          </div>
        </div>
        <div class="post-content">${escapeHtml(post.content)}</div>
        <div class="post-actions">
          <button class="post-action-btn ${post.liked_by_me ? 'liked' : ''}" onclick="toggleLike('${post.id}')">
            <i class="${post.liked_by_me ? 'fas' : 'far'} fa-heart"></i>
            <span>${post.likes || 0}</span>
          </button>
          <button class="post-action-btn" onclick="sharePost('${post.id}')">
            <i class="fas fa-share"></i>
            <span>分享</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
  
  // Update active users count
  const uniqueUsers = new Set(posts.map(p => p.user_id)).size;
  const activeUsersEl = document.getElementById('community-active-users');
  if (activeUsersEl) {
    activeUsersEl.textContent = `${uniqueUsers + 1} 人今日活跃`;
  }
}

function getTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showPostModal() {
  document.getElementById('postModal').classList.add('active');
}

function selectPostType(type) {
  currentPostType = type;
  document.querySelectorAll('.type-chip').forEach(chip => {
    chip.classList.remove('active');
  });
  document.getElementById(`post-type-${type}`).classList.add('active');
}

function selectMood(mood) {
  currentMood = mood;
  document.querySelectorAll('.mood-chip').forEach(chip => {
    chip.classList.remove('active');
  });
  document.getElementById(`mood-${mood}`).classList.add('active');
}

function submitPost() {
  const content = document.getElementById('postContent')?.value?.trim();
  
  if (!content) {
    showToast('请输入内容');
    return;
  }
  
  const newPost = {
    id: Utils.generateId(),
    user_id: AppState.currentUser?.id || 'anonymous',
    user_name: AppState.currentUser?.email?.split('@')[0] || '匿名用户',
    content: content,
    mood: currentMood,
    type: currentPostType,
    likes: 0,
    liked_by_me: false,
    created_at: Date.now()
  };
  
  const posts = loadPosts();
  posts.unshift(newPost);
  savePosts(posts);
  
  document.getElementById('postContent').value = '';
  closeModal('postModal');
  renderCommunityPosts();
  showToast('发布成功！');
}

function toggleLike(postId) {
  const posts = loadPosts();
  const post = posts.find(p => p.id === postId);
  
  if (post) {
    if (post.liked_by_me) {
      post.likes = Math.max(0, post.likes - 1);
      post.liked_by_me = false;
    } else {
      post.likes++;
      post.liked_by_me = true;
    }
    savePosts(posts);
    renderCommunityPosts();
  }
}

function sharePost(postId) {
  const posts = loadPosts();
  const post = posts.find(p => p.id === postId);
  
  if (post) {
    const text = `${post.user_name} 在DayFlow分享：\n${post.content}\n\n#DayFlow #心情分享`;
    
    if (navigator.share) {
      navigator.share({
        title: 'DayFlow 心情分享',
        text: text
      });
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(text).then(() => {
        showToast('已复制到剪贴板');
      });
    }
  }
}

function shareWeeklyToCommunity() {
  const report = generateWeeklyReport();
  
  if (report.achievements.length === 0) {
    showToast('还没有足够的成就，继续努力！');
    return;
  }
  
  const achievement = report.achievements[0];
  selectPostType('achievement');
  selectMood('happy');
  
  const content = `本周成就：${achievement}\n\n心情指数：${report.avgScore}/100\n完成任务：${report.taskCompleted}个\n写日记：${report.diaryCount}天`;
  
  document.getElementById('postContent').value = content;
  showPostModal();
}

function filterPosts(type) {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.remove('active');
  });
  event.target.closest('.filter-chip').classList.add('active');
  renderCommunityPosts(type);
}

// ==================== PAGE NAVIGATION ====================

function showPage(pageName) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(page => {
    page.style.display = 'none';
  });
  
  // Show selected page
  const selectedPage = document.getElementById(pageName + '-page');
  if (selectedPage) {
    selectedPage.style.display = 'block';
  }
  
  // Update nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.page === pageName) {
      btn.classList.add('active');
    }
  });
  
  // Page-specific initialization
  if (pageName === 'aiinsight') {
    renderAIInsight();
  } else if (pageName === 'community') {
    renderCommunityPosts();
  }
  
  // Save current page
  AppState.currentPage = pageName;
}

// Override the original showPage function
window.showPage = showPage;

// Make community functions globally available
window.selectPostType = selectPostType;
window.selectMood = selectMood;
window.submitPost = submitPost;
window.toggleLike = toggleLike;
window.sharePost = sharePost;
window.shareWeeklyToCommunity = shareWeeklyToCommunity;
window.filterPosts = filterPosts;
window.showAIView = showAIView;

document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  loadData();
  initToday();
  initEventListeners();
  renderAll();
  
  // Initialize AI and Community
  renderAIInsight();
  renderCommunityPosts();

  console.log('✅ DayFlow initialized with AI Insight & Community');
});
