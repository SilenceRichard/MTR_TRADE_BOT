# MTR_TRADE_BOT 代码结构

## 目录结构

```
MTR_TRADE_BOT/
├── src/                # 源代码目录
│   ├── bot.ts         # 主程序入口点
│   ├── config.ts      # 配置文件
│   ├── wallet.ts      # 钱包主函数
│   ├── queryPools.ts  # 池查询功能
│   ├── handlers/      # 命令和消息处理程序
│   ├── services/      # 核心业务逻辑服务
│   │   └── positionService.ts  # 仓位相关功能，包括显示用户仓位列表和仓位详情
│   ├── ui/            # UI相关组件
│   ├── types/         # 类型定义
│   ├── api/           # API集成
│   │   ├── DLMM.ts    # Meteora DLMM API 
│   │   └── pool.ts    # 池查询API
│   ├── data/          # 数据存储目录
│   └── utils/         # 实用工具函数
│       ├── format.ts      # 格式化工具
│       ├── positionMonitor.ts # 仓位监控工具
│       ├── scheduler.ts   # 任务调度器
│       ├── tx.ts          # 交易相关工具
│       └── wallet.ts      # 钱包管理工具
├── models/            # 数据模型
│   ├── PositionStore.ts  # 仓位数据存储
│   └── UserWalletMap.ts  # 用户钱包映射
├── examples/          # 示例文件
└── package.json       # 项目依赖
```

## 主要组件

1. **bot.ts**: 主要的机器人逻辑和初始化代码
2. **config.ts**: 配置和类型定义
3. **wallet.ts**: 钱包主函数
4. **queryPools.ts**: 池查询功能
5. **handlers/**: 不同类型消息的处理程序
   - **commandHandlers.ts**: 处理机器人命令
   - **callbackHandlers.ts**: 处理内联键盘回调
   - **messageHandlers.ts**: 处理用户消息，包括代币交换(swap)功能实现
6. **services/**: 业务逻辑服务
   - **positionService.ts**: 仓位相关功能，包括显示用户仓位列表和仓位详情
7. **utils/**: 实用工具函数
8. **models/**: 数据模型和存储逻辑
9. **api/**: 外部API集成
   - **DLMM.ts**: Meteora DLMM SDK集成，包括创建仓位和交换代币功能
10. **data/**: 数据存储目录 