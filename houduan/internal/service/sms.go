package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var ErrSMSNotConfigured = errors.New("短信服务未配置")

// SubmailSMSConfig holds Submail SMS API credentials.
type SubmailSMSConfig struct {
	AppID     string
	AppKey    string
	Signature string // 短信签名, e.g. 【ServerAI】
}

// LoadSMSConfig reads SMS configuration from runtime settings.
func LoadSMSConfig() SubmailSMSConfig {
	settings := loadRuntimeSettings("sms_appid", "sms_appkey", "sms_signature")
	return SubmailSMSConfig{
		AppID:     runtimeSettingOr(settings, "sms_appid", ""),
		AppKey:    runtimeSettingOr(settings, "sms_appkey", ""),
		Signature: runtimeSettingOr(settings, "sms_signature", ""),
	}
}

// IsSMSConfigured returns true if SMS service has valid credentials.
func IsSMSConfigured() bool {
	cfg := LoadSMSConfig()
	return cfg.AppID != "" && cfg.AppKey != ""
}

const submailBaseURL = "https://api-v4.mysubmail.com"

var smsHTTPClient = &http.Client{Timeout: 15 * time.Second}

// SubmailResponse is the standard response from Submail API.
type SubmailResponse struct {
	Status string `json:"status"`
	SendID string `json:"send_id,omitempty"`
	Fee    int    `json:"fee,omitempty"`
	Code   int    `json:"code,omitempty"`
	Msg    string `json:"msg,omitempty"`
}

// SendSMSWithTemplate sends SMS using sms/xsend (template-based).
// project is the template ID from Submail, vars is a map of template variables.
func SendSMSWithTemplate(to, project string, vars map[string]string) (*SubmailResponse, error) {
	cfg := LoadSMSConfig()
	if cfg.AppID == "" || cfg.AppKey == "" {
		return nil, ErrSMSNotConfigured
	}

	data := url.Values{}
	data.Set("appid", cfg.AppID)
	data.Set("signature", cfg.AppKey)
	data.Set("to", to)
	data.Set("project", project)

	if len(vars) > 0 {
		varsJSON, err := json.Marshal(vars)
		if err != nil {
			return nil, fmt.Errorf("序列化变量失败: %w", err)
		}
		data.Set("vars", string(varsJSON))
	}

	resp, err := smsHTTPClient.PostForm(submailBaseURL+"/sms/xsend", data)
	if err != nil {
		return nil, fmt.Errorf("请求赛邮 API 失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	var result SubmailResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}

	if result.Status != "success" {
		return &result, fmt.Errorf("赛邮错误 [%d]: %s", result.Code, result.Msg)
	}
	return &result, nil
}

// SendSMSDirect sends SMS using sms/send (direct content, auto template matching).
// content must include signature prefix, e.g. 【ServerAI】Your code is 1234
func SendSMSDirect(to, content string) (*SubmailResponse, error) {
	cfg := LoadSMSConfig()
	if cfg.AppID == "" || cfg.AppKey == "" {
		return nil, ErrSMSNotConfigured
	}

	data := url.Values{}
	data.Set("appid", cfg.AppID)
	data.Set("signature", cfg.AppKey)
	data.Set("to", to)
	data.Set("content", content)

	resp, err := smsHTTPClient.PostForm(submailBaseURL+"/sms/send", data)
	if err != nil {
		return nil, fmt.Errorf("请求赛邮 API 失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	var result SubmailResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}

	if result.Status != "success" {
		return &result, fmt.Errorf("赛邮错误 [%d]: %s", result.Code, result.Msg)
	}
	return &result, nil
}

// SubmailTemplate represents a Submail SMS template.
type SubmailTemplate struct {
	TemplateID          string `json:"template_id"`
	Title               string `json:"sms_title"`
	Signature           string `json:"sms_signature"`
	Content             string `json:"sms_content"`
	Status              string `json:"template_status"`
	StatusDescription   string `json:"template_status_description"`
	RejectReason        string `json:"template_reject_reson,omitempty"`
}

// ListSMSTemplates fetches all templates from Submail.
func ListSMSTemplates() ([]SubmailTemplate, error) {
	cfg := LoadSMSConfig()
	if cfg.AppID == "" || cfg.AppKey == "" {
		return nil, ErrSMSNotConfigured
	}

	u := fmt.Sprintf("%s/sms/template?appid=%s&signature=%s",
		submailBaseURL,
		url.QueryEscape(cfg.AppID),
		url.QueryEscape(cfg.AppKey),
	)

	resp, err := smsHTTPClient.Get(u)
	if err != nil {
		return nil, fmt.Errorf("请求赛邮 API 失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	// Submail returns { status: "success", templates: [...] } or { status: "error", ... }
	var raw struct {
		Status    string            `json:"status"`
		Code      int               `json:"code,omitempty"`
		Msg       string            `json:"msg,omitempty"`
		Templates []SubmailTemplate `json:"templates"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}
	if raw.Status != "success" {
		return nil, fmt.Errorf("赛邮错误 [%d]: %s", raw.Code, raw.Msg)
	}
	return raw.Templates, nil
}

// SubmailBalance holds balance info.
type SubmailBalance struct {
	Status  string `json:"status"`
	Balance string `json:"balance"`
	Code    int    `json:"code,omitempty"`
	Msg     string `json:"msg,omitempty"`
}

// GetSMSBalance fetches SMS balance from Submail.
func GetSMSBalance() (*SubmailBalance, error) {
	cfg := LoadSMSConfig()
	if cfg.AppID == "" || cfg.AppKey == "" {
		return nil, ErrSMSNotConfigured
	}

	u := fmt.Sprintf("%s/sms/balance?appid=%s&signature=%s",
		submailBaseURL,
		url.QueryEscape(cfg.AppID),
		url.QueryEscape(cfg.AppKey),
	)

	resp, err := smsHTTPClient.Get(u)
	if err != nil {
		return nil, fmt.Errorf("请求赛邮 API 失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("读取响应失败: %w", err)
	}

	var result SubmailBalance
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("解析响应失败: %w", err)
	}
	if result.Status != "success" {
		return nil, fmt.Errorf("赛邮错误 [%d]: %s", result.Code, result.Msg)
	}
	return &result, nil
}

// SendSMSBatch sends SMS to multiple phone numbers using the same template.
// Returns (successCount, errors).
func SendSMSBatch(phones []string, project string, vars map[string]string) (int, []error) {
	var errs []error
	success := 0
	for _, phone := range phones {
		phone = strings.TrimSpace(phone)
		if phone == "" {
			continue
		}
		_, err := SendSMSWithTemplate(phone, project, vars)
		if err != nil {
			log.Printf("[SMS] 发送失败 %s: %v", phone, err)
			errs = append(errs, fmt.Errorf("%s: %w", phone, err))
		} else {
			success++
		}
	}
	return success, errs
}
