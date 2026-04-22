export const CATEGORY_LABELS: Record<string, string> = {
  dedicated: '独立服务器',
  gpu: 'GPU 服务器',
  storage: '存储型',
  'high-frequency': '高频型',
  'large-memory': '大内存',
  general: '通用型',
};

export const REGION_DESCRIPTIONS: Record<string, string> = {
  '枣庄BGP': '硬防型 BGP 线路，适合高防、游戏和需要持续承压的业务。纯硬抗 DDoS，不封 UDP、不封海外，实测可抗 1.35T。',
  '镇江BGP': '迪云200G高防产品，可上层封海外/封UDP。被打死前两次流量稳定后五分钟解封，适合一切业务，性价比较高。',
  '襄阳BGP': '华中优质线路，全国访问低延迟。双层防火墙，适合游戏业务，200G保底/400G峰值防护，实测可扛700G以上纯国内流量。',
  '台州BGP': '主打稳定、线路优质。BGP 多线，电信可开启上层封海外/封 UDP，双层防火墙，保底 400G 防护。',
  '广州BGP': '大厂 IP/宽带资源，基本无防护，只适合无攻击业务与对网络环境要求极高的客户使用。',
  '温州BGP': '线路优质，上层封UDP大包不影响UDP通信，可上层封海外。高频机器防御效果更好，适合游戏使用。',
  '宁波BGP': '线路较为优质，防御尚可；对网络要求很高的用户可选。',
  '杭州BGP': '浙江地区老牌机房，网络优质，防护一般，稳定性良好。',
  '扬州BGP': '老牌机房，支持T级防御定制（45.117段省清洗定制）。',
  '成都多线': '多线多IP（电信/联通/移动各一个），无防御。',
  '金华电信': '绕台州清洗，显示台州IP，同价位网络质量很强，带100G基础防护，性能与稳定性较差。',
  '宁波电信': '老牌机房，稳定性与网络质量（单线）极佳，带100G基础防护。',
  '襄阳电信': '高防线路随机分配IP段（600G-800G），电信单线，联通/移动优化，下行200Mbps，适合高防业务。',
  '泉州电信': '100G防御最高可升级到T级防护，可上层封UDP，配置较高，性价比不错。',
  '西安电信': '自动过白，线路一般，有宿主机出租。',
  '德阳电信': '高防线路，适合常规业务部署。',
  '成都电信': '西信机房，150G防护上层封UDP，适合常规业务部署。',
  '绵阳电信': '性价比不高，老设备居多。',
  '宁波联通': '上层云盾接入，实际防护不止100G；线路与防御表现都还可以。',
  '济南联通': '济南联通高防接入，防护效果不错，支持防御定制，联通线路首选。',
  '成都联通': '自动过白。',
  '金华移动': '只接G口以上大宽带，配置支持自定义/支持托管到机房，统一10G防。',
  '成都移动': '自动过白，统一10G防，提供宿主机出租。',
  '香港母鸡': '精品/优化带宽/GSL高防带宽可选。',
  '美国母鸡': 'CN2精品网络，CN2+9929+CMIN2。',
  '香港物理机': 'CTG/优化带宽/GSL高防带宽可选。',
  '美国普防': '高防三网/精品网/大陆优化多线路可选。',
  '美国大带宽': '大陆优化/大陆精品CN2/国际BGP多线路可选。',
  '显卡物理机': '带独显的物理机。',
  '韩国': '面向游戏、直播和东北亚网络覆盖场景。',
  '美国高防': '基础防御50G。',
  '日本': '优化/精品/国际/CN2多线路可选。',
  '台湾': '台湾本地节点。',
  '新加坡': '东南亚链路稳定，适合国际业务节点部署。',
  '马来西亚': '东南亚落地区域资源，适合跨境延展和本地化接入。',
  '站群物理机': '美国/日本/香港/韩国多地可选。',
};

export const COMPLIANCE_NOTES = [
  '禁止托管违规支付、跑分、套现及类金融灰产业务。',
  '禁止诈骗、赌博、色情、侵权内容及违法下载分发。',
  '禁止攻击平台、爆破工具、木马控制、短信轰炸等恶意用途。',
  '禁止数据窃取、撞库、非法抓取和隐私泄露类业务。',
  '发现高风险业务将直接停机并终止服务。',
];

export const DELIVERY_NOTES = [
  '商品由管理员审核后开通到账号，不支持用户自助下单。',
  '默认支持按月开通，可按 1、3、6、12 个月处理。',
  '如需新开通、续费或批量采购，请提交工单或联系渠道/管理员。',
  '开通时间、库存状态和到期时间以后台受理结果为准。',
];

// 按 e81 风格的地区展示优先级进行排序（支持模糊匹配）。
export const E81_REGION_ORDER_HINTS = [
  '枣庄BGP',
  '镇江BGP',
  '襄阳BGP',
  '台州BGP',
  '广州BGP',
  '温州BGP',
  '宁波BGP',
  '杭州BGP',
  '扬州BGP',
  '成都多线',
  '金华电信',
  '宁波电信',
  '襄阳电信',
  '泉州电信',
  '西安电信',
  '德阳电信',
  '成都电信',
  '绵阳电信',
  '宁波联通',
  '济南联通',
  '成都联通',
  '成都移动',
  '金华移动',
  '香港母鸡',
  '美国母鸡',
  '香港物理机',
  '美国普防',
  '美国大带宽',
  '显卡物理机',
  '韩国',
  '美国高防',
  '日本',
  '台湾',
  '新加坡',
  '马来西亚',
  '站群物理机',
];

export function getRegionSortRank(region: string) {
  const normalized = region.replace(/\s+/g, '');
  const matchedIndex = E81_REGION_ORDER_HINTS.findIndex((hint) => normalized.includes(hint.replace(/\s+/g, '')));
  return matchedIndex === -1 ? Number.MAX_SAFE_INTEGER : matchedIndex;
}

export function compareRegionsLikeE81(left: string, right: string) {
  const leftRank = getRegionSortRank(left);
  const rightRank = getRegionSortRank(right);
  if (leftRank !== rightRank) return leftRank - rightRank;
  return left.localeCompare(right, 'zh-CN');
}

export function sortRegionNamesLikeE81(regions: string[]) {
  return [...regions].sort(compareRegionsLikeE81);
}

export function createRegionAnchor(region: string) {
  return `region-${region.replace(/\s+/g, '').replace(/[^\u4e00-\u9fa5A-Za-z0-9_-]/g, '').toLowerCase()}`;
}

export function getRegionDescription(region: string) {
  const matched = Object.entries(REGION_DESCRIPTIONS).find(([key]) => region.includes(key));
  return matched?.[1] || `${region} 数据中心提供可按月购买的独立服务器资源，适合稳定型业务和弹性扩容场景。`;
}

export function formatCurrency(value: number) {
  return value.toLocaleString('zh-CN');
}