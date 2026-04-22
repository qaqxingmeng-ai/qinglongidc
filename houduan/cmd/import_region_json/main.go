package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"serverai-backend/config"
	"serverai-backend/internal/database"
	"serverai-backend/internal/model"
	"serverai-backend/internal/service"
)

type sourceFile struct {
	RegionName        string                   `json:"regionName"`
	RegionDescription string                   `json:"regionDescription"`
	Products          []map[string]interface{} `json:"products"`
}

type cpuSpec struct {
	ID        string
	Model     string
	Cores     int
	Threads   int
	Frequency string
	Benchmark int
	Tags      string
	CreatedAt time.Time
	UpdatedAt time.Time
}

var (
	corePattern      = regexp.MustCompile(`(\d+)\s*核`)
	threadPattern    = regexp.MustCompile(`(\d+)\s*线程`)
	frequencyPattern = regexp.MustCompile(`(\d+(?:\.\d+)?)\s*(?:G|GHZ)`)
)

func main() {
	dataDir := flag.String("dir", "", "directory containing region JSON files")
	replace := flag.Bool("replace", true, "replace current CPU and product catalog")
	flag.Parse()

	if strings.TrimSpace(*dataDir) == "" {
		fmt.Fprintln(os.Stderr, "missing -dir")
		os.Exit(1)
	}

	cfg := config.Load()
	if err := database.Connect(cfg.DatabaseURL); err != nil {
		fmt.Fprintf(os.Stderr, "connect database: %v\n", err)
		os.Exit(1)
	}
	if err := database.Migrate(); err != nil {
		fmt.Fprintf(os.Stderr, "migrate database: %v\n", err)
		os.Exit(1)
	}

	products, cpus, regionInfos, err := buildCatalog(*dataDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "build catalog: %v\n", err)
		os.Exit(1)
	}

	if err := importCatalog(products, cpus, regionInfos, *replace); err != nil {
		fmt.Fprintf(os.Stderr, "import catalog: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("imported %d products across %d CPU models, %d regions\n", len(products), len(cpus), len(regionInfos))
}

func buildCatalog(dataDir string) ([]model.Product, []model.CPU, []model.RegionInfo, error) {
	entries, err := os.ReadDir(dataDir)
	if err != nil {
		return nil, nil, nil, err
	}

	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })

	now := time.Now()
	cpuByModel := map[string]cpuSpec{}
	products := make([]model.Product, 0, 256)
	regionInfos := make([]model.RegionInfo, 0, 40)
	sortOrder := 10
	regionSortOrder := 10

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".json") {
			continue
		}

		fullPath := filepath.Join(dataDir, entry.Name())
		raw, err := os.ReadFile(fullPath)
		if err != nil {
			return nil, nil, nil, err
		}

		var doc sourceFile
		if err := json.Unmarshal(raw, &doc); err != nil {
			return nil, nil, nil, fmt.Errorf("%s: %w", entry.Name(), err)
		}

		regionName := strings.TrimSpace(doc.RegionName)
		if regionName == "" {
			return nil, nil, nil, fmt.Errorf("%s: missing regionName", entry.Name())
		}

		regionInfos = append(regionInfos, model.RegionInfo{
			Region:      regionName,
			Description: strings.TrimSpace(doc.RegionDescription),
			SortOrder:   regionSortOrder,
			CreatedAt:   now,
			UpdatedAt:   now,
		})
		regionSortOrder += 10

		for _, row := range doc.Products {
			modelName := cleanCell(row["型号"])
			if modelName == "" {
				continue
			}

			cpuDisplay := normalizeCPUDisplay(cleanCell(row["CPU"]))
			if cpuDisplay == "" {
				cpuDisplay = "待补充"
			}
			cpuModelKey := cpuDisplay
			if _, ok := cpuByModel[cpuModelKey]; !ok {
				cores, threads := parseCPUCounts(cpuDisplay)
				cpuByModel[cpuModelKey] = cpuSpec{
					ID:        service.GenerateID(),
					Model:     cpuDisplay,
					Cores:     cores,
					Threads:   threads,
					Frequency: parseFrequency(cpuDisplay),
					Benchmark: 0,
					Tags:      "json-import,data_ytxAj",
					CreatedAt: now,
					UpdatedAt: now,
				}
			}

			price := parsePrice(row["普通用户"])
			if price <= 0 {
				return nil, nil, nil, fmt.Errorf("%s %s: invalid 普通用户 price", regionName, modelName)
			}

			category := detectCategory(entry.Name(), regionName, modelName, cleanCell(row["GPU"]))
			isDualCPU, cpuCount := parseCPUCount(cpuDisplay)
			ipLabel := cleanCell(row["IP"])
			protection := cleanCell(row["防护"])
			if ipLabel == "" {
				ipLabel = "-"
			}
			if protection == "" {
				protection = "无"
			}

			products = append(products, model.Product{
				ID:              service.GenerateID(),
				Name:            regionName + "-" + modelName,
				Category:        category,
				Region:          regionName,
				Status:          "ACTIVE",
				CPUID:           cpuByModel[cpuModelKey].ID,
				CPUDisplay:      cpuDisplay,
				IsDualCPU:       isDualCPU,
				CPUCount:        cpuCount,
				Memory:          cleanCell(row["内存"]),
				Storage:         cleanCell(row["硬盘"]),
				Bandwidth:       cleanCell(row["带宽"]),
				IPLabel:         ipLabel,
				ProtectionLabel: protection,
				OriginalPrice:   price,
				CostPrice:       price / 2,
				Supplier:        classifySupplier(regionName),
				SortOrder:       sortOrder,
				CreatedAt:       now,
				UpdatedAt:       now,
			})
			sortOrder += 10
		}
	}

	if len(products) == 0 {
		return nil, nil, nil, errors.New("no products parsed")
	}

	cpus := make([]model.CPU, 0, len(cpuByModel))
	for _, cpu := range cpuByModel {
		cpus = append(cpus, model.CPU{
			ID:        cpu.ID,
			Model:     cpu.Model,
			Cores:     cpu.Cores,
			Threads:   cpu.Threads,
			Frequency: cpu.Frequency,
			Benchmark: cpu.Benchmark,
			Tags:      cpu.Tags,
			CreatedAt: cpu.CreatedAt,
			UpdatedAt: cpu.UpdatedAt,
		})
	}
	sort.Slice(cpus, func(i, j int) bool { return cpus[i].Model < cpus[j].Model })

	return products, cpus, regionInfos, nil
}

