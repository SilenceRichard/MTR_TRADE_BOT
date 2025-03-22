import { UserWalletMapping, UserWalletMapStorage } from './UserWalletMap';
import { prisma } from '../lib/prisma';

/**
 * 基于Prisma ORM的用户钱包映射存储实现
 */
export class PrismaUserWalletMapStorage implements UserWalletMapStorage {
  /**
   * 将JSON字符串转换为字符串数组
   */
  private parseWalletAddresses(walletAddresses: string): string[] {
    try {
      return JSON.parse(walletAddresses);
    } catch (error) {
      console.error('解析钱包地址失败:', error);
      return [];
    }
  }

  /**
   * 将字符串数组转换为JSON字符串
   */
  private stringifyWalletAddresses(walletAddresses: string[]): string {
    return JSON.stringify(walletAddresses);
  }

  /**
   * 将数据库对象转换为UserWalletMapping对象
   */
  private convertDbToUserWalletMap(dbMapping: any): UserWalletMapping {
    return {
      chatId: dbMapping.chatId,
      walletAddresses: this.parseWalletAddresses(dbMapping.walletAddresses),
      primaryWallet: dbMapping.primaryWallet,
      createdAt: dbMapping.createdAt,
      updatedAt: dbMapping.updatedAt,
      lastActive: dbMapping.lastActive,
      name: dbMapping.name,
      telegram_username: dbMapping.telegram_username,
    };
  }

  /**
   * 保存用户钱包映射
   */
  public async saveUserWalletMap(mapping: UserWalletMapping): Promise<void> {
    await prisma.userWalletMapping.upsert({
      where: { chatId: mapping.chatId },
      update: {
        walletAddresses: this.stringifyWalletAddresses(mapping.walletAddresses),
        primaryWallet: mapping.primaryWallet,
        updatedAt: new Date(),
        lastActive: mapping.lastActive,
        name: mapping.name,
        telegram_username: mapping.telegram_username,
      },
      create: {
        chatId: mapping.chatId,
        walletAddresses: this.stringifyWalletAddresses(mapping.walletAddresses),
        primaryWallet: mapping.primaryWallet,
        createdAt: mapping.createdAt || new Date(),
        updatedAt: mapping.updatedAt || new Date(),
        lastActive: mapping.lastActive,
        name: mapping.name,
        telegram_username: mapping.telegram_username,
      },
    });
  }

  /**
   * 根据聊天ID获取用户钱包映射
   */
  public async getUserWalletMap(chatId: number): Promise<UserWalletMapping | null> {
    const dbMapping = await prisma.userWalletMapping.findUnique({
      where: { chatId },
    });

    if (!dbMapping) {
      return null;
    }

    return this.convertDbToUserWalletMap(dbMapping);
  }

  /**
   * 获取所有用户钱包映射
   */
  public async getAllUserWalletMaps(): Promise<UserWalletMapping[]> {
    const dbMappings = await prisma.userWalletMapping.findMany();
    return dbMappings.map(mapping => this.convertDbToUserWalletMap(mapping));
  }

  /**
   * 更新用户钱包映射
   */
  public async updateUserWalletMap(chatId: number, updates: Partial<UserWalletMapping>): Promise<void> {
    const mapping = await this.getUserWalletMap(chatId);
    if (!mapping) {
      throw new Error(`用户映射 chatId=${chatId} 未找到`);
    }

    const updateData: any = {
      updatedAt: new Date(),
    };

    if (updates.walletAddresses !== undefined) {
      updateData.walletAddresses = this.stringifyWalletAddresses(updates.walletAddresses);
    }

    if (updates.primaryWallet !== undefined) {
      updateData.primaryWallet = updates.primaryWallet;
    }

    if (updates.lastActive !== undefined) {
      updateData.lastActive = updates.lastActive;
    }

    if (updates.name !== undefined) {
      updateData.name = updates.name;
    }

    if (updates.telegram_username !== undefined) {
      updateData.telegram_username = updates.telegram_username;
    }

    await prisma.userWalletMapping.update({
      where: { chatId },
      data: updateData,
    });
  }

  /**
   * 删除用户钱包映射
   */
  public async deleteUserWalletMap(chatId: number): Promise<void> {
    await prisma.userWalletMapping.delete({
      where: { chatId },
    });
  }

  /**
   * 获取用户主钱包地址
   */
  public async getWalletByChatId(chatId: number): Promise<string | null> {
    const mapping = await this.getUserWalletMap(chatId);
    if (!mapping) {
      return null;
    }

    // 优先返回主钱包地址，如果没有则返回第一个钱包地址
    return mapping.primaryWallet || (mapping.walletAddresses.length > 0 ? mapping.walletAddresses[0] : null);
  }

  /**
   * 查找使用特定钱包的所有用户
   */
  public async getChatIdsByWallet(walletAddress: string): Promise<number[]> {
    const allMappings = await this.getAllUserWalletMaps();
    return allMappings
      .filter(mapping => mapping.walletAddresses.includes(walletAddress))
      .map(mapping => mapping.chatId);
  }

  /**
   * 为用户添加钱包地址
   */
  public async addWalletToChatId(chatId: number, walletAddress: string, setPrimary: boolean = false): Promise<void> {
    const mapping = await this.getUserWalletMap(chatId);
    const now = new Date();

    if (!mapping) {
      // 创建新的映射
      await this.saveUserWalletMap({
        chatId,
        walletAddresses: [walletAddress],
        primaryWallet: setPrimary ? walletAddress : undefined,
        createdAt: now,
        updatedAt: now,
        lastActive: now,
      });
    } else {
      // 更新现有映射
      const walletAddresses = [...mapping.walletAddresses];
      
      // 如果钱包地址不存在则添加
      if (!walletAddresses.includes(walletAddress)) {
        walletAddresses.push(walletAddress);
      }
      
      // 更新数据
      await this.updateUserWalletMap(chatId, {
        walletAddresses,
        primaryWallet: setPrimary ? walletAddress : mapping.primaryWallet,
        lastActive: now,
      });
    }
  }

  /**
   * 从用户移除钱包地址
   */
  public async removeWalletFromChatId(chatId: number, walletAddress: string): Promise<void> {
    const mapping = await this.getUserWalletMap(chatId);
    if (!mapping) {
      return;
    }

    // 移除钱包地址
    const walletAddresses = mapping.walletAddresses.filter(addr => addr !== walletAddress);
    
    // 如果被移除的是主钱包，则更新主钱包
    let primaryWallet = mapping.primaryWallet;
    if (mapping.primaryWallet === walletAddress) {
      primaryWallet = walletAddresses.length > 0 ? walletAddresses[0] : undefined;
    }
    
    // 更新数据
    await this.updateUserWalletMap(chatId, {
      walletAddresses,
      primaryWallet,
      updatedAt: new Date(),
    });
  }
} 