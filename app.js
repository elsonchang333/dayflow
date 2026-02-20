// DayFlow App - Zeabur Version
const SUPABASE_URL = 'https://xucrjpvmqpcrthlvrnxg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1Y3JqcHZtcXBjcnRobHZybnhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NTY0ODcsImV4cCI6MjA4NzAzMjQ4N30.5hcHWVHlx1feMIbgm7jvnFWwxxS5WKmBI1g5W8L5p9E';

let supabaseClient = null;
let isOnline = false;

const AppState = {
  currentPage: 'today',
  habits: [], todos: [], diet: {}, events: [], diaries: [],
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

async function initSupabase() {
  try {
    let retries = 0;
    while (typeof window.supabase === 'undefined' && retries < 5) {
      await new Promise(r => setTimeout(r, 500));
      retries++;
    }
    
    if (typeof window.supabase === 'undefined') { 
      console.warn('⚠️ Supabase SDK not loaded'); 
      return false; 
    }
    
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Check if user is already logged in
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
      AppState.currentUser = user;
      console.log('✅ User already logged in:', user.email);
      hideAuthModal();
      
      // Load from cloud
      console.log('☁️ Loading data from cloud...');
      await loadFromCloud();
    } else {
      console.log('👤 No user logged in');
      showAuthModal();
    }
    
    isOnline = true; 
    return true;
  } catch(e) { 
    console.warn('❌ Supabase init failed:', e.message); 
    isOnline = false; 
    return false; 
  }
}

// Auth Functions
function showAuthModal() {
  document.getElementById('authModal').style.display = 'flex';
  document.querySelector('.main-content').style.display = 'none';
  document.querySelector('.bottom-nav').style.display = 'none';
}

function hideAuthModal() {
  document.getElementById('authModal').style.display = 'none';
  document.querySelector('.main-content').style.display = 'block';
  document.querySelector('.bottom-nav').style.display = 'flex';
  updateUserDisplay();
}

async function register(email, password) {
  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password
    });
    
    if (error) throw error;
    
    AppState.currentUser = data.user;
    alert('✅ 注册成功！请登录');
    switchToLogin();
    return true;
  } catch(e) {
    alert('❌ 注册失败: ' + e.message);
    return false;
  }
}

async function login(email, password) {
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (error) throw error;
    
    AppState.currentUser = data.user;
    console.log('✅ 登录成功:', data.user.email);
    hideAuthModal();
    
    // Check if there's local data that needs to be synced first
    const hasLocalData = AppState.todos.length > 0 || AppState.habits.length > 0 || 
                         AppState.diaries.length > 0 || Object.keys(AppState.diet).length > 0;
    
    if (hasLocalData) {
      const shouldSync = confirm(`检测到本地有 ${AppState.todos.length} 条待办、${AppState.habits.length} 个习惯、${AppState.diaries.length} 篇日记、${Object.keys(AppState.diet).length} 天饮食记录。\n\n是否上传到云端？\n（选择"确定"上传本地数据，选择"取消"下载云端数据）`);
      
      if (shouldSync) {
        console.log('📤 用户选择：上传本地数据到云端');
        await syncLocalDataToSupabase();
      } else {
        console.log('📥 用户选择：下载云端数据（本地数据将被覆盖）');
      }
    }
    
    // Then load from cloud
    await loadUserData();
    alert('✅ 登录成功！数据已同步');
    return true;
  } catch(e) {
    alert('❌ 登录失败: ' + e.message);
    return false;
  }
}

// Sync local data to Supabase (for new login)
async function syncLocalDataToSupabase() {
  if (!supabaseClient || !AppState.currentUser) return;
  
  try {
    const userId = AppState.currentUser.id;
    
    // Sync todos with user_id
    for (const todo of AppState.todos) {
      const todoWithUser = { ...todo, user_id: userId };
      const { error } = await supabaseClient.from('todos').upsert(todoWithUser);
      if (error) console.warn('Failed to sync todo:', error);
    }
    
    // Sync habits
    for (const habit of AppState.habits) {
      const habitWithUser = { ...habit, user_id: userId };
      const { error } = await supabaseClient.from('habits').upsert(habitWithUser);
      if (error) console.warn('Failed to sync habit:', error);
    }
    
    // Sync diaries
    for (const diary of AppState.diaries) {
      const diaryWithUser = { ...diary, user_id: userId };
      const { error } = await supabaseClient.from('diaries').upsert(diaryWithUser);
      if (error) console.warn('Failed to sync diary:', error);
    }
    
    // Sync diet - ensure each diet entry has an id
    for (const [date, dietData] of Object.entries(AppState.diet)) {
      const dietWithUser = { 
        ...dietData, 
        id: dietData.id || `${userId}_${date}`, // Create unique id if not exists
        date, 
        user_id: userId 
      };
      const { error } = await supabaseClient.from('diet').upsert(dietWithUser);
      if (error) console.warn('Failed to sync diet:', error);
    }
    
    // Sync events
    for (const event of AppState.events) {
      const eventWithUser = { ...event, user_id: userId };
      const { error } = await supabaseClient.from('events').upsert(eventWithUser);
      if (error) console.warn('Failed to sync event:', error);
    }
    
    console.log('✅ 本地数据已同步到云端');
  } catch(e) {
    console.warn('❌ 同步失败:', e);
  }
}

