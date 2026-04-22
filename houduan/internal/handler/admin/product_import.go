package admin

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"

	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type productImportCandidate struct {
	Key           string   `json:"key"`
	Name          string   `json:"name"`
	Region        string   `json:"region"`
	Category      string   `json:"category"`
	CPUModel      string   `json:"cpuModel"`
	IsDualCPU     bool     `json:"isDualCPU"`
	Memory        string   `json:"memory"`
	Storage       string   `json:"storage"`
	Bandwidth     string   `json:"bandwidth"`
	OriginalPrice float64  `json:"originalPrice"`
	AIDescription string   `json:"aiDescription,omitempty"`
	AISuitableFor string   `json:"aiSuitableFor,omitempty"`
	CPUDisplay    string   `json:"cpuDisplay,omitempty"`
	Errors        []string `json:"errors,omitempty"`
	Valid         bool     `json:"valid"`
	MatchedCPUID  string   `json:"-"`
}

type productImportSummary struct {
	Total      int `json:"total"`
	ValidCount int `json:"validCount"`
	ErrorCount int `json:"errorCount"`
	Categories []struct {
		Category string `json:"category"`
		Count    int    `json:"count"`
	} `json:"categories"`
	Regions []struct {
		Region string `json:"region"`
		Count  int    `json:"count"`
	} `json:"regions"`
}

type productImportConfirmReq struct {
	Mode          string                   `json:"mode"`
	Items         []productImportCandidate `json:"items"`
	SelectedKeys  []string                 `json:"selectedKeys"`
	InitialStatus string                   `json:"initialStatus"`
	Strategy      string                   `json:"strategy"`
}

var importTargetFields = []string{
	"name",
	"region",
	"category",
	"cpuModel",
	"isDualCPU",
	"memory",
	"storage",
	"bandwidth",
	"originalPrice",
	"aiDescription",
	"aiSuitableFor",
	"cpuDisplay",
}

var importHeaderAlias = map[string]string{
	"name":       "name",
	"商品名":         "name",
	"商品名称":        "name",
	"名称":          "name",
	"region":     "region",
	"地区":          "region",
	"节点":          "region",
	"category":   "category",
	"分类":          "category",
	"类型":          "category",
	"cpumodel":   "cpuModel",
	"cpu":        "cpuModel",
	"cpu型号":       "cpuModel",
	"处理器":         "cpuModel",
	"isdualcpu":  "isDualCPU",
	"单双路":         "isDualCPU",
	"双路":          "isDualCPU",
	"memory":     "memory",
	"内存":          "memory",
	"storage":    "storage",
	"硬盘":          "storage",
	"磁盘":          "storage",
	"bandwidth":  "bandwidth",
	"带宽":          "bandwidth",
	"originalprice": "originalPrice",
	"price":      "originalPrice",
	"售价":          "originalPrice",
	"价格":          "originalPrice",
	"金额":          "originalPrice",
	"description": "aiDescription",
	"描述":          "aiDescription",
	"aisuitablefor": "aiSuitableFor",
	"适用场景":        "aiSuitableFor",
	"cpudisplay": "cpuDisplay",
	"展示cpu":        "cpuDisplay",
}

func canonicalHeader(s string) string {
	s = strings.TrimSpace(strings.ToLower(s))
	s = strings.ReplaceAll(s, "_", "")
	s = strings.ReplaceAll(s, "-", "")
	s = strings.ReplaceAll(s, " ", "")
	return s
}

func autoMapHeaders(headers []string) map[string]string {
	out := make(map[string]string)
	for _, h := range headers {
		key := canonicalHeader(h)
		if target, ok := importHeaderAlias[key]; ok {
			out[target] = h
		}
	}
	return out
}

func getMapped(row map[string]string, mapping map[string]string, field string) string {
	h, ok := mapping[field]
	if !ok || h == "" {
		return ""
	}
	return strings.TrimSpace(row[h])
}

func parseBoolLike(s string) bool {
	s = strings.TrimSpace(strings.ToLower(s))
	return s == "1" || s == "true" || s == "yes" || s == "y" || s == "双路" || s == "双"
}

func parsePrice(s string) float64 {
	s = strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(s, "¥", ""), ",", ""))
	v, _ := strconv.ParseFloat(s, 64)
	return v
}

func normalizeCPUModel(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "  ", " ")
	s = strings.ReplaceAll(s, "（", "(")
	s = strings.ReplaceAll(s, "）", ")")
	return s
}