func importCatalog(products []model.Product, cpus []model.CPU, regionInfos []model.RegionInfo, replace bool) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		var serverCount int64
		if err := tx.Model(&model.ServerInstance{}).Count(&serverCount).Error; err != nil {
			return err
		}
		var orderItemCount int64
		if err := tx.Model(&model.OrderItem{}).Count(&orderItemCount).Error; err != nil {
			return err
		}
		if (serverCount > 0 || orderItemCount > 0) && replace {
			return fmt.Errorf("catalog replace blocked: %d server instances and %d order items still exist", serverCount, orderItemCount)
		}

		if replace {
			if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&model.Product{}).Error; err != nil {
				return err
			}
			if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&model.CPU{}).Error; err != nil {
				return err
			}
			if err := tx.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&model.RegionInfo{}).Error; err != nil {
				return err
			}
		}

		if err := tx.Create(&cpus).Error; err != nil {
			return err
		}
		if err := tx.Create(&products).Error; err != nil {
			return err
		}
		if len(regionInfos) > 0 {
			for _, ri := range regionInfos {
				if err := tx.Where("region = ?", ri.Region).Assign(ri).FirstOrCreate(&model.RegionInfo{}).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}

func cleanCell(value interface{}) string {
	s := strings.TrimSpace(fmt.Sprintf("%v", value))
	if s == "<nil>" {
		return ""
	}
	s = strings.ReplaceAll(s, "\u00a0", " ")
	s = strings.Join(strings.Fields(s), " ")
	return s
}

func normalizeCPUDisplay(raw string) string {
	raw = cleanCell(raw)
	raw = strings.ReplaceAll(raw, "* 2", "*2")
	raw = strings.ReplaceAll(raw, "x 2", "x2")
	return raw
}

func parsePrice(value interface{}) float64 {
	raw := cleanCell(value)
	raw = strings.ReplaceAll(raw, "¥", "")
	raw = strings.ReplaceAll(raw, "/月", "")
	raw = strings.ReplaceAll(raw, "元/月", "")
	buf := strings.Builder{}
	for _, r := range raw {
		if (r >= '0' && r <= '9') || r == '.' {
			buf.WriteRune(r)
		}
	}
	price, _ := strconv.ParseFloat(buf.String(), 64)
	return price
}

func parseCPUCounts(cpu string) (int, int) {
	cores := 0
	threads := 0
	if matches := corePattern.FindStringSubmatch(cpu); len(matches) > 1 {
		cores, _ = strconv.Atoi(matches[1])
	}
	if matches := threadPattern.FindStringSubmatch(cpu); len(matches) > 1 {
		threads, _ = strconv.Atoi(matches[1])
	}
	if cores == 0 {
		cores = 1
	}
	if threads == 0 {
		threads = cores
	}
	return cores, threads
}

func parseCPUCount(cpu string) (bool, int) {
	normalized := strings.ToLower(cpu)
	if strings.Contains(normalized, "双路") || strings.Contains(normalized, "*2") || strings.Contains(normalized, "x2") {
		return true, 2
	}
	return false, 1
}

func parseFrequency(cpu string) string {
	if matches := frequencyPattern.FindStringSubmatch(strings.ToUpper(cpu)); len(matches) > 1 {
		return matches[1] + "GHz"
	}
	return "-"
}

func detectCategory(fileName string, regionName string, modelName string, gpu string) string {
	source := strings.ToLower(fileName + " " + regionName + " " + modelName + " " + gpu)
	gpuHints := []string{"gpu", "显卡", "独显", "tesla", "nvidia", "a100", "h100", "p4", "p40", "t4", "rtx"}
	for _, hint := range gpuHints {
		if strings.Contains(source, hint) {
			return "gpu"
		}
	}
	if strings.TrimSpace(gpu) != "" && strings.TrimSpace(gpu) != "-" {
		return "gpu"
	}
	return "dedicated"
}

func classifySupplier(regionName string) string {
	if strings.Contains(regionName, "海外") {
		return "海外地区"
	}
	return "大陆地区"
}