async function logout() {
  try {
    await supabaseClient.auth.signOut();
    AppState.currentUser = null;
    AppState.todos = []; AppState.habits = []; AppState.diaries = [];
    AppState.diet = {}; AppState.events = [];
    alert('✅ 已退出登录');
    showAuthModal();
  } catch(e) {
    console.error('Logout error:', e);
  }
}

// Clear all user data (for testing)
async function clearAllData() {
  if (!confirm('⚠️ 警告：这将删除所有数据！\n\n包括：\n- 本地数据\n- 云端数据\n\n此操作不可恢复，确定要清除吗？')) {
    return;
  }
  
  if (!confirm('再次确认：你真的要删除所有数据吗？')) {
    return;
  }
  
  try {
    // Clear Supabase data FIRST (before clearing local data)
    if (AppState.currentUser && supabaseClient) {
      const userId = AppState.currentUser.id;
      console.log('🗑️ Clearing Supabase data for user:', userId);
      
      await supabaseClient.from('todos').delete().eq('user_id', userId);
      await supabaseClient.from('habits').delete().eq('user_id', userId);
      await supabaseClient.from('diaries').delete().eq('user_id', userId);
      await supabaseClient.from('diet').delete().eq('user_id', userId);
      await supabaseClient.from('events').delete().eq('user_id', userId);
      
      console.log('✅ Supabase data cleared');
    }
    
    // Clear local storage
    LocalDB.set('todos', []);
    LocalDB.set('habits', []);
    LocalDB.set('diet', {});
    LocalDB.set('events', []);
    LocalDB.set('diaries', []);
    
    // Clear AppState
    AppState.todos = [];
    AppState.habits = [];
    AppState.diet = {};
    AppState.events = [];
    AppState.diaries = [];
    
    // Re-render
    renderOverview();
    renderReview();
    
    alert('✅ 所有数据已清除！页面将刷新...');
    location.reload();
  } catch(e) {
    console.error('❌ Failed to clear data:', e);
    alert('❌ 清除数据失败: ' + e.message);
  }
}

function switchToLogin() {
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('registerForm').style.display = 'none';
  document.getElementById('loginTab').classList.add('active');
  document.getElementById('registerTab').classList.remove('active');
}

function switchToRegister() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'block';
  document.getElementById('loginTab').classList.remove('active');
  document.getElementById('registerTab').classList.add('active');
}

function updateUserDisplay() {
  const email = AppState.currentUser?.email || '未登录';
  document.getElementById('currentUserEmail').textContent = email;
}

// Simple load from cloud - OVERWRITE everything
async function loadFromCloud() {
  if (!AppState.currentUser || !supabaseClient) return;
  
  updateSyncStatus('downloading');
  
  try {
    const userId = AppState.currentUser.id;
    console.log('☁️ Loading from cloud for user:', userId);
    
    // Load all data from cloud (with individual error handling)
    const [todosRes, habitsRes, diariesRes, dietsRes, eventsRes] = await Promise.all([
      supabaseClient.from('todos').select('*').eq('user_id', userId).catch(e => { console.warn('Todos load failed:', e); return { data: [] }; }),
      supabaseClient.from('habits').select('*').eq('user_id', userId).catch(e => { console.warn('Habits load failed:', e); return { data: [] }; }),
      supabaseClient.from('diaries').select('*').eq('user_id', userId).catch(e => { console.warn('Diaries load failed:', e); return { data: [] }; }),
      supabaseClient.from('diet').select('*').eq('user_id', userId).catch(e => { console.warn('Diet load failed:', e); return { data: [] }; }),
      supabaseClient.from('events').select('*').eq('user_id', userId).catch(e => { console.warn('Events load failed:', e); return { data: [] }; })
    ]);
    
    // OVERWRITE local state with cloud data
    AppState.todos = todosRes?.data || [];
    AppState.habits = habitsRes?.data || [];
    AppState.diaries = diariesRes?.data || [];
    AppState.events = eventsRes?.data || [];
    
    AppState.diet = {};
    if (dietsRes?.data) {
      dietsRes.data.forEach(d => AppState.diet[d.date] = d);
    }
    
    console.log('✅ Loaded from cloud:');
    console.log('  - todos:', AppState.todos.length);
    console.log('  - habits:', AppState.habits.length);
    console.log('  - diaries:', AppState.diaries.length);
    console.log('  - diet:', Object.keys(AppState.diet).length);
    console.log('  - events:', AppState.events.length);
    
    // Save to localStorage as cache
    LocalDB.set('todos', AppState.todos);
    LocalDB.set('habits', AppState.habits);
    LocalDB.set('diet', AppState.diet);
    LocalDB.set('events', AppState.events);
    LocalDB.set('diaries', AppState.diaries);
    
    renderOverview();
    renderReview();
    
    const totalItems = AppState.todos.length + AppState.habits.length + AppState.diaries.length + Object.keys(AppState.diet).length + AppState.events.length;
    if (totalItems > 0) {
      console.log('✅ 已同步 ' + totalItems + ' 条记录');
      updateSyncStatus('synced');
      
      // Force re-render to ensure UI shows data
      setTimeout(() => {
        console.log('🔄 Force re-render after cloud load');
        renderOverview();
        renderReview();
      }, 100);
    } else {
      updateSyncStatus('ready', '云端无数据');
    }
  } catch(e) {
    console.error('❌ Failed to load from cloud:', e);
    updateSyncStatus('error', '下载失败');
    // Still render with local data
    renderOverview();
    renderReview();
  }
}

