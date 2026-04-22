'use client';

import type { CPUOption, Filters } from '../types';
import { DEFAULT_CATEGORY_ORDER, categoryLabelMap } from '../types';

interface ProductFiltersProps {
  filters: Filters;
  onChange: (filters: Filters) => void;
  availableRegions: string[];
  cpus: CPUOption[];
}

export function ProductFilters({ filters, onChange, availableRegions, cpus }: ProductFiltersProps) {
  return (
    <div className="card mb-5 py-3 px-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <div>
          <label className="label">搜索</label>
          <input className="input h-10" placeholder="名称 / 地区 / CPU" value={filters.q} onChange={(e) => onChange({ ...filters, q: e.target.value })} />
        </div>
        <div>
          <label className="label">状态</label>
          <select className="input h-10" value={filters.status} onChange={(e) => onChange({ ...filters, status: e.target.value })}>
            <option value="ALL">全部状态</option>
            <option value="ACTIVE">上架</option>
            <option value="INACTIVE">下架</option>
          </select>
        </div>
        <div>
          <label className="label">分类</label>
          <select className="input h-10" value={filters.category} onChange={(e) => onChange({ ...filters, category: e.target.value })}>
            <option value="ALL">全部分类</option>
            {DEFAULT_CATEGORY_ORDER.map((v) => (
              <option key={v} value={v}>{categoryLabelMap[v]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">地区</label>
          <select className="input h-10" value={filters.region} onChange={(e) => onChange({ ...filters, region: e.target.value })}>
            <option value="ALL">全部地区</option>
            {availableRegions.map((region) => (
              <option key={region} value={region}>{region}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">CPU</label>
          <select className="input h-10" value={filters.cpuId} onChange={(e) => onChange({ ...filters, cpuId: e.target.value })}>
            <option value="ALL">全部CPU</option>
            {cpus.map((c) => (
              <option key={c.id} value={c.id}>{c.model}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