func readCSVRows(file multipart.File) ([]string, []map[string]string, error) {
	reader := csv.NewReader(file)
	records, err := reader.ReadAll()
	if err != nil {
		return nil, nil, err
	}
	if len(records) < 2 {
		return nil, nil, fmt.Errorf("CSV 至少需要表头 + 1 行数据")
	}
	headers := make([]string, len(records[0]))
	copy(headers, records[0])
	rows := make([]map[string]string, 0, len(records)-1)
	for i := 1; i < len(records); i++ {
		r := make(map[string]string)
		for j, h := range headers {
			if j < len(records[i]) {
				r[h] = records[i][j]
			}
		}
		rows = append(rows, r)
	}
	return headers, rows, nil
}

func readXLSXRows(file multipart.File) ([]string, []map[string]string, error) {
	all, err := io.ReadAll(file)
	if err != nil {
		return nil, nil, err
	}
	xl, err := excelize.OpenReader(bytes.NewReader(all))
	if err != nil {
		return nil, nil, err
	}
	defer xl.Close()
	sheets := xl.GetSheetList()
	if len(sheets) == 0 {
		return nil, nil, fmt.Errorf("Excel 没有可读取的工作表")
	}
	rowsRaw, err := xl.GetRows(sheets[0])
	if err != nil {
		return nil, nil, err
	}
	if len(rowsRaw) < 2 {
		return nil, nil, fmt.Errorf("Excel 至少需要表头 + 1 行数据")
	}
	headers := make([]string, len(rowsRaw[0]))
	copy(headers, rowsRaw[0])
	rows := make([]map[string]string, 0, len(rowsRaw)-1)
	for i := 1; i < len(rowsRaw); i++ {
		r := make(map[string]string)
		for j, h := range headers {
			if j < len(rowsRaw[i]) {
				r[h] = rowsRaw[i][j]
			}
		}
		rows = append(rows, r)
	}
	return headers, rows, nil
}

func resolveCPUIDByModel(modelRaw string) (string, bool) {
	modelRaw = normalizeCPUModel(modelRaw)
	if modelRaw == "" {
		return "", false
	}
	var cpu model.CPU
	if err := database.DB.Where("model ILIKE ?", modelRaw).First(&cpu).Error; err == nil {
		return cpu.ID, true
	}
	if err := database.DB.Where("model ILIKE ?", "%"+modelRaw+"%").First(&cpu).Error; err == nil {
		return cpu.ID, true
	}
	return "", false
}

func validateImportCandidate(c productImportCandidate) productImportCandidate {
	errList := make([]string, 0)
	c.Name = strings.TrimSpace(c.Name)
	c.Region = strings.TrimSpace(c.Region)
	c.Category = strings.TrimSpace(strings.ToLower(c.Category))
	c.CPUModel = normalizeCPUModel(c.CPUModel)
	c.Memory = strings.TrimSpace(c.Memory)
	c.Storage = strings.TrimSpace(c.Storage)
	c.Bandwidth = strings.TrimSpace(c.Bandwidth)

	if c.Category == "" {
		c.Category = "dedicated"
	}
	if c.Name == "" {
		errList = append(errList, "名称不能为空")
	}
	if c.Region == "" {
		errList = append(errList, "地区不能为空")
	}
	if c.CPUModel == "" {
		errList = append(errList, "CPU 型号不能为空")
	}
	if c.Memory == "" || c.Storage == "" || c.Bandwidth == "" {
		errList = append(errList, "内存/硬盘/带宽为必填项")
	}
	if c.OriginalPrice <= 0 {
		errList = append(errList, "价格必须大于 0")
	}
	if c.OriginalPrice > 100000 {
		errList = append(errList, "价格过高，请确认单位")
	}
	if c.CPUModel != "" {
		if cpuID, ok := resolveCPUIDByModel(c.CPUModel); ok {
			c.MatchedCPUID = cpuID
		} else {
			errList = append(errList, "关联 CPU 不存在: "+c.CPUModel)
		}
	}
	c.Errors = errList
	c.Valid = len(errList) == 0
	return c
}

func buildImportSummary(items []productImportCandidate) productImportSummary {
	s := productImportSummary{Total: len(items)}
	catCnt := map[string]int{}
	regCnt := map[string]int{}
	for _, it := range items {
		if it.Valid {
			s.ValidCount++
		} else {
			s.ErrorCount++
		}
		catCnt[it.Category]++
		regCnt[it.Region]++
	}
	for k, v := range catCnt {
		if k == "" {
			continue
		}
		s.Categories = append(s.Categories, struct {
			Category string `json:"category"`
			Count    int    `json:"count"`
		}{Category: k, Count: v})
	}
	for k, v := range regCnt {
		if k == "" {
			continue
		}
		s.Regions = append(s.Regions, struct {
			Region string `json:"region"`
			Count  int    `json:"count"`
		}{Region: k, Count: v})
	}
	return s
}