// Diagnose cloud data status
async function diagnoseCloudData() {
  if (!supabaseClient || !AppState.currentUser) {
    alert('请先登录');
    return;
  }
  
  const userId = AppState.currentUser.id;
  let report = '🔍 云端数据诊断报告\n\n';
  report += '用户ID: ' + userId + '\n\n';
  
  try {
    // Check each table
    const tables = ['todos', 'habits', 'diaries', 'diet', 'events'];
    
    for (const table of tables) {
      const { data, error } = await supabaseClient
        .from(table)
        .select('*')
        .eq('user_id', userId);
      
      if (error) {
        report += `❌ ${table}: 查询失败 - ${error.message}\n`;
      } else {
        report += `✅ ${table}: ${data?.length || 0} 条记录\n`;
        if (data && data.length > 0) {
          report += `   样例: ${JSON.stringify(data[0]).substring(0, 100)}...\n`;
        }
      }
    }
    
    report += '\n📊 本地数据:\n';
    report += `  - todos: ${AppState.todos.length}\n`;
    report += `  - habits: ${AppState.habits.length}\n`;
    report += `  - diaries: ${AppState.diaries.length}\n`;
    report += `  - diet: ${Object.keys(AppState.diet).length}\n`;
    report += `  - events: ${AppState.events.length}\n`;
    
    alert(report);
    console.log(report);
  } catch(e) {
    alert('诊断失败: ' + e.message);
    console.error(e);
  }
}

// Load user data from Supabase and MERGE with local data
async function loadUserData() {
  if (!AppState.currentUser) return;
  
  try {
    const userId = AppState.currentUser.id;
    console.log('📥 Loading data from Supabase for user:', userId);
    console.log('📥 Current local diet data:', AppState.diet);
    
    // Load todos - merge strategy: cloud + local (prefer local if same id)
    const { data: todos, error: todosError } = await supabaseClient.from('todos').select('*').eq('user_id', userId);
    if (todosError) console.warn('❌ Failed to load todos:', todosError);
    else if (todos && todos.length > 0) {
      // Merge: start with cloud, add local items that don't exist in cloud
      const cloudIds = new Set(todos.map(t => t.id));
      const localOnlyTodos = AppState.todos.filter(t => !cloudIds.has(t.id));
      AppState.todos = [...todos, ...localOnlyTodos];
      console.log('✅ Merged', todos.length, 'cloud todos +', localOnlyTodos.length, 'local todos');
    }
    
    // Load habits - merge strategy
    const { data: habits, error: habitsError } = await supabaseClient.from('habits').select('*').eq('user_id', userId);
    if (habitsError) console.warn('❌ Failed to load habits:', habitsError);
    else if (habits && habits.length > 0) {
      const cloudIds = new Set(habits.map(h => h.id));
      const localOnlyHabits = AppState.habits.filter(h => !cloudIds.has(h.id));
      AppState.habits = [...habits, ...localOnlyHabits];
      console.log('✅ Merged', habits.length, 'cloud habits +', localOnlyHabits.length, 'local habits');
    }
    
    // Load diaries - merge strategy
    const { data: diaries, error: diariesError } = await supabaseClient.from('diaries').select('*').eq('user_id', userId);
    if (diariesError) console.warn('❌ Failed to load diaries:', diariesError);
    else if (diaries && diaries.length > 0) {
      const cloudIds = new Set(diaries.map(d => d.id));
      const localOnlyDiaries = AppState.diaries.filter(d => !cloudIds.has(d.id));
      AppState.diaries = [...diaries, ...localOnlyDiaries];
      console.log('✅ Merged', diaries.length, 'cloud diaries +', localOnlyDiaries.length, 'local diaries');
    }
    
    // Load diet - merge strategy: merge by date
    const { data: diets, error: dietsError } = await supabaseClient.from('diet').select('*').eq('user_id', userId);
    if (dietsError) console.warn('❌ Failed to load diet:', dietsError);
    else if (diets && diets.length > 0) {
      // Merge: local diet takes priority, add cloud entries for dates not in local
      diets.forEach(d => {
        if (!AppState.diet[d.date]) {
          AppState.diet[d.date] = d;
        }
      });
      console.log('✅ Merged diet:', Object.keys(AppState.diet).length, 'total dates');
    }
    console.log('📥 Final AppState.diet:', AppState.diet);
    
    // Load events - merge strategy
    const { data: events, error: eventsError } = await supabaseClient.from('events').select('*').eq('user_id', userId);
    if (eventsError) console.warn('❌ Failed to load events:', eventsError);
    else if (events && events.length > 0) {
      const cloudIds = new Set(events.map(e => e.id));
      const localOnlyEvents = AppState.events.filter(e => !cloudIds.has(e.id));
      AppState.events = [...events, ...localOnlyEvents];
      console.log('✅ Merged', events.length, 'cloud events +', localOnlyEvents.length, 'local events');
    }
    
    console.log('✅ User data merged from Supabase');
    
    // Save merged data to local storage
    LocalDB.set('todos', AppState.todos);
    LocalDB.set('habits', AppState.habits);
    LocalDB.set('diet', AppState.diet);
    LocalDB.set('events', AppState.events);
    LocalDB.set('diaries', AppState.diaries);
    console.log('💾 Saved merged data to local storage');
    
    // Sync local-only data to cloud
    await syncLocalOnlyDataToCloud(userId);
    
    renderOverview(); renderReview();
  } catch(e) {
    console.error('❌ Failed to load user data:', e);
  }
}

