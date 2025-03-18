import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { Connection } from '@solana/web3.js';
import { RPC } from '../config';

// 定时任务管理器类型定义
export interface ScheduledTask {
  id: string;              // 任务ID
  name: string;            // 任务名称
  interval: number;        // 执行间隔(毫秒)
  enabled: boolean;        // 是否启用
  lastRunTime?: Date;      // 上次执行时间
  nextRunTime?: Date;      // 下次执行时间
  fn: () => Promise<any>;  // 任务函数
  retryAttempts: number;   // 重试次数
  maxRetries: number;      // 最大重试次数
  retryDelay: number;      // 重试延迟(毫秒)
  timeout?: number;        // 任务超时时间(毫秒)
  runningPromise?: Promise<any>; // 正在运行的Promise
}

// 日志级别
export enum LogLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  DEBUG = 'DEBUG',
}

// 日志条目
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  metadata?: Record<string, any>;
}

/**
 * 任务调度器 - 管理定时任务的执行
 */
export class TaskScheduler extends EventEmitter {
  private tasks: Map<string, ScheduledTask> = new Map();
  private running: boolean = false;
  private pollInterval: number = 1000; // 默认轮询间隔1秒
  private logPath: string;
  private connection: Connection;
  private taskConfigPath: string;
  
  constructor(
    logDir: string = path.join(process.cwd(), 'data', 'logs'),
    configDir: string = path.join(process.cwd(), 'data')
  ) {
    super();
    
    // 创建日志目录
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    this.logPath = path.join(logDir, `scheduler_${new Date().toISOString().split('T')[0]}.log`);
    this.taskConfigPath = path.join(configDir, 'tasks.json');
    this.connection = new Connection(RPC, 'confirmed');
    
    // 加载任务配置
    this.loadTasks();
  }
  
