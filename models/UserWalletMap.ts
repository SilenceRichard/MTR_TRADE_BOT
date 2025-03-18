import fs from 'fs';
import path from 'path';

/**
 * 用户钱包映射接口
 */
export interface UserWalletMapping {
  chatId: number;           // Telegram 聊天ID
  walletAddresses: string[]; // 关联的钱包地址数组
  primaryWallet?: string;   // 主钱包地址(默认使用)
  createdAt: Date;          // 创建时间
  updatedAt: Date;          // 更新时间
  lastActive?: Date;        // 最后活跃时间
  name?: string;            // 用户名(如有)
  telegram_username?: string; // Telegram 用户名
}

/**
 * 用户钱包映射存储接口
 */
export interface UserWalletMapStorage {
  saveUserWalletMap(mapping: UserWalletMapping): Promise<void>;
  getUserWalletMap(chatId: number): Promise<UserWalletMapping | null>;
  getAllUserWalletMaps(): Promise<UserWalletMapping[]>;
  updateUserWalletMap(chatId: number, updates: Partial<UserWalletMapping>): Promise<void>;
  deleteUserWalletMap(chatId: number): Promise<void>;
  getWalletByChatId(chatId: number): Promise<string | null>; // 获取主钱包地址
  getChatIdsByWallet(walletAddress: string): Promise<number[]>; // 查找使用特定钱包的所有用户
  addWalletToChatId(chatId: number, walletAddress: string, setPrimary?: boolean): Promise<void>;
  removeWalletFromChatId(chatId: number, walletAddress: string): Promise<void>;
}

/**
 * 文件系统实现的用户钱包映射存储
 */
export class FileUserWalletMapStorage implements UserWalletMapStorage {
  private readonly dataPath: string;
  private readonly mappingsFile: string;
  private mappings: Record<number, UserWalletMapping> = {};

  constructor(dataPath: string = path.join(process.cwd(), 'data')) {
    this.dataPath = dataPath;
    this.mappingsFile = path.join(this.dataPath, 'user_wallet_mappings.json');
    this.loadMappings();
  }

  /**
   * 加载数据
   */
  private loadMappings(): void {
    try {
      if (fs.existsSync(this.mappingsFile)) {
        const data = fs.readFileSync(this.mappingsFile, 'utf8');
        const parsed = JSON.parse(data);
        // 转换日期字符串为Date对象
        this.mappings = Object.entries(parsed).reduce((acc, [chatId, mapping]) => {
          const typedMapping = mapping as UserWalletMapping;
          typedMapping.createdAt = new Date(typedMapping.createdAt);
          typedMapping.updatedAt = new Date(typedMapping.updatedAt);
          if (typedMapping.lastActive) {
            typedMapping.lastActive = new Date(typedMapping.lastActive);
          }
          acc[Number(chatId)] = typedMapping;
          return acc;
        }, {} as Record<number, UserWalletMapping>);
      }
    } catch (error) {
      console.error('加载用户钱包映射数据失败:', error);
      this.mappings = {};
    }
  }

  /**
   * 保存数据
   */
  private saveMappings(): void {
    try {
      if (!fs.existsSync(this.dataPath)) {
        fs.mkdirSync(this.dataPath, { recursive: true });
      }
      fs.writeFileSync(this.mappingsFile, JSON.stringify(this.mappings, null, 2));
    } catch (error) {
      console.error('保存用户钱包映射数据失败:', error);
    }
  }

  /**
   * 保存单个用户钱包映射
   */
  async saveUserWalletMap(mapping: UserWalletMapping): Promise<void> {
    this.mappings[mapping.chatId] = {
      ...mapping,
      updatedAt: new Date()
    };
    this.saveMappings();
  }

  /**
   * 根据聊天ID获取用户钱包映射
   */
  async getUserWalletMap(chatId: number): Promise<UserWalletMapping | null> {
    return this.mappings[chatId] || null;
  }

  /**
   * 获取所有用户钱包映射
   */
  async getAllUserWalletMaps(): Promise<UserWalletMapping[]> {
    return Object.values(this.mappings);
  }

  /**
   * 更新用户钱包映射
   */
  async updateUserWalletMap(chatId: number, updates: Partial<UserWalletMapping>): Promise<void> {
    if (this.mappings[chatId]) {
      this.mappings[chatId] = {
        ...this.mappings[chatId],
        ...updates,
        updatedAt: new Date()
      };
      this.saveMappings();
    }
  }

  /**
   * 删除用户钱包映射
   */
  async deleteUserWalletMap(chatId: number): Promise<void> {
    if (this.mappings[chatId]) {
      delete this.mappings[chatId];
      this.saveMappings();
    }
  }

  /**
   * 获取用户主钱包地址
   */
  async getWalletByChatId(chatId: number): Promise<string | null> {
    const mapping = this.mappings[chatId];
    if (!mapping) return null;
    
    // 优先返回主钱包地址，如果没有则返回第一个钱包地址
    return mapping.primaryWallet || (mapping.walletAddresses.length > 0 ? mapping.walletAddresses[0] : null);
  }

  /**
   * 查找使用特定钱包的所有用户
   */
  async getChatIdsByWallet(walletAddress: string): Promise<number[]> {
    return Object.values(this.mappings)
      .filter(mapping => mapping.walletAddresses.includes(walletAddress))
      .map(mapping => mapping.chatId);
  }

  /**
   * 为用户添加钱包地址
   */
  async addWalletToChatId(chatId: number, walletAddress: string, setPrimary: boolean = false): Promise<void> {
    // 检查映射是否存在
    if (!this.mappings[chatId]) {
      // 创建新的映射
      this.mappings[chatId] = {
        chatId,
        walletAddresses: [walletAddress],
        primaryWallet: setPrimary ? walletAddress : undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastActive: new Date()
      };
    } else {
      // 更新现有映射
      const mapping = this.mappings[chatId];
      
      // 如果钱包地址不存在则添加
      if (!mapping.walletAddresses.includes(walletAddress)) {
        mapping.walletAddresses.push(walletAddress);
      }
      
      // 如果需要设置为主钱包
      if (setPrimary) {
        mapping.primaryWallet = walletAddress;
      }
      
      mapping.updatedAt = new Date();
      mapping.lastActive = new Date();
    }
    
    this.saveMappings();
  }

  /**
   * 从用户移除钱包地址
   */
  async removeWalletFromChatId(chatId: number, walletAddress: string): Promise<void> {
    if (!this.mappings[chatId]) return;
    
    const mapping = this.mappings[chatId];
    
    // 移除钱包地址
    mapping.walletAddresses = mapping.walletAddresses.filter(addr => addr !== walletAddress);
    
    // 如果被移除的是主钱包，则更新主钱包
    if (mapping.primaryWallet === walletAddress) {
      mapping.primaryWallet = mapping.walletAddresses.length > 0 ? mapping.walletAddresses[0] : undefined;
    }
    
    mapping.updatedAt = new Date();
    
    this.saveMappings();
  }
} 