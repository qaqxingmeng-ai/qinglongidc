'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface ServerTag {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

const COLOR_OPTIONS = [
  { value: 'blue', label: '蓝' },
  { value: 'green', label: '绿' },
  { value: 'red', label: '红' },
  { value: 'orange', label: '橙' },
  { value: 'purple', label: '紫' },
  { value: 'cyan', label: '青' },
  { value: 'gray', label: '灰' },
  { value: 'yellow', label: '黄' },
];

const COLOR_CLASS: Record<string, string> = {
  blue: 'bg-semantic-info-light text-brand-600 border-blue-100',
  green: 'bg-semantic-success-light text-semantic-success-dark border-emerald-100',
  red: 'bg-semantic-danger-light text-red-700 border-red-100',
  orange: 'bg-orange-50 text-orange-700 border-orange-100',
  purple: 'bg-violet-50 text-violet-700 border-violet-100',
  cyan: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  gray: 'bg-surface-50 text-surface-500 border-surface-100',
  yellow: 'bg-yellow-50 text-yellow-700 border-yellow-100',
};

export default function ServerTagsPage() {
  const [tags, setTags] = useState<ServerTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const [sortOrder, setSortOrder] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await apiFetch('/api/dashboard/server-tags', { method: 'GET' });
    const json = await res.json();
    if (json.success) {
      setTags(json.data.tags || []);
    }
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const resetForm = () => {
    setName('');
    setColor('blue');
    setSortOrder(0);
    setEditingId(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSaving(true);
    try {
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `/api/dashboard/server-tags/${editingId}` : '/api/dashboard/server-tags';
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({ name: name.trim(), color, sortOrder }),
      });
      const json = await res.json();
      if (json.success) {
        await load();
        resetForm();
      }
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (tag: ServerTag) => {
    setEditingId(tag.id);
    setName(tag.name);
    setColor(tag.color);
    setSortOrder(tag.sortOrder || 0);
  };

  const onDelete = async (id: string) => {
    const res = await apiFetch(`/api/dashboard/server-tags/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      await load();
      if (editingId === id) {
        resetForm();
      }
    }
  };

  if (loading) {
    return <div className="text-surface-400 py-20 text-center">加载中...</div>;
  }

  return (
    <div>
      <h1 className="section-title mb-4">服务器标签管理</h1>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 rounded-8 border border-surface-100 bg-white p-4">
          <p className="text-sm font-medium text-surface-600 mb-3">{editingId ? '编辑标签' : '新建标签'}</p>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="label">标签名称</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如：生产环境"
                maxLength={30}
                className="input"
              />
            </div>

            <div>
              <label className="label">颜色</label>
              <select value={color} onChange={(e) => setColor(e.target.value)} className="input">
                {COLOR_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">排序值（越小越靠前）</label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value || 0))}
                className="input"
              />
            </div>

            <div className="flex gap-2">
              <button className="btn-primary btn-sm" disabled={saving}>
                {saving ? '保存中...' : editingId ? '保存修改' : '创建标签'}
              </button>
              {editingId && (
                <button type="button" className="btn-secondary btn-sm" onClick={resetForm}>取消编辑</button>
              )}
            </div>
          </form>
        </div>

        <div className="lg:col-span-3 rounded-8 border border-surface-100 bg-white p-4">
          <p className="text-sm font-medium text-surface-600 mb-3">标签列表</p>
          {tags.length === 0 ? (
            <p className="text-sm text-surface-400">暂无标签</p>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => (
                <div key={tag.id} className="flex items-center justify-between rounded-lg border border-surface-100 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full border text-xs ${COLOR_CLASS[tag.color] || COLOR_CLASS.blue}`}>
                      {tag.name}
                    </span>
                    <span className="text-xs text-surface-400">排序 {tag.sortOrder || 0}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <button onClick={() => onEdit(tag)} className="text-brand-500 hover:underline">编辑</button>
                    <button onClick={() => onDelete(tag.id)} className="text-semantic-danger hover:underline">删除</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