func containsKey(keys map[string]bool, key string) bool {
	_, ok := keys[key]
	return ok
}

func mapRowsToCandidates(rows []map[string]string, mapping map[string]string) []productImportCandidate {
	items := make([]productImportCandidate, 0, len(rows))
	for i, row := range rows {
		candidate := productImportCandidate{
			Key:           fmt.Sprintf("row-%d", i+1),
			Name:          getMapped(row, mapping, "name"),
			Region:        getMapped(row, mapping, "region"),
			Category:      getMapped(row, mapping, "category"),
			CPUModel:      getMapped(row, mapping, "cpuModel"),
			IsDualCPU:     parseBoolLike(getMapped(row, mapping, "isDualCPU")),
			Memory:        getMapped(row, mapping, "memory"),
			Storage:       getMapped(row, mapping, "storage"),
			Bandwidth:     getMapped(row, mapping, "bandwidth"),
			OriginalPrice: parsePrice(getMapped(row, mapping, "originalPrice")),
			AIDescription: getMapped(row, mapping, "aiDescription"),
			AISuitableFor: getMapped(row, mapping, "aiSuitableFor"),
			CPUDisplay:    getMapped(row, mapping, "cpuDisplay"),
		}
		items = append(items, validateImportCandidate(candidate))
	}
	return items
}

func (h *ProductHandler) importPreviewFromFile(c *gin.Context) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(400, gin.H{"error": "请上传 CSV 或 XLSX 文件"})
		return
	}
	f, err := fileHeader.Open()
	if err != nil {
		c.JSON(400, gin.H{"error": "文件读取失败"})
		return
	}
	defer f.Close()

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	var headers []string
	var rows []map[string]string
	switch ext {
	case ".csv":
		headers, rows, err = readCSVRows(f)
	case ".xlsx":
		headers, rows, err = readXLSXRows(f)
	default:
		c.JSON(400, gin.H{"error": "仅支持 CSV / XLSX 文件"})
		return
	}
	if err != nil {
		c.JSON(400, gin.H{"error": "解析文件失败: " + err.Error()})
		return
	}

	mapping := autoMapHeaders(headers)
	if rawMapping := c.PostForm("mapping"); strings.TrimSpace(rawMapping) != "" {
		var custom map[string]string
		if json.Unmarshal([]byte(rawMapping), &custom) == nil {
			for k, v := range custom {
				if strings.TrimSpace(v) != "" {
					mapping[k] = v
				}
			}
		}
	}

	items := mapRowsToCandidates(rows, mapping)
	summary := buildImportSummary(items)
	c.JSON(200, gin.H{
		"source":           "file",
		"headers":          headers,
		"targetFields":     importTargetFields,
		"suggestedMapping": mapping,
		"items":            items,
		"summary":          summary,
	})
}

