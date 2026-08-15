/**
 * 全局状态管理
 */
import { loadCollection, loadOwnedEventPigs, loadBadgeSet, loadHiddenUnlocked, loadRaisingPigs, loadRaisingFloor, } from "./storage.js";
import { STORAGE_KEY_BADGE_SMALL, STORAGE_KEY_BADGE_BIG } from "./constants.js";
const defaultAtlasFilter = {
    color: "", rare: "", method: "", q: "",
    huntRegion: "", huntTicket: "", shopRank: "", graze: "", picky: "",
};
const defaultEventFilter = {
    color: "", rare: "", q: "", graze: "", picky: "",
};
const defaultMineFilter = {
    owned: "", small: "", big: "", q: "", color: "", rare: "",
};
export const state = {
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
    mineFilter: { ...defaultMineFilter },
    breedByParent: new Map(),
    breedingTable: [],
};
