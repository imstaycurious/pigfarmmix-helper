#!/usr/bin/env node
/**
 * 数据结构优化脚本
 * 将 v2 schema 转换为 v3 schema
 *
 * 主要改动：
 * 1. 去冗余：配种关系独立存储，只用 pNo 引用
 * 2. 字段重命名：驼峰命名，语义化
 * 3. 合并字段：breed_note + breeding_guide → breedingGuide
 * 4. 数据驱动：用 status 字段替代硬编码的 HIDDEN_PNOS/REMOVED_PNOS
 * 5. 删除无用字段：list.no, external, png, orderNo (部分场景)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../static/data');

// 硬编码常量（将被移到数据中）
const HIDDEN_PNOS = new Set([904, 905, 920, 921]);
const REMOVED_PNOS = new Set([800, 801, 802, 803, 804, 805]);

/**
 * 获取猪的状态
 */
function getStatus(pNo) {
  if (REMOVED_PNOS.has(pNo)) return "removed";
  if (HIDDEN_PNOS.has(pNo)) return "hidden";
  return "normal";
}

/**
 * 转换养成要求和建议（合并 breed_note 和 breeding_guide）
 */
function convertBreedingGuide(pig) {
  const oldGuide = pig.breeding_guide;
  const breedNote = pig.breed_note;

  if (!oldGuide && !breedNote) return undefined;

  // 只有 breed_note (186图鉴猪)
  if (breedNote && !oldGuide) {
    return { requirements: breedNote, tips: null };
  }

  // 只有 breeding_guide (活动猪)
  if (oldGuide && !breedNote) {
    return {
      requirements: oldGuide.requirements || null,
      tips: oldGuide.tips || null
    };
  }

  // 两者都有（合并，用换行分隔）
  return {
    requirements: [breedNote, oldGuide.requirements].filter(Boolean).join('\n'),
    tips: oldGuide.tips || null
  };
}

/**
 * 转换喂食属性
 */
function convertFeeding(pig) {
  const hasData = pig.eatable?.length > 0 || pig.eatable_time > 0 || pig.eat_times > 0;
  if (!hasData) return undefined;

  return {
    interval: pig.eatable_time || 0,
    times: pig.eat_times || 0,
    picky: pig.eatable || []
  };
}

/**
 * 转换获得方式
 */
function convertAcquisition(pig) {
  const acq = {};

  // 商店
  if (pig.add_rank && pig.add_rank.some(v => v > 0)) {
    acq.shop = pig.add_rank;
  }

  // 狩猎
  const hasSites = pig.arrival_place?.length > 0;
  const hasProb = pig.hunt_prob && (
    (pig.hunt_prob[0] && Object.keys(pig.hunt_prob[0]).length > 0) ||
    (pig.hunt_prob[1] && Object.keys(pig.hunt_prob[1]).length > 0)
  );

  if (hasSites || hasProb) {
    acq.hunt = {};
    if (hasSites) acq.hunt.sites = pig.arrival_place;
    if (hasProb) {
      acq.hunt.prob = {
        any: pig.hunt_prob[0] || {},
        same: pig.hunt_prob[1] || {}
      };
    }
  }

  // 养成失败来源（只存 pNo，不存完整对象）
  if (pig.arrival_fail?.length > 0) {
    acq.fail = pig.arrival_fail.map(p => p.pNo);
  }

  // 超分歧/超出世（简化为布尔值）
  const hasFeedSpecial = pig.feed_special && Object.keys(pig.feed_special).length > 0;
  if (hasFeedSpecial) {
    acq.specialFeeding = true;
  }

  return Object.keys(acq).length > 0 ? acq : undefined;
}

/**
 * 转换单只猪
 */