func (h *ProductHandler) importPreviewFromText(c *gin.Context) {
	var req struct {
		Mode    string            `json:"mode"`
		RawText string            `json:"rawText"`
		Mapping map[string]string `json:"mapping"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "请提供商品文本"})
		return
	}
	if strings.TrimSpace(req.RawText) == "" {
		c.JSON(400, gin.H{"error": "商品文本不能为空"})
		return
	}

	results, err := h.aiClient.ParseProducts(c.Request.Context(), req.RawText)
	if err != nil {
		c.JSON(500, gin.H{"error": "AI解析失败: " + err.Error()})
		return
	}
	items := make([]productImportCandidate, 0, len(results))
	for i, r := range results {
		name, _ := r["name"].(string)
		region, _ := r["region"].(string)
		category, _ := r["category"].(string)
		cpuModel, _ := r["cpuModel"].(string)
		memory, _ := r["memory"].(string)
		storage, _ := r["storage"].(string)
		bandwidth, _ := r["bandwidth"].(string)
		desc, _ := r["description"].(string)
		aiDesc, _ := r["aiDescription"].(string)
		suitable, _ := r["aiSuitableFor"].(string)
		cpuDisplay, _ := r["cpuDisplay"].(string)
		isDual, _ := r["isDualCPU"].(bool)
		price := 0.0
		switch v := r["originalPrice"].(type) {
		case float64:
			price = v
		case string:
			price = parsePrice(v)
		}
		if aiDesc == "" {
			aiDesc = desc
		}
		candidate := productImportCandidate{
			Key:           fmt.Sprintf("ai-%d", i+1),
			Name:          name,
			Region:        region,
			Category:      category,
			CPUModel:      cpuModel,
			IsDualCPU:     isDual,
			Memory:        memory,
			Storage:       storage,
			Bandwidth:     bandwidth,
			OriginalPrice: price,
			AIDescription: aiDesc,
			AISuitableFor: suitable,
			CPUDisplay:    cpuDisplay,
		}
		items = append(items, validateImportCandidate(candidate))
	}
	summary := buildImportSummary(items)
	c.JSON(200, gin.H{"source": "text", "items": items, "summary": summary})
}

func (h *ProductHandler) importConfirm(c *gin.Context) {
	var req productImportConfirmReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "导入参数无效"})
		return
	}
	if len(req.Items) == 0 || len(req.SelectedKeys) == 0 {
		c.JSON(400, gin.H{"error": "请至少选择一个候选商品"})
		return
	}
	if req.InitialStatus != "ACTIVE" && req.InitialStatus != "INACTIVE" {
		req.InitialStatus = "INACTIVE"
	}
	strategy := strings.ToLower(strings.TrimSpace(req.Strategy))
	if strategy == "" {
		strategy = "skip_errors"
	}
	selectedMap := map[string]bool{}
	for _, k := range req.SelectedKeys {
		selectedMap[k] = true
	}

	type rowResult struct {
		Key    string   `json:"key"`
		Name   string   `json:"name"`
		Status string   `json:"status"`
		Errors []string `json:"errors,omitempty"`
	}
	results := make([]rowResult, 0)
	createdCount := 0
	skippedCount := 0
	failedCount := 0

	err := database.DB.Transaction(func(tx *gorm.DB) error {
		for _, raw := range req.Items {
			if !containsKey(selectedMap, raw.Key) {
				continue
			}
			cand := validateImportCandidate(raw)
			if !cand.Valid {
				failedCount++
				results = append(results, rowResult{Key: cand.Key, Name: cand.Name, Status: "failed", Errors: cand.Errors})
				if strategy == "abort" {
					return fmt.Errorf("第 %s 行校验失败", cand.Key)
				}
				continue
			}

			var dup int64
			tx.Model(&model.Product{}).
				Where("name = ? AND region = ? AND cpu_id = ? AND status != ?", cand.Name, cand.Region, cand.MatchedCPUID, "DELETED").
				Count(&dup)
			if dup > 0 {
				skippedCount++
				results = append(results, rowResult{Key: cand.Key, Name: cand.Name, Status: "skipped", Errors: []string{"重复商品已存在"}})
				if strategy == "abort" {
					return fmt.Errorf("发现重复商品: %s", cand.Name)
				}
				continue
			}

			aiDesc := strings.TrimSpace(cand.AIDescription)
			aiSuitable := strings.TrimSpace(cand.AISuitableFor)
			product := model.Product{
				ID:            service.GenerateID(),
				Name:          cand.Name,
				Category:      cand.Category,
				Region:        cand.Region,
				Status:        req.InitialStatus,
				CPUID:         cand.MatchedCPUID,
				CPUDisplay:    cand.CPUDisplay,
				IsDualCPU:     cand.IsDualCPU,
				CPUCount:      1,
				Memory:        cand.Memory,
				Storage:       cand.Storage,
				Bandwidth:     cand.Bandwidth,
				OriginalPrice: cand.OriginalPrice,
				CostPrice:     service.GetCostPrice(cand.OriginalPrice),
				CreatedAt:     time.Now(),
				UpdatedAt:     time.Now(),
			}
			if cand.IsDualCPU {
				product.CPUCount = 2
			}
			if aiDesc != "" {
				product.AIDescription = &aiDesc
			}
			if aiSuitable != "" {
				product.AISuitableFor = &aiSuitable
			}
			if err := tx.Create(&product).Error; err != nil {
				failedCount++
				results = append(results, rowResult{Key: cand.Key, Name: cand.Name, Status: "failed", Errors: []string{"写入失败"}})
				if strategy == "abort" {
					return err
				}
				continue
			}
			createdCount++
			results = append(results, rowResult{Key: cand.Key, Name: cand.Name, Status: "created"})
		}
		return nil
	})
	if err != nil {
		c.JSON(400, gin.H{"error": "导入中止: " + err.Error(), "report": gin.H{"createdCount": createdCount, "skippedCount": skippedCount, "failedCount": failedCount, "rows": results}})
		return
	}

	c.JSON(200, gin.H{
		"createdCount": createdCount,
		"skippedCount": skippedCount,
		"failedCount":  failedCount,
		"rows":         results,
	})
}
