# @finbiq/design-system v0.1.0

Single source: `tokens.json`. `tokens.css` is generated from it. `design-preview.html` at repo root is the visual reference.

## Use (local, no build step yet)
```html
<link rel="stylesheet" href="../packages/design-system/tokens.css">
```

## Components in preview (to build in Step 3+)
- BalanceCard, StatCard, BudgetBar (warn at >=75%), TransactionRow, SavingsGoalCard, AIInsightCard, RewardsBadge, ModeToggle (Personal/Business)
- Rules: AA contrast, 44px touch targets, `small` labels 12px uppercase, stat 24px/800.