function convertPig(oldPig) {
  const newPig = {
    pNo: oldPig.pNo,
    name: oldPig.name,
    rare: oldPig.rare,
    color: oldPig.color,
    description: oldPig.description,
  };

  // 图鉴位置
  if (oldPig.list) {
    newPig.atlas = {
      type: oldPig.list.typeno,
      index: oldPig.list.listno,
      visible: oldPig.list.isview === 1
    };
  }

  // 状态标记
  const status = getStatus(oldPig.pNo);
  if (status !== "normal") {
    newPig.status = status;
  }

  // 特殊猪标记
  if (oldPig.special) {
    newPig.special = true;
  }

  // 体型
  newPig.weight = {
    small: oldPig.smallWeight,
    big: oldPig.bigWeight
  };

  // 租借
  newPig.rent = oldPig.rent;

  // 售价（可选）
  if (oldPig.price != null) {
    newPig.price = oldPig.price;
  }

  // 养成属性
  newPig.lifespan = oldPig.lifespan;
  newPig.graze = oldPig.isExer || false;

  const feeding = convertFeeding(oldPig);
  if (feeding) {
    newPig.feeding = feeding;
  }

  // 获得方式
  const acquisition = convertAcquisition(oldPig);
  if (acquisition) {
    newPig.acquisition = acquisition;
  }

  // 养成要求和建议
  const breedingGuide = convertBreedingGuide(oldPig);
  if (breedingGuide) {
    newPig.breedingGuide = breedingGuide;
  }

  // 提示（活动六星猪）
  if (oldPig.hints && oldPig.hints.length > 0) {
    newPig.hints = oldPig.hints;
  }

  return newPig;
}

/**
 * 提取配种关系到独立表
 */
function extractBreedingTable(pigs) {
  const breedingMap = new Map(); // 用于去重

  for (const pig of pigs) {
    const bleeds = pig.arrival_bleed || [];

    for (const bleed of bleeds) {
      const p1 = bleed.pNo1?.pNo;
      const p2 = bleed.pNo2?.pNo;
      const isAny = bleed.any === true;
      const isview = bleed.isview;
      const results = bleed.result || [];

      if (!p1) continue;

      // 生成唯一键（用于去重）
      const key = isAny
        ? `${p1}-*`
        : `${Math.min(p1, p2)}-${Math.max(p1, p2)}`;

      // 如果已存在，跳过（避免重复）
      if (breedingMap.has(key)) continue;

      const record = {
        parents: isAny ? [p1, "*"] : [p1, p2],
        outcomes: results.map(r => ({
          pNo: r.pigKind?.pNo,
          prob: r.prob
        })).filter(o => o.pNo != null),
        visible: isview === 1,
      };

      // orderNo 只在 visible=true 时有意义
      if (record.visible && results[0]?.orderNo != null) {
        record.order = results[0].orderNo;
      }

      breedingMap.set(key, record);
    }
  }

  return Array.from(breedingMap.values());
}

/**
 * 转换整个数据文件
 */
function convertData(oldData) {
  console.log(`\n转换数据: ${oldData.count} 只猪`);

  const newPigs = oldData.pigs.map(convertPig);
  const breedingTable = extractBreedingTable(oldData.pigs);

  console.log(`  - 转换猪数据: ${newPigs.length} 只`);
  console.log(`  - 提取配种关系: ${breedingTable.length} 条`);

  return {
    version: 3,
    source: oldData.source,
    generatedAt: new Date().toISOString(),
    count: newPigs.length,
    pigs: newPigs,
    breeding: breedingTable
  };
}

/**
 * 验证转换结果
 */
