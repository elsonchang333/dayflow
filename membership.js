/**
 * DayFlow 会员系统 JavaScript 框架
 * Membership System Framework
 */

// ============================================
// 1. 会员配置
// ============================================
const MEMBERSHIP_CONFIG = {
  TIERS: {
    FREE: {
      id: 'free',
      name: '免费版',
      price: 0,
      features: [
        '基础记录功能',
        'AI 周报（每周1次）',
        '云端同步（3个月）',
        '广场发帖'
      ]
    },
    PRO: {
      id: 'pro',
      name: 'Pro 版',
      price: 18, // CNY/月
      yearlyPrice: 168, // CNY/年
      features: [
        '所有免费功能',
        'AI 每日洞察',
        '无限云端存储',
        '数据导出（PDF/Excel）',
        '高级统计分析',
        '自定义主题',
        '会员徽章',
        '优先客服',
        '无广告'
      ]
    }
  },
  
  // 功能权限配置
  FEATURES: {
    AI_WEEKLY_REPORT: { key: 'ai_weekly_report', name: 'AI 周报', freeQuota: 1 },
    AI_DAILY_INSIGHT: { key: 'ai_daily_insight', name: 'AI 每日洞察', freeQuota: 0 },
    CLOUD_SYNC: { key: 'cloud_sync', name: '云端同步', freeQuota: 1 },
    DATA_EXPORT: { key: 'data_export', name: '数据导出', freeQuota: 0 },
    ADVANCED_STATS: { key: 'advanced_stats', name: '高级统计', freeQuota: 0 },
    CUSTOM_THEMES: { key: 'custom_themes', name: '自定义主题', freeQuota: 0 },
    PRIORITY_SUPPORT: { key: 'priority_support', name: '优先客服', freeQuota: 0 },
    COMMUNITY_BADGE: { key: 'community_badge', name: '会员徽章', freeQuota: 0 },
    NO_ADS: { key: 'no_ads', name: '无广告', freeQuota: 0 }
  }
};

// ============================================
// 2. 会员状态管理
// ============================================
const MembershipManager = {
  currentUser: null,
  userProfile: null,
  subscription: null,
  usageCache: {},
  
  // 初始化
  async init() {
    await this.loadCurrentUser();
    await this.loadUserProfile();
    await this.loadSubscription();
    this.setupAuthListener();
  },
  
  // 获取当前登录用户
  async loadCurrentUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    this.currentUser = user;
    return user;
  },
  
  // 加载用户资料
  async loadUserProfile() {
    if (!this.currentUser) return null;
    
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', this.currentUser.id)
      .single();
    
    if (error) {
      console.error('加载用户资料失败:', error);
      return null;
    }
    
    this.userProfile = data;
    return data;
  },
  
  // 加载订阅信息
  async loadSubscription() {
    if (!this.currentUser) return null;
    
    const { data, error } = await supabaseClient
      .from('subscriptions')
      .select('*')
      .eq('user_id', this.currentUser.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('加载订阅失败:', error);
    }
    
    this.subscription = data;
    return data;
  },
  
  // 监听登录状态变化
  setupAuthListener() {
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN') {
        this.currentUser = session.user;
        this.loadUserProfile();
        this.loadSubscription();
      } else if (event === 'SIGNED_OUT') {
        this.currentUser = null;
        this.userProfile = null;
        this.subscription = null;
      }
    });
  },
  
  // 获取会员等级
  getTier() {
    return this.userProfile?.membership_tier || 'free';
  },
  
  // 检查是否是 Pro 会员
  isPro() {
    return this.getTier() === 'pro' || this.getTier() === 'enterprise';
  },
  
  // 检查会员是否有效
  isMembershipValid() {
    if (this.getTier() === 'free') return true;
    
    const expiresAt = this.userProfile?.membership_expires_at;
    if (!expiresAt) return false;
    
    return new Date(expiresAt) > new Date();
  }
};

