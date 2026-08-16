/**
 * 全局状态管理
 */

import type { AppState, AtlasFilter, EventFilter } from "./types/index.js";
import {
  loadCollection,
  loadOwnedEventPigs,
  loadBadgeSet,
  loadHiddenUnlocked,
  loadRaisingPigs,
  loadRaisingFloor,
} from "./storage.js";
import { STORAGE_KEY_BADGE_SMALL, STORAGE_KEY_BADGE_BIG } from "./constants.js";

const defaultAtlasFilter: AtlasFilter = {
  color: "", rare: "", method: "", q: "",
  huntRegion: "", huntTicket: "", shopRank: "", graze: "", picky: "",
  own: "",
};

const defaultEventFilter: EventFilter = {
  color: "", rare: "", q: "", graze: "", picky: "",
  own: "",
};

export const state: AppState = {
  dataLoaded: false,
  pigsById: new Map(),
  eventPigsById: new Map(),
  pigsByListKey: new Map(),
  collection: loadCollection(),
  ownedSet: new Set(loadCollection()),
  ownedEventPigs: loadOwnedEventPigs(),
  smallBadges: loadBadgeSet(STORAGE_KEY_BADGE_SMALL),
  bigBadges: loadBadgeSet(STORAGE_KEY_BADGE_BIG),
  raisingPigs: loadRaisingPigs(),
  raisingFloor: loadRaisingFloor(),
  hiddenUnlocked: loadHiddenUnlocked(),
  hiddenPigsById: new Map(),
  atlasFilter: { ...defaultAtlasFilter },
  eventFilter: { ...defaultEventFilter },
  mineView: "menu",
  breedByParent: new Map(),
  breedingTable: [],
};