  /**
   * 注册一个新的定时任务
   */
  public registerTask(task: Omit<ScheduledTask, 'id'>): string {
    const id = `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newTask: ScheduledTask = {
      ...task,
      id,
      retryAttempts: 0,
      nextRunTime: new Date(Date.now() + task.interval)
    };
    
    this.tasks.set(id, newTask);
    this.log(LogLevel.INFO, `Task registered: ${task.name}`, { taskId: id, interval: task.interval });
    this.saveTasks();
    
    return id;
  }
  
  /**
   * 开始任务调度
   */
  public start(): void {
    if (this.running) return;
    
    this.log(LogLevel.INFO, 'Task scheduler started');
    this.running = true;
    this.poll();
  }
  
  /**
   * 停止任务调度
   */
  public stop(): void {
    this.log(LogLevel.INFO, 'Task scheduler stopped');
    this.running = false;
  }
  
  /**
   * 更新任务配置
   */
  public updateTask(id: string, updates: Partial<ScheduledTask>): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;
    
    // 更新任务
    Object.assign(task, updates);
    
    // 如果修改了间隔，更新下次执行时间
    if (updates.interval && task.lastRunTime) {
      task.nextRunTime = new Date(task.lastRunTime.getTime() + updates.interval);
    }
    
    this.log(LogLevel.INFO, `Task updated: ${task.name}`, { taskId: id, updates });
    this.saveTasks();
    
    return true;
  }
  
  /**
   * 删除任务
   */
  public removeTask(id: string): boolean {
    const result = this.tasks.delete(id);
    if (result) {
      this.log(LogLevel.INFO, `Task removed`, { taskId: id });
      this.saveTasks();
    }
    return result;
  }
  
  /**
   * 获取所有任务
   */
  public getTasks(): ScheduledTask[] {
    return Array.from(this.tasks.values());
  }
  
  /**
   * 获取单个任务
   */
  public getTask(id: string): ScheduledTask | undefined {
    return this.tasks.get(id);
  }
  
  /**
   * 立即执行任务
   */
  public async runTaskNow(id: string): Promise<any> {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    
    return this.executeTask(task);
  }
  
  /**
   * 记录日志
   */
  public log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      metadata
    };
    
    // 输出到控制台
    const timestamp = logEntry.timestamp.toISOString();
    console.log(`[${timestamp}] [${level}] ${message}`);
    
    if (metadata) {
      console.log(JSON.stringify(metadata, null, 2));
    }
    
    // 写入日志文件
    const logLine = `[${timestamp}] [${level}] ${message} ${metadata ? JSON.stringify(metadata) : ''}\n`;
    fs.appendFileSync(this.logPath, logLine);
    
    // 发出事件
    this.emit('log', logEntry);
  }
  
  /**
   * 轮询检查需要执行的任务
   */
  private poll(): void {
    if (!this.running) return;
    
    const now = new Date();
    
    // 检查所有任务
    this.tasks.forEach(task => {
      if (!task.enabled) return;
      
      // 如果任务正在运行，检查是否超时
      if (task.runningPromise && task.timeout) {
        const timeElapsed = task.lastRunTime ? now.getTime() - task.lastRunTime.getTime() : 0;
        if (timeElapsed > task.timeout) {
          this.log(LogLevel.WARNING, `Task timed out: ${task.name}`, { 
            taskId: task.id, 
            timeElapsed,
            timeout: task.timeout 
          });
          
          // 重置任务状态
          delete task.runningPromise;
          task.nextRunTime = new Date(now.getTime() + task.interval);
        }
      }
      
      // 检查是否应该执行任务
      if (!task.runningPromise && task.nextRunTime && now >= task.nextRunTime) {
        this.executeTask(task).catch(err => {
          this.log(LogLevel.ERROR, `Error executing task: ${task.name}`, {
            taskId: task.id,
            error: err.message,
            stack: err.stack
          });
        });
      }
    });
    
    // 设置下一次轮询
    setTimeout(() => this.poll(), this.pollInterval);
  }
  
  /**
   * 执行任务
   */
  private async executeTask(task: ScheduledTask): Promise<any> {
    const now = new Date();
    
    // 更新任务状态
    task.lastRunTime = now;
    task.nextRunTime = new Date(now.getTime() + task.interval);
    
    this.log(LogLevel.INFO, `Executing task: ${task.name}`, { 
      taskId: task.id, 
      startTime: now.toISOString(),
      nextRunTime: task.nextRunTime.toISOString()
    });
    
    // 执行任务
    try {
      task.runningPromise = task.fn();
      const result = await task.runningPromise;
      
      // 任务成功，重置重试计数
      task.retryAttempts = 0;
      
      this.log(LogLevel.INFO, `Task completed: ${task.name}`, { 
        taskId: task.id, 
        duration: Date.now() - now.getTime(),
      });
      
      // 清除运行中的Promise
      delete task.runningPromise;
      
      // 发出任务完成事件
      this.emit('taskComplete', { taskId: task.id, name: task.name, result });
      
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      // 记录错误
      this.log(LogLevel.ERROR, `Task failed: ${task.name}`, { 
        taskId: task.id, 
        error: errorMsg,
        retryAttempt: task.retryAttempts,
        maxRetries: task.maxRetries
      });
      
      // 清除运行中的Promise
      delete task.runningPromise;
      
      // 检查是否需要重试
      if (task.retryAttempts < task.maxRetries) {
        task.retryAttempts++;
        const retryDelay = task.retryDelay * Math.pow(2, task.retryAttempts - 1); // 指数退避
        task.nextRunTime = new Date(Date.now() + retryDelay);
        
        this.log(LogLevel.INFO, `Scheduling retry for task: ${task.name}`, { 
          taskId: task.id, 
          retryAttempt: task.retryAttempts,
          retryDelay,
          nextRetryTime: task.nextRunTime.toISOString()
        });
      } else {
        // 重置重试计数
        task.retryAttempts = 0;
        
        // 发出任务失败事件
        this.emit('taskFailed', { 
          taskId: task.id, 
          name: task.name, 
          error: errorMsg 
        });
      }
      
      throw error;
    }
  }
  
  /**
   * 加载任务配置
   */
  private loadTasks(): void {
    try {
      if (!fs.existsSync(this.taskConfigPath)) {
        this.log(LogLevel.INFO, 'No task configuration found. Using defaults.');
        return;
      }
      
      const tasksData = JSON.parse(fs.readFileSync(this.taskConfigPath, 'utf8'));
      
      if (Array.isArray(tasksData)) {
        tasksData.forEach(taskData => {
          // 跳过没有处理函数的任务（这些需要通过代码注册）
          if (taskData.fnName) {
            this.log(LogLevel.INFO, `Found task in config: ${taskData.name}`, { taskId: taskData.id });
          }
        });
      }
    } catch (error) {
      this.log(LogLevel.ERROR, 'Error loading tasks', { error: String(error) });
    }
  }
  
  /**
   * 保存任务配置
   */
  private saveTasks(): void {
    try {
      const tasksData = Array.from(this.tasks.values()).map(task => {
        // 删除函数和Promise，只保存可序列化的数据
        const { fn, runningPromise, ...taskData } = task;
        
        return {
          ...taskData,
          lastRunTime: task.lastRunTime?.toISOString(),
          nextRunTime: task.nextRunTime?.toISOString(),
        };
      });
      
      fs.writeFileSync(this.taskConfigPath, JSON.stringify(tasksData, null, 2));
    } catch (error) {
      this.log(LogLevel.ERROR, 'Error saving tasks', { error: String(error) });
    }
  }
}

// 单例模式导出
const taskScheduler = new TaskScheduler();
export default taskScheduler; 