// ============================================
// 3. 权限检查系统
// ============================================
const PermissionManager = {
  // 检查是否有权限使用某功能
  async checkAccess(featureKey) {
    const tier = MembershipManager.getTier();
    
    // Pro 用户默认有权限
    if (tier === 'pro' || tier === 'enterprise') {
      return { allowed: true, reason: null };
    }
    
    // 免费用户检查配额
    const feature = Object.values(MEMBERSHIP_CONFIG.FEATURES)
      .find(f => f.key === featureKey);
    
    if (!feature) {
      return { allowed: false, reason: '功能不存在' };
    }
    
    if (feature.freeQuota === 0) {
      return { 
        allowed: false, 
        reason: 'PRO_FEATURE',
        upgradeMessage: `${feature.name} 是 Pro 功能，升级即可使用`
      };
    }
    
    // 检查今日使用次数
    const usage = await this.getTodayUsage(featureKey);
    if (usage >= feature.freeQuota) {
      return { 
        allowed: false, 
        reason: 'QUOTA_EXCEEDED',
        upgradeMessage: `今日 ${feature.name} 次数已用完，升级 Pro 获得无限次`
      };
    }
    
    return { allowed: true, remaining: feature.freeQuota - usage };
  },
  
  // 获取今日使用次数
  async getTodayUsage(featureKey) {
    if (!MembershipManager.currentUser) return 0;
    
    const { data, error } = await supabaseClient
      .from('usage_logs')
      .select('usage_count')
      .eq('user_id', MembershipManager.currentUser.id)
      .eq('feature_key', featureKey)
      .eq('usage_date', new Date().toISOString().split('T')[0])
      .single();
    
    if (error || !data) return 0;
    return data.usage_count || 0;
  },
  
  // 记录功能使用
  async logUsage(featureKey, metadata = {}) {
    if (!MembershipManager.currentUser) return;
    
    await supabaseClient.rpc('log_feature_usage', {
      p_user_id: MembershipManager.currentUser.id,
      p_feature_key: featureKey,
      p_metadata: metadata
    });
  },
  
  // 检查并执行（带权限检查）
  async checkAndExecute(featureKey, executeFn, fallbackFn = null) {
    const access = await this.checkAccess(featureKey);
    
    if (access.allowed) {
      await this.logUsage(featureKey);
      return executeFn();
    } else {
      if (fallbackFn) {
        return fallbackFn(access);
      } else {
        // 默认显示升级提示
        showUpgradeModal(access.upgradeMessage);
      }
    }
  }
};