// Sync data that only exists locally to the cloud
async function syncLocalOnlyDataToCloud(userId) {
  try {
    console.log('🔄 Syncing local-only data to cloud...');
    
    // Sync diet entries
    const dietEntries = Object.entries(AppState.diet);
    for (const [date, data] of dietEntries) {
      if (!data.user_id) {
        const dietWithUser = { 
          ...data, 
          id: data.id || `${userId}_${date}`,
          date, 
          user_id: userId 
        };
        const { error } = await supabaseClient.from('diet').upsert(dietWithUser);
        if (error) console.warn('Failed to sync diet:', error);
      }
    }
    
    console.log('✅ Local-only data synced to cloud');
  } catch(e) {
    console.warn('❌ Failed to sync local data:', e);
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
  console.log('📂 Loading data from LocalStorage...');
  AppState.todos = LocalDB.get('todos') || [];
  AppState.habits = LocalDB.get('habits') || [];
  AppState.diet = LocalDB.get('diet') || {};
  AppState.events = LocalDB.get('events') || [];
  AppState.diaries = LocalDB.get('diaries') || [];
  console.log('📂 Loaded from LocalStorage:');
  console.log('  - todos:', AppState.todos.length);
  console.log('  - habits:', AppState.habits.length);
  console.log('  - diet:', Object.keys(AppState.diet).length, 'entries');
  console.log('  - events:', AppState.events.length);
  console.log('  - diaries:', AppState.diaries.length);
  
  // Debug: show raw localStorage
  console.log('📂 Raw localStorage keys:', Object.keys(localStorage).filter(k => k.startsWith('dayflow_')));
}

async function saveData() {
  // Always save to localStorage first (as cache)
  LocalDB.set('todos', AppState.todos);
  LocalDB.set('habits', AppState.habits);
  LocalDB.set('diet', AppState.diet);
  LocalDB.set('events', AppState.events);
  LocalDB.set('diaries', AppState.diaries);
  
  // ALWAYS upload to cloud if logged in
  if (AppState.currentUser && supabaseClient) {
    console.log('☁️ Saving to cloud...');
    await saveToCloud();
  }
}

// Update sync status UI
function updateSyncStatus(status, message) {
  const indicator = document.getElementById('syncIndicator');
  const statusEl = document.getElementById('syncStatus');
  if (!indicator || !statusEl) return;
  
  if (status === 'uploading') {
    indicator.style.color = '#3b82f6';
    statusEl.innerHTML = '⏫ 上传中...';
  } else if (status === 'downloading') {
    indicator.style.color = '#3b82f6';
    statusEl.innerHTML = '⏬ 下载中...';
  } else if (status === 'synced') {
    indicator.style.color = '#10b981';
    statusEl.innerHTML = '✓ 已同步';
    setTimeout(() => {
      if (statusEl.innerHTML === '✓ 已同步') {
        statusEl.innerHTML = '就绪';
        indicator.style.color = '#64748b';
      }
    }, 2000);
  } else if (status === 'error') {
    indicator.style.color = '#ef4444';
    statusEl.innerHTML = '✗ ' + (message || '同步失败');
  } else {
    indicator.style.color = '#64748b';
    statusEl.innerHTML = message || '就绪';
  }
}

// Save current state to cloud
async function saveToCloud() {
  if (!supabaseClient || !AppState.currentUser) return;
  
  const userId = AppState.currentUser.id;
  updateSyncStatus('uploading');
  
  try {
    // Save all data types to cloud
    const saves = [];
    
    // Todos
    if (AppState.todos.length > 0) {
      saves.push(supabaseClient.from('todos').upsert(
        AppState.todos.map(t => ({ ...t, user_id: userId }))
      ));
    }
    
    // Habits  
    if (AppState.habits.length > 0) {
      saves.push(supabaseClient.from('habits').upsert(
        AppState.habits.map(h => ({ ...h, user_id: userId }))
      ));
    }
    
    // Diaries
    if (AppState.diaries.length > 0) {
      saves.push(supabaseClient.from('diaries').upsert(
        AppState.diaries.map(d => ({ ...d, user_id: userId }))
      ));
    }
    
    // Diet
    const dietEntries = Object.entries(AppState.diet);
    if (dietEntries.length > 0) {
      saves.push(supabaseClient.from('diet').upsert(
        dietEntries.map(([date, data]) => ({
          ...data,
          id: data.id || `${userId}_${date}`,
          date,
          user_id: userId
        }))
      ));
    }
    
    // Events
    if (AppState.events.length > 0) {
      saves.push(supabaseClient.from('events').upsert(
        AppState.events.map(e => ({ ...e, user_id: userId }))
      ));
    }
    
    if (saves.length > 0) {
      await Promise.all(saves);
      console.log('✅ Saved to cloud');
      updateSyncStatus('synced');
      
      // Verify by reading back
      const { data: verifyDiets } = await supabaseClient.from('diet').select('*').eq('user_id', userId);
      console.log('✅ Verified in cloud:', verifyDiets?.length || 0, 'diet entries');
    } else {
      updateSyncStatus('ready', '无数据');
    }
  } catch(e) {
    console.warn('❌ Failed to save to cloud:', e);
    updateSyncStatus('error', '上传失败');
  }
}

// Auto sync all data to Supabase (lightweight version for frequent saves)
async function autoSyncToSupabase() {
  if (!supabaseClient || !AppState.currentUser) {
    console.log('⚠️ Cannot sync: not logged in or no supabase client');
    return;
  }
  
  const userId = AppState.currentUser.id;
  const syncStatus = document.getElementById('syncStatus');
  if (syncStatus) syncStatus.textContent = '同步中...';
  
  // Batch upsert all data types
  try {
    console.log('🔄 Starting auto-sync for user:', userId);
    
    // Todos
    if (AppState.todos.length > 0) {
      const todosWithUser = AppState.todos.map(t => ({ ...t, user_id: userId }));
      const { error } = await supabaseClient.from('todos').upsert(todosWithUser);
      if (error) console.warn('❌ Failed to sync todos:', error);
      else console.log('✅ Synced', AppState.todos.length, 'todos');
    }
    
    // Habits
    if (AppState.habits.length > 0) {
      const habitsWithUser = AppState.habits.map(h => ({ ...h, user_id: userId }));
      const { error } = await supabaseClient.from('habits').upsert(habitsWithUser);
      if (error) console.warn('❌ Failed to sync habits:', error);
      else console.log('✅ Synced', AppState.habits.length, 'habits');
    }
    
    // Diaries
    if (AppState.diaries.length > 0) {
      const diariesWithUser = AppState.diaries.map(d => ({ ...d, user_id: userId }));
      const { error } = await supabaseClient.from('diaries').upsert(diariesWithUser);
      if (error) console.warn('❌ Failed to sync diaries:', error);
      else console.log('✅ Synced', AppState.diaries.length, 'diaries');
    }
    
    // Diet
    const dietEntries = Object.entries(AppState.diet);
    if (dietEntries.length > 0) {
      const dietsWithUser = dietEntries.map(([date, data]) => ({ 
        ...data, 
        id: data.id || `${userId}_${date}`,
        date, 
        user_id: userId 
      }));
      const { error } = await supabaseClient.from('diet').upsert(dietsWithUser);
      if (error) console.warn('❌ Failed to sync diet:', error);
      else console.log('✅ Synced', dietEntries.length, 'diet entries');
    }
    
    // Events
    if (AppState.events.length > 0) {
      const eventsWithUser = AppState.events.map(e => ({ ...e, user_id: userId }));
      const { error } = await supabaseClient.from('events').upsert(eventsWithUser);
      if (error) console.warn('❌ Failed to sync events:', error);
      else console.log('✅ Synced', AppState.events.length, 'events');
    }
    
    console.log('☁️ Auto-sync complete');
    if (syncStatus) {
      syncStatus.textContent = '已同步';
      setTimeout(() => { syncStatus.textContent = ''; }, 2000);
    }
  } catch(e) {
    console.warn('❌ Auto-sync failed:', e);
    if (syncStatus) {
      syncStatus.textContent = '同步失败';
      setTimeout(() => { syncStatus.textContent = ''; }, 3000);
    }
  }
}

// Save to Supabase with user_id
async function saveToSupabase(table, data) {
  if (!supabaseClient || !AppState.currentUser) return;
  
  try {
    const dataWithUser = { ...data, user_id: AppState.currentUser.id };
    const { error } = await supabaseClient.from(table).upsert(dataWithUser);
    if (error) console.warn(`Failed to save ${table}:`, error);
  } catch(e) {
    console.warn(`Supabase save error:`, e);
  }
}

function initToday() {
  // Reset to today on page load
  AppState.currentDate = new Date();
  const today = Utils.formatDate(AppState.currentDate);
  document.getElementById('currentDate').textContent = `${today.month}${today.date}日`;
  document.getElementById('currentWeekday').textContent = today.weekday;
  
  // Update date picker to today
  const datePicker = document.getElementById('todayDatePicker');
  if (datePicker) datePicker.value = today.full;
  
  renderOverview(); renderReview();
}

function renderOverview() {
  // Use current selected date, not always today
  const currentDate = Utils.formatDate(AppState.currentDate).full;
  console.log('📊 renderOverview - currentDate:', currentDate);
  console.log('📊 AppState.diet:', AppState.diet);
  console.log('📊 AppState.diet[currentDate]:', AppState.diet[currentDate]);
  
  const todos = AppState.todos.filter(t => t.date === currentDate);
  const completed = todos.filter(t => t.completed).length;
  document.querySelector('#overviewTodos .overview-count').textContent = `${completed}/${todos.length}`;
  
  const checked = AppState.habits.filter(h => (h.checkIns||[]).includes(currentDate)).length;
  document.querySelector('#overviewHabits .overview-count').textContent = `${checked}/${AppState.habits.length}`;
  
  const diet = AppState.diet[currentDate];
  let cal = 0;
  if (diet) cal = (diet.breakfast?.calories||0)+(diet.lunch?.calories||0)+(diet.dinner?.calories||0)+(diet.snack?.calories||0);
  document.querySelector('#overviewDiet .overview-count').textContent = cal;
  
  const events = AppState.events.filter(e => e.date === currentDate).length;
  document.querySelector('#overviewEvents .overview-count').textContent = events;
}

function renderReview() {
  const container = document.getElementById('reviewContent');
  // Use current selected date, not always today
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
  
  const currentDiet = AppState.diet[currentDate];
  if (currentDiet) {
    const meals = [];
    if (currentDiet.breakfast?.food) meals.push(`早餐：${currentDiet.breakfast.food}`);
    if (currentDiet.lunch?.food) meals.push(`午餐：${currentDiet.lunch.food}`);
    if (currentDiet.dinner?.food) meals.push(`晚餐：${currentDiet.dinner.food}`);
    if (currentDiet.snack?.food) meals.push(`加餐：${currentDiet.snack.food}`);
    if (meals.length) {
      html += `<div class="review-section"><h4>🍽️ 饮食记录 (${meals.length}餐)</h4><ul>`;
      html += meals.map(m => `<li>${m}</li>`).join('');
      html += '</ul></div>';
    }
  }
  
  const currentEvents = AppState.events.filter(e => e.date === currentDate);
  if (currentEvents.length) {
    html += `<div class="review-section"><h4>📅 今日行程 (${currentEvents.length})</h4><ul>`;
    html += currentEvents.map(e => `<li>${e.time||'全天'} - ${e.title}</li>`).join('');
    html += '</ul></div>';
  }
  
  const currentDiary = AppState.diaries.find(d => d.date === currentDate);
  if (currentDiary) {
    html += `<div class="review-section"><h4>📖 今日日记</h4><div class="review-diary"><strong>${currentDiary.title}</strong><p>${currentDiary.content || ''}</p></div></div>`;
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
  if (page === 'stats') { 
    setTimeout(() => {
      renderStats();
      bindStatsButtons();
    }, 100); 
  }
  if (page === 'diary') renderDiaryList();
}

// Bind stats page buttons (called when stats page is shown)
function bindStatsButtons() {
  // Stats quick date buttons
  document.querySelectorAll('.stats-quick-btn').forEach(btn => {
    // Remove existing listener to avoid duplicates
    btn.replaceWith(btn.cloneNode(true));
  });
  
  // Re-add listeners
  document.querySelectorAll('.stats-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stats-quick-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const range = btn.dataset.range;
      const datePicker = document.getElementById('statsDatePicker');
      
      if (range === 'custom') {
        datePicker.style.display = 'block';
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 6);
        document.getElementById('statsEndDate').value = Utils.formatDate(end).full;
        document.getElementById('statsStartDate').value = Utils.formatDate(start).full;
      } else {
        datePicker.style.display = 'none';
        
        let dates;
        const today = new Date();
        
        switch(range) {
          case 'today':
            dates = [Utils.formatDate(today).full];
            break;
          case 'yesterday':
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            dates = [Utils.formatDate(yesterday).full];
            break;
          case 'week':
            dates = [];
            for (let i = 6; i >= 0; i--) {
              const d = new Date(today);
              d.setDate(d.getDate() - i);
              dates.push(Utils.formatDate(d).full);
            }
            break;
          case 'month':
            dates = [];
            for (let i = 29; i >= 0; i--) {
              const d = new Date(today);
              d.setDate(d.getDate() - i);
              dates.push(Utils.formatDate(d).full);
            }
            break;
        }
        
        AppState.statsDates = dates;
        renderStatsWithDates(dates);
      }
    });
  });
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

