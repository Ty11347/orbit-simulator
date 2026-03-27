// 批量导入所有本地系统配置文件
const rawDataModules = import.meta.glob('./*.json', { eager: true });

export const AVAILABLE_SYSTEMS: Record<string, any> = {};

// 初始化可用系统列表
Object.keys(rawDataModules).forEach((path) => {
  const fileName = path.split('/').pop()?.replace('.json', '') || 'unknown';
  AVAILABLE_SYSTEMS[fileName] = (rawDataModules[path] as any).default;
});