// ============================================
// 4. UI 组件
// ============================================
const MembershipUI = {
  // 显示升级弹窗
  showUpgradeModal(message) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'upgradeModal';
    modal.innerHTML = `
      <div class="modal-content" style="max-width: 400px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px;">✨</div>
        <h3 style="margin-bottom: 12px; color: #1e293b;">升级 Pro 版</h3>
        <p style="color: #64748b; margin-bottom: 24px; line-height: 1.6;">${message}</p>
        
        <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); padding: 16px; border-radius: 12px; margin-bottom: 20px;">
          <div style="font-size: 24px; font-weight: 700; color: #92400e;">¥18<span style="font-size: 14px; font-weight: 400;">/月</span></div>
          <div style="font-size: 13px; color: #b45309; margin-top: 4px;">解锁所有高级功能</div>
        </div>
        
        <button onclick="MembershipUI.showPricingPage()" style="width: 100%; padding: 14px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; margin-bottom: 12px;">
          查看详情
        </button>
        <button onclick="closeModal('upgradeModal')" style="width: 100%; padding: 12px; background: transparent; color: #64748b; border: none; font-size: 14px; cursor: pointer;">
          稍后再说
        </button>
      </div>
    `;
    document.body.appendChild(modal);
  },
  
  // 显示定价页面
  showPricingPage() {
    closeModal('upgradeModal');
    showPage('pricing');
    this.renderPricingPage();
  },
  
  // 渲染定价页面
  renderPricingPage() {
    const container = document.getElementById('pricing-page');
    if (!container) {
      // 如果页面不存在，创建它
      this.createPricingPage();
      return;
    }
    
    // 更新当前会员状态显示
    const tier = MembershipManager.getTier();
    const statusBadge = container.querySelector('.current-status');
    if (statusBadge) {
      statusBadge.textContent = tier === 'pro' ? '当前：Pro 会员' : '当前：免费版';
      statusBadge.className = `current-status ${tier}`;
    }
  },
  
  // 创建定价页面（如果不存在）
  createPricingPage() {
    const page = document.createElement('div');
    page.className = 'page';
    page.id = 'pricing-page';
    page.innerHTML = `
      <div class="header" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 60px 20px 40px;">
        <div style="text-align: center;">
          <div style="font-size: 32px; font-weight: 700; color: white; margin-bottom: 8px;">选择你的计划</div>
          <div style="color: rgba(255,255,255,0.8);">解锁更多强大功能</div>
          <div class="current-status free" style="display: inline-block; margin-top: 16px; padding: 6px 16px; background: rgba(255,255,255,0.2); border-radius: 20px; color: white; font-size: 14px;">当前：免费版</div>
        </div>
      </div>
      
      <div style="padding: 24px 16px;">
        <!-- Pro 版卡片 -->
        <div style="background: white; border-radius: 24px; padding: 28px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 2px solid #667eea; position: relative; overflow: hidden;">
          <div style="position: absolute; top: 12px; right: 12px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600;">推荐</div>
          
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="font-size: 20px; font-weight: 700; color: #1e293b; margin-bottom: 4px;">Pro 版</div>
            <div style="font-size: 14px; color: #64748b;">适合认真记录的你</div>
          </div>
          
          <div style="text-align: center; margin-bottom: 24px;">
            <span style="font-size: 48px; font-weight: 700; background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">¥18</span>
            <span style="color: #94a3b8;">/月</span>
          </div>
          
          <div style="margin-bottom: 24px;">
            ${MEMBERSHIP_CONFIG.TIERS.PRO.features.map(f => `
              <div style="display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
                <div style="width: 24px; height: 24px; background: linear-gradient(135deg, #d1fae5, #a7f3d0); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px;">✓</div>
                <span style="font-size: 14px; color: #374151;">${f}</span>
              </div>
            `).join('')}
          </div>
          
          <button onclick="MembershipUI.initiateCheckout()" style="width: 100%; padding: 16px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border: none; border-radius: 16px; font-size: 16px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(102,126,234,0.3);">
            升级到 Pro
          </button>
        </div>
        
        <!-- 免费版对比 -->
        <div style="margin-top: 20px; background: #f8fafc; border-radius: 20px; padding: 24px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="font-size: 18px; font-weight: 600; color: #64748b;">免费版</div>
          </div>
          <div>
            ${MEMBERSHIP_CONFIG.TIERS.FREE.features.map(f => `
              <div style="display: flex; align-items: center; gap: 12px; padding: 8px 0; color: #64748b; font-size: 14px;">
                <div style="width: 20px; height: 20px; background: #e2e8f0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px;">✓</div>
                ${f}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
    
    document.body.insertBefore(page, document.querySelector('.bottom-nav'));
    showPage('pricing');
  },
  
  // 发起支付
  async initiateCheckout() {
    // TODO: 集成 Stripe/支付宝/微信支付
    console.log('Initiating checkout...');
    showToast('支付功能开发中，敬请期待！');
  }
};

// ============================================
// 5. 初始化
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // 初始化会员系统
  MembershipManager.init();
});

// 全局暴露
window.MembershipManager = MembershipManager;
window.PermissionManager = PermissionManager;
window.MembershipUI = MembershipUI;
window.MEMBERSHIP_CONFIG = MEMBERSHIP_CONFIG;