function getMonthDates() {
  const dates = [];
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  for (let day = 1; day <= daysInMonth; day++) {
    dates.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return dates;
}

function getCustomDates() {
  const startDate = document.getElementById('statsStartDate')?.value;
  const endDate = document.getElementById('statsEndDate')?.value;
  
  if (!startDate || !endDate) return getWeekDates();
  
  const dates = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(Utils.formatDate(d).full);
  }
  return dates;
}

function renderStats() {
  // Check if we have pre-selected dates from quick buttons
  if (AppState.statsDates && AppState.statsDates.length > 0) {
    renderStatsWithDates(AppState.statsDates);
    return;
  }
  
  const activeRange = document.querySelector('.stats-quick-btn.active')?.dataset.range || 'week';
  let dates;
  
  if (activeRange === 'today') {
    dates = [Utils.formatDate(new Date()).full];
  } else if (activeRange === 'yesterday') {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    dates = [Utils.formatDate(yesterday).full];
  } else if (activeRange === 'week' || activeRange === 'custom') {
    dates = getWeekDates();
  } else if (activeRange === 'month') {
    dates = getMonthDates();
  } else {
    dates = getWeekDates();
  }
  
  renderHabitStats(dates);
  renderDietStats(dates);
  renderTodoStats(dates);
  renderMoodStats(dates);
}

