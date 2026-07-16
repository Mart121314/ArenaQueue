export interface WowClassInfo {
  name: string;
  color: string;
}

export const WOW_CLASSES: Record<number, WowClassInfo> = {
  1: { name: 'Warrior', color: '#C79C6E' },
  2: { name: 'Paladin', color: '#F58CBA' },
  3: { name: 'Hunter', color: '#ABD473' },
  4: { name: 'Rogue', color: '#FFF569' },
  5: { name: 'Priest', color: '#FFFFFF' },
  6: { name: 'Death Knight', color: '#C41F3B' },
  7: { name: 'Shaman', color: '#0070DE' },
  8: { name: 'Mage', color: '#69CCF0' },
  9: { name: 'Warlock', color: '#9482C9' },
  10: { name: 'Monk', color: '#00FF96' },
  11: { name: 'Druid', color: '#FF7D0A' },
};

export function wowClass(classId: number | null | undefined): WowClassInfo {
  return (classId != null && WOW_CLASSES[classId]) || { name: 'Unknown', color: '#8a8d93' };
}
