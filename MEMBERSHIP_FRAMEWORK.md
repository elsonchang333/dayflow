# DayFlow 会员系统框架

## 📁 文件结构

```
dayflow-zeabur/
├── supabase_membership.sql    # 数据库表结构
├── membership.js              # 前端会员系统框架
└── index.html                 # 需要引入 membership.js
```

## 🚀 快速开始

### 1. 创建数据库表
在 Supabase SQL Editor 中运行 `supabase_membership.sql`

### 2. 引入 JS 文件
在 `index.html` 的 `<head>` 或底部添加：
```html
<script src="membership.js"></script>
```

### 3. 初始化完成
系统会自动初始化，无需额外配置

---

## 📊 数据库表结构

| 表名 | 用途 |
|------|------|
| `profiles` | 用户资料 + 会员信息 |
| `subscriptions` | 订阅记录 |
| `orders` | 订单记录 |
| `features` | 功能权限配置 |
| `usage_logs` | 用户使用记录 |

---

## 💻 前端 API 使用

### 检查会员等级
```javascript
const tier = MembershipManager.getTier();  // 'free' | 'pro' | 'enterprise'
const isPro = MembershipManager.isPro();   // true | false
```

### 检查功能权限
```javascript
// 异步检查
const access = await PermissionManager.checkAccess('ai_daily_insight');
if (access.allowed) {
  // 执行功能
} else {
  // 显示升级提示
  MembershipUI.showUpgradeModal(access.upgradeMessage);
}

// 自动检查并执行
await PermissionManager.checkAndExecute(
  'ai_daily_insight',
  () => { /* 有权限时的操作 */ },
  (access) => { /* 无权限时的操作 */ }
);
```

### 记录功能使用
```javascript
await PermissionManager.logUsage('ai_weekly_report', {
  report_type: 'weekly',
  score: 85
});
```

---

## 🎨 UI 组件

### 显示升级弹窗
```javascript
MembershipUI.showUpgradeModal('AI 每日洞察是 Pro 功能');
```

### 显示定价页面
```javascript
MembershipUI.showPricingPage();
```

---

## ⚙️ 功能配置

在 `MEMBERSHIP_CONFIG.FEATURES` 中配置功能权限：

```javascript
FEATURES: {
  AI_WEEKLY_REPORT: { 
    key: 'ai_weekly_report', 
    name: 'AI 周报', 
    freeQuota: 1        // 免费版每周1次
  },
  AI_DAILY_INSIGHT: { 
    key: 'ai_daily_insight', 
    name: 'AI 每日洞察', 
    freeQuota: 0        // 免费版不可用
  },
  CLOUD_SYNC: { 
    key: 'cloud_sync', 
    name: '云端同步', 
    freeQuota: -1       // -1 = 无限次
  }
}
```

---

## 💰 价格配置

```javascript
TIERS: {
  PRO: {
    id: 'pro',
    name: 'Pro 版',
    price: 18,          // 月付价格 CNY
    yearlyPrice: 168    // 年付价格 CNY
  }
}
```

---

## 🔒 权限检查流程

1. 用户点击功能按钮
2. 调用 `PermissionManager.checkAccess(featureKey)`
3. 系统检查：
   - 用户会员等级
   - 功能免费额度
   - 今日已使用次数
4. 返回结果：
   - `allowed: true` → 执行功能
   - `allowed: false` → 显示升级提示

---

## 📝 下一步开发

### 待完成
- [ ] 支付集成（Stripe/支付宝/微信）
- [ ] 会员中心页面
- [ ] 订单历史页面
- [ ] 续费提醒功能
- [ ] 优惠券系统

### 已有功能
- [x] 数据库表结构
- [x] 权限检查框架
- [x] 使用记录追踪
- [x] 升级提示 UI
- [x] 定价页面

---

## 🎯 使用示例

### 在 AI 洞察页面添加权限检查
```javascript
// 在生成周报前检查权限
async function generateWeeklyReport() {
  await PermissionManager.checkAndExecute(
    'ai_weekly_report',
    async () => {
      // 有权限，生成报告
      const report = await createReport();
      displayReport(report);
    },
    (access) => {
      // 无权限，显示提示
      console.log('需要升级:', access.upgradeMessage);
    }
  );
}
```

### 在广场显示会员徽章
```javascript
const profile = MembershipManager.userProfile;
if (profile.membership_tier === 'pro') {
  showBadge('Pro');
}
```

---

**框架已搭建完成，可以开始集成支付功能！** 🚀