function renderStatsWithDates(dates) {
  renderHabitStats(dates);
  renderDietStats(dates);
  renderTodoStats(dates);
  renderMoodStats(dates);
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
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      plugins: { 
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(context) {
              const index = context[0].dataIndex;
              return dates[index];
            }
          }
        }
      }, 
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      onClick: (e, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          const selectedDate = dates[index];
          jumpToDate(selectedDate);
        }
      }
    }
  });
  
  // Store dates for click handler reference
  habitChart._statsDates = dates;
}

// Jump to specific date in today view
function jumpToDate(date) {
  // Switch to today page
  showPage('today');
  
  // Update current date display
  const d = new Date(date);
  AppState.currentDate = d;
  
  // Update date display
  const formatted = Utils.formatDate(d);
  document.getElementById('currentDate').textContent = `${formatted.month}${formatted.date}日`;
  document.getElementById('currentWeekday').textContent = formatted.weekday;
  
  // Update today date picker if exists
  const datePicker = document.getElementById('todayDatePicker');
  if (datePicker) datePicker.value = formatted.full;
  
  // Re-render with new date
  renderOverview();
  renderReview();
  
  // Show a toast or highlight
  alert(`已切换到 ${formatted.full}，点击下方按钮编辑数据`);
}

// Switch to specific date on today page
function switchToDate(date) {
  // Update current date
  const d = new Date(date);
  AppState.currentDate = d;
  
  // Update date display
  const formatted = Utils.formatDate(d);
  document.getElementById('currentDate').textContent = `${formatted.month}${formatted.date}日`;
  document.getElementById('currentWeekday').textContent = formatted.weekday;
  
  // Update date picker
  const datePicker = document.getElementById('todayDatePicker');
  if (datePicker) datePicker.value = formatted.full;
  
  // Re-render with new date
  renderOverview();
  renderReview();
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
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
      onClick: () => {
        // Show a prompt to select which date to view
        if (dates.length === 1) {
          jumpToDate(dates[0]);
        } else {
          const dateList = dates.map((d, i) => `${i + 1}. ${d}`).join('\n');
          const choice = prompt(`选择要查看的日期（输入 1-${dates.length}）：\n${dateList}`);
          const index = parseInt(choice) - 1;
          if (index >= 0 && index < dates.length) {
            jumpToDate(dates[index]);
          }
        }
      }
    }
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
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      plugins: { legend: { position: 'bottom' } },
      onClick: () => {
        // Show a prompt to select which date to view
        if (dates.length === 1) {
          jumpToDate(dates[0]);
        } else {
          const dateList = dates.map((d, i) => `${i + 1}. ${d}`).join('\n');
          const choice = prompt(`选择要查看的日期（输入 1-${dates.length}）：\n${dateList}`);
          const index = parseInt(choice) - 1;
          if (index >= 0 && index < dates.length) {
            jumpToDate(dates[index]);
          }
        }
      }
    }
  });
}

