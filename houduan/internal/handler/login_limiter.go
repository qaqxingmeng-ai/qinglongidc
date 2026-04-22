package handler

import (
	"sync"
	"time"
)

// 登录失败限流器（纯内存，重启即失效；多实例部署需迁移到 Redis）。
//
// 设计目标（吸取此前"按邮箱硬锁 24 小时"带来的账号拒绝服务风险）：
//   1. 不再以邮箱为唯一维度做长时间硬锁，避免攻击者故意打错密码把受害者账号锁死。
//   2. 邮箱维度只做"短时间软降速"（最多 5 分钟 Cooldown），给正常用户留余地。
//   3. 真正的暴力破解防护由 IP 维度承担：同一 IP 连续失败将被拉长拒绝窗口。
//   4. 任一维度成功登录即重置自身计数。
//
// 未来若要引入 CAPTCHA / 滑动验证，应在 CheckLoginGate 返回特定标志后由 handler 触发。

type failEntry struct {
	fails     int
	lockUntil time.Time
	firstFail time.Time
}

var (
	loginMu       sync.Mutex
	emailFailMap  = make(map[string]*failEntry)
	ipFailMap     = make(map[string]*failEntry)
	emailFailWindow = 30 * time.Minute // 超过这个时间窗口的旧计数会被清零
	ipFailWindow    = 30 * time.Minute
)

// checkLoginLock 仅保留邮箱维度的兼容签名，内部调用 CheckLoginGate。
// 返回错误提示字符串，空串表示放行。
func checkLoginLock(email string) string {
	return CheckLoginGate(email, "")
}

// CheckLoginGate 根据 email + ip 两个维度判断是否应当拒绝当前登录尝试。
// 空参数的维度会被跳过。返回空字符串表示放行。
func CheckLoginGate(email, ip string) string {
	loginMu.Lock()
	defer loginMu.Unlock()
	now := time.Now()

	if email != "" {
		if e, ok := emailFailMap[email]; ok && now.Before(e.lockUntil) {
			return formatWait(time.Until(e.lockUntil))
		}
	}
	if ip != "" {
		if e, ok := ipFailMap[ip]; ok && now.Before(e.lockUntil) {
			return formatWait(time.Until(e.lockUntil))
		}
	}
	return ""
}

// recordLoginFailure 邮箱维度：软限速，最多 5 分钟冷却。
// 旧实现会在 20 次累计失败后锁 24 小时，已废弃。
func recordLoginFailure(email string) {
	RecordLoginFailure(email, "")
}

// RecordLoginFailure 分别累计 email / ip 两个维度的失败计数并设置冷却。
func RecordLoginFailure(email, ip string) {
	loginMu.Lock()
	defer loginMu.Unlock()
	now := time.Now()

	if email != "" {
		e := touchEntry(emailFailMap, email, now, emailFailWindow)
		e.fails++
		// 软限速：5 次起每级递增，封顶 5 分钟，绝不长时间锁邮箱账号。
		switch {
		case e.fails >= 15:
			e.lockUntil = now.Add(5 * time.Minute)
		case e.fails >= 10:
			e.lockUntil = now.Add(2 * time.Minute)
		case e.fails >= 5:
			e.lockUntil = now.Add(30 * time.Second)
		}
	}

	if ip != "" {
		e := touchEntry(ipFailMap, ip, now, ipFailWindow)
		e.fails++
		// IP 维度允许更长的退避，应对暴力破解批量尝试。
		switch {
		case e.fails >= 200:
			e.lockUntil = now.Add(24 * time.Hour)
		case e.fails >= 80:
			e.lockUntil = now.Add(1 * time.Hour)
		case e.fails >= 30:
			e.lockUntil = now.Add(15 * time.Minute)
		case e.fails >= 10:
			e.lockUntil = now.Add(1 * time.Minute)
		}
	}
}

// resetLoginLock 成功登录后清掉对应邮箱计数；IP 计数保留（防止复用别人成功态）。
func resetLoginLock(email string) {
	ResetLoginFailure(email, "")
}

// ResetLoginFailure 登录成功后清掉 email 计数，可选清掉 IP 计数。
func ResetLoginFailure(email, ip string) {
	loginMu.Lock()
	defer loginMu.Unlock()
	if email != "" {
		delete(emailFailMap, email)
	}
	if ip != "" {
		delete(ipFailMap, ip)
	}
}

func touchEntry(m map[string]*failEntry, key string, now time.Time, window time.Duration) *failEntry {
	e, ok := m[key]
	if !ok || now.Sub(e.firstFail) > window {
		e = &failEntry{firstFail: now}
		m[key] = e
	}
	return e
}

func formatWait(remaining time.Duration) string {
	if remaining < time.Second {
		remaining = time.Second
	}
	remaining = remaining.Round(time.Second)
	mins := int(remaining.Minutes())
	secs := int(remaining.Seconds()) % 60
	if mins > 0 {
		return "登录过于频繁，请 " + itoa(mins) + " 分 " + itoa(secs) + " 秒后重试"
	}
	return "登录过于频繁，请 " + itoa(secs) + " 秒后重试"
}

// StartLoginLockCleanup 定期清理已过期的限速条目，防止内存泄漏。
func StartLoginLockCleanup() {
	go func() {
		for {
			time.Sleep(30 * time.Minute)
			loginMu.Lock()
			now := time.Now()
			for k, e := range emailFailMap {
				if now.After(e.lockUntil) && now.Sub(e.firstFail) > emailFailWindow {
					delete(emailFailMap, k)
				}
			}
			for k, e := range ipFailMap {
				if now.After(e.lockUntil) && now.Sub(e.firstFail) > ipFailWindow {
					delete(ipFailMap, k)
				}
			}
			loginMu.Unlock()
		}
	}()
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	buf := make([]byte, 0, 10)
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	return string(buf)
}
