package service

import "math"

// RoundMoney 将金额类 float64 按分四舍五入为两位小数。
// 这是 F-551 的阶段性过渡方案：在未完成 DB NUMERIC 与 decimal.Decimal 迁移前，
// 统一所有金额的写入/返回精度，避免 0.1+0.2 之类 IEEE754 误差在余额、佣金、
// 退款链路中累积。
func RoundMoney(v float64) float64 {
	return math.Round(v*100) / 100
}