function renderMoodStats(dates) {
  const moodCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalMood = 0, count = 0;
  
  // Filter diaries by date range if provided
  const filteredDiaries = dates 
    ? AppState.diaries.filter(d => dates.includes(d.date))
    : AppState.diaries;
  
  filteredDiaries.forEach(d => { 
    if (d.mood) { 
      moodCounts[d.mood]++; 
      totalMood += d.mood; 
      count++; 
    } 
  });
  
  document.getElementById('avgMood').textContent = Utils.getMoodEmoji(count > 0 ? Math.round(totalMood / count) : 3);
  document.getElementById('diaryCount').textContent = filteredDiaries.length + ' 篇';
  
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

async function saveDiet() {
  const date = document.getElementById('dietDate')?.value || Utils.formatDate(new Date()).full;
  console.log('💾 saveDiet - saving for date:', date);
  
  const get = id => document.getElementById(id)?.value || '';
  const getNum = id => parseInt(document.getElementById(id)?.value) || 0;
  
  // Generate unique id for this diet entry
  const userId = AppState.currentUser?.id || 'local';
  const dietId = `${userId}_${date}`;
  
  AppState.diet[date] = { 
    id: dietId,
    date: date,
    breakfast: {food:get('breakfastInput'),calories:getNum('breakfastCal')}, 
    lunch: {food:get('lunchInput'),calories:getNum('lunchCal')}, 
    dinner: {food:get('dinnerInput'),calories:getNum('dinnerCal')}, 
    snack: {food:get('snackInput'),calories:getNum('snackCal')} 
  };
  
  console.log('💾 saveDiet - AppState.diet:', AppState.diet);
  
  // IMPORTANT: Wait for save to complete (especially cloud upload)
  await saveData(); 
  
  document.getElementById('dietModal').classList.remove('active'); 
  renderOverview(); 
  renderReview(); 
  alert('饮食记录已保存并上传到云端！');
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

// Global error handler
window.addEventListener('error', (e) => {
  console.error('❌ Global error:', e.message, e.filename, e.lineno);
  alert('JS错误: ' + e.message + ' 在行 ' + e.lineno);
});

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 DOM Content Loaded - Initializing...');
  
  // CRITICAL: Setup all button bindings FIRST (before any async operations)
  // This ensures buttons work even if cloud sync fails
  console.log('🔘 Setting up button bindings...');
  
  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
  
  // Quick actions - with debug
  const todoBtn = document.getElementById('todoBtn');
  const dietBtn = document.getElementById('dietBtn');
  const habitBtn = document.getElementById('habitBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  
  console.log('Found buttons:', { todoBtn: !!todoBtn, dietBtn: !!dietBtn, habitBtn: !!habitBtn, settingsBtn: !!settingsBtn });
  
  if (todoBtn) todoBtn.addEventListener('click', () => { 
    document.getElementById('todoModal').classList.add('active'); 
    document.getElementById('todoDate').value = Utils.formatDate(AppState.currentDate).full; 
    renderTodos(); 
  });
  
  if (habitBtn) habitBtn.addEventListener('click', () => { 
    document.getElementById('habitModal').classList.add('active'); 
    document.getElementById('habitDate').value = Utils.formatDate(AppState.currentDate).full; 
    renderHabits(); 
  });
  
  if (dietBtn) dietBtn.addEventListener('click', () => { 
    console.log('🍽️ Diet button clicked');
    document.getElementById('dietModal').classList.add('active'); 
    document.getElementById('dietDate').value = Utils.formatDate(AppState.currentDate).full; 
    loadDiet(); 
  });
  
  document.getElementById('pomodoroBtn')?.addEventListener('click', () => document.getElementById('pomodoroModal').classList.add('active'));
  
  // Settings
  if (settingsBtn) settingsBtn.addEventListener('click', () => {
    console.log('⚙️ Settings button clicked');
    document.getElementById('settingsModal').classList.add('active');
  });
  document.getElementById('closeSettings')?.addEventListener('click', () => document.getElementById('settingsModal').classList.remove('active'));
  
  console.log('✅ Button bindings complete');
  
  try {
    // Load local cache first (for fast display)
    loadData();
    initToday();
    
    // Then init Supabase - will download from cloud if logged in
    await initSupabase();
    
    console.log('✅ Initialization complete');
  } catch(e) {
    console.error('❌ Initialization failed:', e);
  }
  
  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
  
  // Today page date selector
  const todayDatePicker = document.getElementById('todayDatePicker');
  if (todayDatePicker) {
    todayDatePicker.value = Utils.formatDate(new Date()).full;
    
    todayDatePicker.addEventListener('change', () => {
      const selectedDate = todayDatePicker.value;
      if (selectedDate) {
        switchToDate(selectedDate);
      }
    });
  }
  
  document.getElementById('todayGoToDate')?.addEventListener('click', () => {
    const selectedDate = document.getElementById('todayDatePicker')?.value;
    if (selectedDate) {
      switchToDate(selectedDate);
    }
  });
  
  // Today page quick date buttons
  document.querySelectorAll('.today-quick-date').forEach(btn => {
    btn.addEventListener('click', () => {
      const offset = parseInt(btn.dataset.offset);
      const date = new Date();
      date.setDate(date.getDate() + offset);
      const dateStr = Utils.formatDate(date).full;
      
      // Update date picker
      const picker = document.getElementById('todayDatePicker');
      if (picker) picker.value = dateStr;
      
      // Switch to that date
      switchToDate(dateStr);
    });
  });
  
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
  
  // Actions
  document.getElementById('addTodoBtn')?.addEventListener('click', () => { addTodo(document.getElementById('todoInput').value); document.getElementById('todoInput').value = ''; });
  document.getElementById('addHabitBtn')?.addEventListener('click', () => { addHabit(document.getElementById('habitInput').value, document.getElementById('habitIcon').value); document.getElementById('habitInput').value = ''; });
  document.getElementById('saveDiet')?.addEventListener('click', () => saveDiet());
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
  document.getElementById('clearAllData')?.addEventListener('click', clearAllData);
  
  // Manual sync button
  document.getElementById('forceSyncBtn')?.addEventListener('click', async () => {
    if (!AppState.currentUser) {
      alert('请先登录');
      return;
    }
    updateSyncStatus('downloading');
    await loadFromCloud();
    alert('同步完成！');
  });
  
  // Diagnose button
  document.getElementById('diagnoseBtn')?.addEventListener('click', diagnoseCloudData);
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
  
  // Quick date buttons for todos, habits, diet
  document.querySelectorAll('.quick-date-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const offset = parseInt(btn.dataset.offset);
      const targetInput = document.getElementById(targetId);
      
      if (targetInput) {
        const date = new Date();
        date.setDate(date.getDate() + offset);
        targetInput.value = Utils.formatDate(date).full;
        
        // Trigger change event to reload data
        targetInput.dispatchEvent(new Event('change'));
      }
    });
  });

  // Stats quick date buttons
  document.querySelectorAll('.stats-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stats-quick-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const range = btn.dataset.range;
      const datePicker = document.getElementById('statsDatePicker');
      const customBtn = document.querySelector('.stats-quick-btn[data-range="custom"]');
      
      if (range === 'custom') {
        datePicker.style.display = 'block';
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 6);
        document.getElementById('statsEndDate').value = Utils.formatDate(end).full;
        document.getElementById('statsStartDate').value = Utils.formatDate(start).full;
      } else {
        datePicker.style.display = 'none';
        
        // Calculate dates based on selection
        let dates;
        const today = new Date();
        
        switch(range) {
          case 'today':
            dates = [Utils.formatDate(today).full];
            break;
          case 'yesterday':
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            dates = [Utils.formatDate(yesterday).full];
            break;
          case 'week':
            dates = [];
            for (let i = 6; i >= 0; i--) {
              const d = new Date(today);
              d.setDate(d.getDate() - i);
              dates.push(Utils.formatDate(d).full);
            }
            break;
          case 'month':
            dates = [];
            for (let i = 29; i >= 0; i--) {
              const d = new Date(today);
              d.setDate(d.getDate() - i);
              dates.push(Utils.formatDate(d).full);
            }
            break;
        }
        
        // Store selected dates and render
        AppState.statsDates = dates;
        renderStatsWithDates(dates);
      }
    });
  });
  
  // Apply custom date range
  document.getElementById('applyStatsDate')?.addEventListener('click', () => {
    const startDate = document.getElementById('statsStartDate').value;
    const endDate = document.getElementById('statsEndDate').value;
    
    if (startDate && endDate) {
      const dates = [];
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(Utils.formatDate(d).full);
      }
      
      AppState.statsDates = dates;
      renderStatsWithDates(dates);
    }
  });
  
  // Stats period selector (legacy, keep for compatibility)
  document.querySelectorAll('.period-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderStats();
  }));
  
  // Auth event listeners
  document.getElementById('loginTab')?.addEventListener('click', switchToLogin);
  document.getElementById('registerTab')?.addEventListener('click', switchToRegister);
  document.getElementById('doLogin')?.addEventListener('click', () => {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    if (email && password) login(email, password);
    else alert('请输入邮箱和密码');
  });
  document.getElementById('doRegister')?.addEventListener('click', () => {
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('confirmPassword').value;
    if (!email || !password) { alert('请输入邮箱和密码'); return; }
    if (password !== confirm) { alert('两次密码不一致'); return; }
    if (password.length < 6) { alert('密码至少6位'); return; }
    register(email, password);
  });
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  
  // Bind stats buttons immediately
  setTimeout(bindStatsButtons, 500);
  
  console.log('DayFlow initialized');
});
