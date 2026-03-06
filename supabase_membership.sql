-- DayFlow 会员系统数据库框架
-- 在 Supabase SQL Editor 中运行

-- ============================================
-- 1. 用户表（扩展 auth.users）
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  bio TEXT,
  
  -- 会员信息
  membership_tier TEXT DEFAULT 'free' CHECK (membership_tier IN ('free', 'pro', 'enterprise')),
  membership_status TEXT DEFAULT 'active' CHECK (membership_status IN ('active', 'expired', 'cancelled')),
  membership_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- 统计数据
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE,
  
  -- 设置
  settings JSONB DEFAULT '{}'::jsonb
);

-- ============================================
-- 2. 订阅/订单表
-- ============================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- 订阅信息
  tier TEXT NOT NULL CHECK (tier IN ('pro', 'enterprise')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled', 'expired')),
  
  -- 支付信息
  payment_provider TEXT CHECK (payment_provider IN ('stripe', 'alipay', 'wechat')),
  payment_method_id TEXT,
  
  -- 时间
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  
  -- 价格
  amount DECIMAL(10,2),
  currency TEXT DEFAULT 'CNY',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 3. 订单记录表
-- ============================================
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.subscriptions(id),
  
  -- 订单信息
  order_number TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'CNY',
  
  -- 支付状态
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  paid_at TIMESTAMP WITH TIME ZONE,
  
  -- 支付详情
  payment_provider TEXT,
  payment_intent_id TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 4. 功能权限表（权限控制）
-- ============================================
CREATE TABLE IF NOT EXISTS public.features (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_key TEXT UNIQUE NOT NULL,  -- 如 'ai_daily_insight', 'cloud_sync', 'export_pdf'
  feature_name TEXT NOT NULL,
  description TEXT,
  
  -- 权限配置
  free_quota INTEGER DEFAULT 0,      -- 免费版额度（0=无，-1=无限，N=次数）
  pro_quota INTEGER DEFAULT -1,      -- Pro版额度
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 5. 用户使用记录表（额度追踪）
-- ============================================
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES public.features(feature_key),
  
  -- 使用详情
  usage_count INTEGER DEFAULT 1,
  usage_date DATE DEFAULT CURRENT_DATE,
  
  -- 元数据
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 6. 初始化功能权限数据
-- ============================================
INSERT INTO public.features (feature_key, feature_name, description, free_quota, pro_quota) VALUES
  ('ai_weekly_report', 'AI 周报', '每周生成一次 AI 分析报告', 1, -1),
  ('ai_daily_insight', 'AI 每日洞察', '每日 AI 分析和建议', 0, -1),
  ('cloud_sync', '云端同步', '数据云端备份和同步', 1, -1),
  ('data_export', '数据导出', '导出 PDF/Excel 报告', 0, -1),
  ('advanced_stats', '高级统计', '高级数据分析和图表', 0, 1),
  ('custom_themes', '自定义主题', '个性化界面主题', 0, -1),
  ('priority_support', '优先客服', '优先获得技术支持', 0, -1),
  ('community_badge', '会员徽章', '广场显示 Pro 徽章', 0, 1),
  ('no_ads', '无广告', '去除界面广告', 0, 1)
ON CONFLICT (feature_key) DO NOTHING;

-- ============================================
-- 7. 设置 RLS 安全策略
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

-- profiles 表策略
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- subscriptions 表策略
CREATE POLICY "Users can view own subscriptions"
  ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

-- orders 表策略
CREATE POLICY "Users can view own orders"
  ON public.orders FOR SELECT USING (auth.uid() = user_id);

-- usage_logs 表策略
CREATE POLICY "Users can view own usage"
  ON public.usage_logs FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- 8. 函数和触发器
-- ============================================

-- 更新 updated_at 的触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建用户时自动创建 profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 监听新用户注册
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 9. 辅助函数
-- ============================================

-- 检查用户是否有权限使用某功能
CREATE OR REPLACE FUNCTION public.check_feature_access(
  p_user_id UUID,
  p_feature_key TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_tier TEXT;
  v_free_quota INTEGER;
  v_pro_quota INTEGER;
  v_usage_count INTEGER;
BEGIN
  -- 获取用户会员等级
  SELECT membership_tier INTO v_tier
  FROM public.profiles
  WHERE id = p_user_id;
  
  -- 获取功能配额
  SELECT free_quota, pro_quota 
  INTO v_free_quota, v_pro_quota
  FROM public.features
  WHERE feature_key = p_feature_key;
  
  -- Pro 用户检查
  IF v_tier = 'pro' OR v_tier = 'enterprise' THEN
    RETURN v_pro_quota != 0;  -- -1 或正数都允许
  END IF;
  
  -- 免费用户检查
  IF v_free_quota = -1 THEN
    RETURN true;
  ELSIF v_free_quota = 0 THEN
    RETURN false;
  ELSE
    -- 检查今日使用次数
    SELECT COALESCE(SUM(usage_count), 0) INTO v_usage_count
    FROM public.usage_logs
    WHERE user_id = p_user_id 
      AND feature_key = p_feature_key
      AND usage_date = CURRENT_DATE;
    
    RETURN v_usage_count < v_free_quota;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 记录功能使用
CREATE OR REPLACE FUNCTION public.log_feature_usage(
  p_user_id UUID,
  p_feature_key TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.usage_logs (user_id, feature_key, usage_count, metadata)
  VALUES (p_user_id, p_feature_key, 1, p_metadata)
  ON CONFLICT (user_id, feature_key, usage_date)
  DO UPDATE SET 
    usage_count = public.usage_logs.usage_count + 1,
    metadata = public.usage_logs.metadata || p_metadata;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 10. 索引优化
-- ============================================
CREATE INDEX IF NOT EXISTS idx_profiles_membership ON public.profiles(membership_tier);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_feature ON public.usage_logs(user_id, feature_key);
CREATE INDEX IF NOT EXISTS idx_usage_logs_date ON public.usage_logs(usage_date);
