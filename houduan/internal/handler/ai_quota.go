package handler

import (
	"sync"
	"time"
)

// AI 接口的用户日配额（纯内存；多实例部署需迁移到 Redis）。
//
// 目的：防止恶意/被盗账号疯狂调用 AI 接口刷外部 token 账单。
// 默认匿名 20 次/天，已登录用户 100 次/天；超过返回 true 表示"命中限额"。

type aiQuotaEntry struct {
	day   string
	count int
}

var (
	aiQuotaMu  sync.Mutex
	aiQuotaMap = make(map[string]*aiQuotaEntry)
)

const (
	aiDailyLimitAnon = 20
	aiDailyLimitUser = 100
)

// ConsumeAIQuota 返回 (ok, remaining)；ok=false 表示已达上限应拒绝。
// 传入 userID 为空则按匿名限额，ip 用作匿名访问者的隔离维度。
func ConsumeAIQuota(userID, ip string) (bool, int) {
	key := "u:" + userID
	limit := aiDailyLimitUser
	if userID == "" {
		key = "ip:" + ip
		limit = aiDailyLimitAnon
	}
	today := time.Now().Format("2006-01-02")

	aiQuotaMu.Lock()
	defer aiQuotaMu.Unlock()
	e, ok := aiQuotaMap[key]
	if !ok || e.day != today {
		e = &aiQuotaEntry{day: today, count: 0}
		aiQuotaMap[key] = e
	}
	if e.count >= limit {
		return false, 0
	}
	e.count++
	return true, limit - e.count
}

// StartAIQuotaCleanup 定期清除隔天的残留条目。
func StartAIQuotaCleanup() {
	go func() {
		for {
			time.Sleep(6 * time.Hour)
			today := time.Now().Format("2006-01-02")
			aiQuotaMu.Lock()
			for k, e := range aiQuotaMap {
				if e.day != today {
					delete(aiQuotaMap, k)
				}
			}
			aiQuotaMu.Unlock()
		}
	}()
}
