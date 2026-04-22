package service

import (
	"crypto/subtle"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// IdentityCode 身份码统一存储策略：
//   - 新写入：统一经过 bcrypt 哈希后存库，列需放宽到 >= 60 字符。
//   - 历史数据：可能还是明文；VerifyIdentityCode 会兼容比对并在调用方可选升级。
//   - 输出：任何 API 响应都不应该回显存储值，改为 hasIdentityCode 布尔。

// HashIdentityCode 把用户传入的明文身份码哈希。空串原样返回空串（调用方表示"清空"）。
func HashIdentityCode(code string) (string, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return "", nil
	}
	// 已经是 bcrypt 哈希则不重复哈希（幂等）
	if isBcryptHash(code) {
		return code, nil
	}
	h, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(h), nil
}

// VerifyIdentityCode 比对输入与存储值。
// stored 可能是 bcrypt 哈希（新数据）或明文（历史遗留）。
// 返回 (ok, needUpgrade) — needUpgrade = 明文匹配成功，调用方可以用哈希重写一次。
func VerifyIdentityCode(stored, input string) (ok bool, needUpgrade bool) {
	stored = strings.TrimSpace(stored)
	input = strings.TrimSpace(input)
	if stored == "" || input == "" {
		return false, false
	}
	if isBcryptHash(stored) {
		return bcrypt.CompareHashAndPassword([]byte(stored), []byte(input)) == nil, false
	}
	// 遗留明文：恒时比对，防时序侧信道
	if subtle.ConstantTimeCompare([]byte(stored), []byte(input)) == 1 {
		return true, true
	}
	return false, false
}

func isBcryptHash(s string) bool {
	if len(s) < 59 {
		return false
	}
	return strings.HasPrefix(s, "$2a$") || strings.HasPrefix(s, "$2b$") || strings.HasPrefix(s, "$2y$")
}
