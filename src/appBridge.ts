export type TimelineFilter = 'all' | 'project' | 'video' | 'edu';

export type AppBridge = {
  setAppLanguage?: (lang: 'zh' | 'en') => void;
  filterTimeline?: (type: TimelineFilter, el: HTMLElement) => void;
  openModal?: (id: string) => void;
  closeModal?: (id: string) => void;
  setHomeDetailId?: (id: string | null, options?: { replace?: boolean }) => void;
  spawnCow?: () => void;
  doLogin?: () => void;
  openDetailById?: (id: string) => void;
};

export const getAppBridge = (): AppBridge => window as unknown as AppBridge;