function validateConversion(oldData, newData) {
  console.log('\n验证转换结果:');

  const errors = [];

  // 检查猪数量
  if (oldData.pigs.length !== newData.pigs.length) {
    errors.push(`猪数量不匹配: ${oldData.pigs.length} → ${newData.pigs.length}`);
  } else {
    console.log(`  ✓ 猪数量一致: ${newData.pigs.length}`);
  }

  // 检查 pNo 完整性
  const oldPnos = new Set(oldData.pigs.map(p => p.pNo));
  const newPnos = new Set(newData.pigs.map(p => p.pNo));
  const missingPnos = [...oldPnos].filter(pNo => !newPnos.has(pNo));

  if (missingPnos.length > 0) {
    errors.push(`缺失的 pNo: ${missingPnos.join(', ')}`);
  } else {
    console.log(`  ✓ 所有 pNo 完整`);
  }

  // 检查配种关系数量（粗略估计）
  const oldBreedCount = oldData.pigs.reduce((sum, p) => sum + (p.arrival_bleed?.length || 0), 0);
  const newBreedCount = newData.breeding.length;
  console.log(`  ✓ 配种关系: ${oldBreedCount} 条记录 → ${newBreedCount} 条去重记录`);

  // 检查必需字段
  for (const pig of newData.pigs) {
    if (!pig.pNo || !pig.name || pig.rare == null) {
      errors.push(`pNo ${pig.pNo} 缺少必需字段`);
    }
  }

  if (errors.length === 0) {
    console.log(`  ✓ 所有必需字段完整`);
  }

  // 统计字段使用情况
  const fieldStats = {
    breedingGuide: 0,
    hints: 0,
    feeding: 0,
    acquisition: 0,
    status_hidden: 0,
    status_removed: 0
  };

  for (const pig of newData.pigs) {
    if (pig.breedingGuide) fieldStats.breedingGuide++;
    if (pig.hints) fieldStats.hints++;
    if (pig.feeding) fieldStats.feeding++;
    if (pig.acquisition) fieldStats.acquisition++;
    if (pig.status === 'hidden') fieldStats.status_hidden++;
    if (pig.status === 'removed') fieldStats.status_removed++;
  }

  console.log('\n字段统计:');
  console.log(`  - breedingGuide: ${fieldStats.breedingGuide} 只`);
  console.log(`  - hints: ${fieldStats.hints} 只`);
  console.log(`  - feeding: ${fieldStats.feeding} 只`);
  console.log(`  - acquisition: ${fieldStats.acquisition} 只`);
  console.log(`  - status=hidden: ${fieldStats.status_hidden} 只`);
  console.log(`  - status=removed: ${fieldStats.status_removed} 只`);

  if (errors.length > 0) {
    console.error('\n❌ 验证失败:');
    errors.forEach(err => console.error(`  - ${err}`));
    return false;
  }

  console.log('\n✅ 验证通过');
  return true;
}

/**
 * 计算文件大小减少
 */
function calculateSizeReduction(oldPath, newPath) {
  const oldSize = fs.statSync(oldPath).size;
  const newSize = fs.statSync(newPath).size;
  const reduction = ((oldSize - newSize) / oldSize * 100).toFixed(1);

  console.log(`\n文件大小:`);
  console.log(`  旧: ${(oldSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  新: ${(newSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  减少: ${reduction}%`);
}

/**
 * 主函数
 */
function main() {
  console.log('='.repeat(60));
  console.log('数据结构优化脚本 v2 → v3');
  console.log('='.repeat(60));

  const files = [
    { old: 'pigs_full.json', new: 'pigs_full_v3.json', backup: 'pigs_full.json.backup' },
    { old: 'pigs_full_zhs.json', new: 'pigs_full_zhs_v3.json', backup: 'pigs_full_zhs.json.backup' }
  ];

  for (const file of files) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`处理文件: ${file.old}`);
    console.log('='.repeat(60));

    const oldPath = path.join(DATA_DIR, file.old);
    const newPath = path.join(DATA_DIR, file.new);
    const backupPath = path.join(DATA_DIR, file.backup);

    // 1. 备份原文件
    if (!fs.existsSync(backupPath)) {
      console.log(`\n备份原文件 → ${file.backup}`);
      fs.copyFileSync(oldPath, backupPath);
    } else {
      console.log(`\n备份文件已存在: ${file.backup}`);
    }

    // 2. 读取旧数据
    console.log(`\n读取旧数据...`);
    const oldData = JSON.parse(fs.readFileSync(oldPath, 'utf-8'));

    // 3. 转换
    const newData = convertData(oldData);

    // 4. 验证
    const valid = validateConversion(oldData, newData);
    if (!valid) {
      console.error(`\n❌ ${file.old} 转换失败，跳过写入`);
      continue;
    }

    // 5. 写入新文件
    console.log(`\n写入新文件: ${file.new}`);
    fs.writeFileSync(newPath, JSON.stringify(newData, null, 2), 'utf-8');

    // 6. 计算大小减少
    calculateSizeReduction(oldPath, newPath);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ 转换完成！');
  console.log('='.repeat(60));
  console.log('\n下一步:');
  console.log('  1. 检查生成的 *_v3.json 文件');
  console.log('  2. 修改代码适配新数据结构');
  console.log('  3. 测试验证');
  console.log('  4. 替换原文件（重命名 *_v3.json → *.json）');
  console.log('\n如需回滚，使用备份文件: *.json.backup\n');
}

main();
