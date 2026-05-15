import { useUIStore } from '../store/useUIStore';

// 动态扫描所有语言包
const rawLocales = import.meta.glob('../locales/*.json', { eager: true });

const dictionaries: Record<string, Record<string, string>> = {};
export const AVAILABLE_LANGUAGES: string[] = [];

Object.keys(rawLocales).forEach((path) => {
  const langKey = path.split('/').pop()?.replace('.json', '') || 'unknown';
  AVAILABLE_LANGUAGES.push(langKey);
  dictionaries[langKey] = (rawLocales[path] as any).default;
});

export function useTranslation() {
  const language = useUIStore((state) => state.language);
  
  const t = (key: string) => {
    return dictionaries[language]?.[key] || key;
  };

  return { t, language };
}