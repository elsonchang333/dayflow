-- DayFlow 完整數據庫設置腳本
-- 在 Supabase Dashboard → SQL Editor 中執行

-- ========== 1. 創建 todos 表 ==========
CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    date TEXT NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 2. 創建 habits 表 ==========
CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '✅',
    check_ins TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 3. 創建 diets 表 ==========
CREATE TABLE IF NOT EXISTS diets (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    breakfast TEXT,
    breakfast_cal INTEGER DEFAULT 0,
    lunch TEXT,
    lunch_cal INTEGER DEFAULT 0,
    dinner TEXT,
    dinner_cal INTEGER DEFAULT 0,
    snack TEXT,
    snack_cal INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 4. 創建 diaries 表 ==========
CREATE TABLE IF NOT EXISTS diaries (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    title TEXT,
    content TEXT,
    mood INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 5. 創建 schedules 表（行程）==========
CREATE TABLE IF NOT EXISTS schedules (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT,
    location TEXT,
    type TEXT DEFAULT 'other',
    reminder TEXT DEFAULT '0',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 6. 啟用行級安全(RLS) ==========
ALTER TABLE todos ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE diets ENABLE ROW LEVEL SECURITY;
ALTER TABLE diaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

-- ========== 7. 創建訪問策略 ==========
CREATE POLICY "Own data only" ON todos FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own data only" ON habits FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own data only" ON diets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own data only" ON diaries FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Own data only" ON schedules FOR ALL USING (auth.uid() = user_id);

-- ========== 8. 創建索引 ==========
CREATE INDEX idx_todos_lookup ON todos(user_id, date);
CREATE INDEX idx_diets_lookup ON diets(user_id, date);
CREATE INDEX idx_diaries_lookup ON diaries(user_id, date);
CREATE INDEX idx_schedules_lookup ON schedules(user_id, date);

-- ✅ 完成！現在可以測試登錄同步功能了
