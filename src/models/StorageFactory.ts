import path from 'path';
import { 
  PositionStorage, 
  UserWalletMapStorage, 
  FilePositionStorage, 
  FileUserWalletMapStorage, 
  PrismaPositionStorage, 
  PrismaUserWalletMapStorage 
} from './';

/**
 * 存储类型枚举
 */
export enum StorageType {
  FILE = 'file',     // 基于文件存储
  PRISMA = 'prisma'  // 基于Prisma ORM存储
}

/**
 * 存储工厂类 - 负责创建合适的存储实现
 */
export class StorageFactory {
  /**
   * 获取仓位存储实现
   * @param type 存储类型
   * @param dataDir 数据目录(当type为FILE时使用)
   */
  static getPositionStorage(
    type: StorageType = StorageType.FILE,
    dataDir: string = path.join(process.cwd(), 'src', 'data')
  ): PositionStorage {
    switch (type) {
      case StorageType.PRISMA:
        return new PrismaPositionStorage();
      case StorageType.FILE:
      default:
        return new FilePositionStorage(dataDir);
    }
  }

  /**
   * 获取用户钱包映射存储实现
   * @param type 存储类型
   * @param dataDir 数据目录(当type为FILE时使用)
   */
  static getUserWalletMapStorage(
    type: StorageType = StorageType.FILE,
    dataDir: string = path.join(process.cwd(), 'src', 'data')
  ): UserWalletMapStorage {
    switch (type) {
      case StorageType.PRISMA:
        return new PrismaUserWalletMapStorage();
      case StorageType.FILE:
      default:
        return new FileUserWalletMapStorage(dataDir);
    }
  }

  /**
   * 根据环境变量获取合适的存储类型
   */
  static getStorageTypeFromEnv(): StorageType {
    const storageType = process.env.STORAGE_TYPE?.toLowerCase();
    if (storageType === 'prisma') {
      return StorageType.PRISMA;
    }
    return StorageType.FILE;
  }
} 