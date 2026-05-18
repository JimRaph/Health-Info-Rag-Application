import { Mutex } from 'async-mutex';

interface RateLimitData {
  count: number;
  resetTime: number; 
}

class RateLimitService {
  private ipRequests: Map<string, RateLimitData> = new Map();
  private userRequests: Map<string, RateLimitData> = new Map();
  private readonly mutex = new Mutex(); 


  private readonly WINDOW_MS = 120 * 1000;
  public readonly MAX_REQUESTS = 10;

  private readonly CLEANUP_INTERVAL_MS = 10 * 60 * 1000; 
  private cleanupTimer: NodeJS.Timeout | null = null;

constructor() {
    this.startCleanup();
  }


  private async cleanupScheduled(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
        const now = Date.now();
        
        for (const [ip, data] of this.ipRequests.entries()) {
            if (now > data.resetTime) {
                this.ipRequests.delete(ip);
            }
        }
        
        for (const [userId, data] of this.userRequests.entries()) {
            if (now > data.resetTime) {
                this.userRequests.delete(userId);
            }
        }

    } finally {
        release();
    }
  }

  private startCleanup(): void {
    if (this.cleanupTimer) return; 

    this.cleanupTimer = setInterval(() => {
        this.cleanupScheduled().catch(err => {
            console.error('[RateLimitService] Cleanup failed:', err);
        });
    }, this.CLEANUP_INTERVAL_MS);
    
    if (this.cleanupTimer.unref) {
        this.cleanupTimer.unref(); 
    }
  }

  private getAndUpdateCounter(key: string, map: Map<string, RateLimitData>): { count: number; resetTime: number } {
    const now = Date.now();
    const data = map.get(key);
    
    if (data && now <= data.resetTime) {
      return data;
    } else {
      const newResetTime = now + this.WINDOW_MS;
      return { count: 0, resetTime: newResetTime };
    }
  }

 
  async acquireLock(ip: string, userId?: string): Promise<{ allowed: boolean; ipRemaining: number; userRemaining?: number }> {
    const release = await this.mutex.acquire();
    
    try {
      const now = Date.now();
      
      const ipData = this.getAndUpdateCounter(ip, this.ipRequests);
      const ipCountAfter = ipData.count + 1;
      const ipAllowed = ipCountAfter <= this.MAX_REQUESTS;
      const ipRemaining = Math.max(0, this.MAX_REQUESTS - ipCountAfter);

      let userAllowed = true;
      let userData: RateLimitData | undefined;
      let userCountAfter = 0;
      let userRemaining: number | undefined;

      if (userId) {
        userData = this.getAndUpdateCounter(userId, this.userRequests);
        userCountAfter = userData.count + 1;
        userAllowed = userCountAfter <= this.MAX_REQUESTS;
        userRemaining = Math.max(0, this.MAX_REQUESTS - userCountAfter);
      }

      const allowed = ipAllowed && userAllowed;

      if (allowed) {
        this.ipRequests.set(ip, {
          count: ipCountAfter,
          resetTime: ipData.resetTime || now + this.WINDOW_MS
        });

        if (userId) {
          this.userRequests.set(userId, {
            count: userCountAfter,
            resetTime: userData!.resetTime || now + this.WINDOW_MS
          });
        }
      }

      return { 
        allowed, 
        ipRemaining: ipRemaining,
        userRemaining
      };

    } finally {
      release();
    }
  }


}

export const rateLimitService = new RateLimitService();