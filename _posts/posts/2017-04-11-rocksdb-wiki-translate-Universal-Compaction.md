---
title: Universal Compaction
tags: RocksDB 翻译
category: rocksdb
---



## 概述

通用合并策略的目标是降低写放大，因此读放大和空间放大可能会提升。

当使用通用合并策略是，所有的 SST 文件以 sorted runs 形式组织。一个 sorted run 包含了一个时间段内生成的数据。
不同的 sorted runs 在时间范围上永远不会重合。当有两个或两个以上时间相邻的 sorted runs，才可能会触发合并。
合并之后 sorted run 的时间范围是包含了所有输入的 sorted runs 的时间范围的。
每次合并之后，不同的 sorted runs 之前的时间范围永远不会重合。
sorted run 在实现上可以是 L0 的文件，也可以是一个 `level`，包含了多个分块文件。

## 限制

### 两倍空间问题
在使用通用合并策略时，有时会出现全局合并。这种情况下，输出的文件大小基本和输入文件大小一致。在合并期间，输入文件和输出文件需要同时保存，所以数据库会出现临时的两倍空间使用。
所以使用的时候，确保预留足够的磁盘空间。

### DB (Column Family) Size if num_levels=1
使用通用合并策略时，如`num_leveles=1`，那么就出现所有数据都保存在一个 SST 文件的可能。
单个 SST 文件的大小是有限制的。在 Rocksdb 中，一个 block 的大小不能超过 4GB(因为使用 uint32)。
如果一个 SST 文件过大，那么就可能导致 `index block` 超过限制。 `index block`的大小会受具体存储数据的影响。
我们碰到的一个 case， 使用 4k 的 block_size， 当数据库达大概到 250GB 的时候，就达到了限制了。

将 num_levels 调整为大于1的时候，可以缓解这个问题。 这样 大文件 会被存在 lager level 的多个小文件中。
L0 -> L0 的并发合并还是会有的，但是 L0 中的文件会小很多

## 数据分布和安置
### Sorted Runs
上面提到了，数据是以 sorted runs 的形式组织的。 一个 sorted run 的数据是根据更新时间的分布和排序的，不管是 L0 中的文件，还是其他 level 的整个 level 的数据。

下面是一个典型的文件分布：

```
Level 0: File0_0, File0_1, File0_2
Level 1: (empty)
Level 2: (empty)
Level 3: (empty)
Level 4: File4_0, File4_1, File4_2, File4_3
Level 5: File5_0, File5_1, File5_2, File5_3, File5_4, File5_5, File5_6, File5_7
```

级别越大的保存的数据越旧。这个例子中，有5个 sorted runs ：L0 3个文件（3 个 sorted runs）、 level 4 和 level 5 作为两个 sorted runs。
Level 5 是最旧的 sorted run， level 4 相对新一些， level 0 上的文件是最新的。


### Placement of Compaction Outputs
时间区间相邻的 sorted runs 总是被合并，合并的数据是另外一个 sorted run。
在符合越旧的数据保存在更高的 level 的原则上，我们总是尽可能将合并的结果保存在最高的 level 上。

还是使用上面的例子，现在我们这样的数据分布：

```
File0_0
File0_1
File0_2
Level 4: File4_0, File4_1, File4_2, File4_3
Level 5: File5_0, File5_1, File5_2, File5_3, File5_4, File5_5, File5_6, File5_7
```
如果合并所有数据，合并的输出结果会被保存到 level 5。所以最终结果：

```
Level 5: File5_0', File5_1', File5_2', File5_3', File5_4', File5_5', File5_6', File5_7'
```

如果我们合并不同的文件，合并输出会被如何保存：

如果我们和并 File0_1, File0_2 and Level 4, 那么合并的输出会被保存在 level 4 上。
```
Level 0: File0_0
Level 1: (empty)
Level 2: (empty)
Level 3: (empty)
Level 4: File4_0', File4_1', File4_2', File4_3'
Level 5: File5_0, File5_1, File5_2, File5_3, File5_4, File5_5, File5_6, File5_7
```
如果我们合并 File0_0, File0_1 and File0_2, 合并的输出会被保存在 level 3 上面。
```
Level 0: (empty)
Level 1: (empty)
Level 2: (empty)
Level 3: File3_0, File3_1, File3_2
Level 4: File4_0, File4_1, File4_2, File4_3
Level 5: File5_0, File5_1, File5_2, File5_3, File5_4, File5_5, File5_6, File5_7
```

如果我们合并 File0_0 and File0_1, 合并的数据还将继续保存在 level 0 上。

```
Level 0: File0_0', File0_2
Level 1: (empty)
Level 2: (empty)
Level 3: (empty)
Level 4: File4_0, File4_1, File4_2, File4_3
Level 5: File5_0, File5_1, File5_2, File5_3, File5_4, File5_5, File5_6, File5_7
```

### Special case options.num_levels=1

如果 options.num_levels=1, 合并输出的规则还是一样的。
这种情况下，所有的文件都只能在 level 0 上， 并且每一个文件就是一个 sorted run。
合并的行为和默认的通用合并策略一样，所以可以做向后兼容。

## Compaction Picking Algorithm
假设我们有如下的 sorted runs
```
    R1, R2, R3, ..., Rn
```
R1的数据最新更新的，Rn 的数据是最旧的。
sorted runs 是根据其中包含的数据的新旧排序的，而不是 sorted run 自己的更新时间。
这样，合并输出保存的位置和输入的位置一样的。

合并是怎么被触发的呢：

#### Precondition: n >= options.level0_file_num_compaction_trigger
除非 sorted runs 的数量达到这个阈值，否则不会有任何合并被触发

(Note although the option name uses word "file", the trigger is for "sorted run" for historical reason. For the names of all options mentioned below, "file" also means sorted run for the same reason.)

如果满足这个前置条件，那么存在3种情况。每种情况都可以触发一次合并：

#### 1. 通过空间放大率触发合并

如果估算的  _size amplification ratio_ 大于  options.compaction_options_universal.max_size_amplification_percent / 100， 那么所有的文件会被合并到一个 sorted run。

下面是 _size amplification ratio_ 的估算公式：

```
    size amplification ratio = (size(R1) + size(R2) + ... size(Rn-1)) / size(Rn)
```
注意，Rn 的大小是没有被包含的，也就是 0 是最佳的状态，如果是100 那么就是两倍空间放大，200 是三倍空间放大。

在一个稳定的数据库，数据新增率和数据删除率及相似的，也就也为之任何一个 sorted run 有相同的新增和删除。当R1,R2 ... Rn-1 合并到 Rn 后，新增和删除就完全抵消了。
所以全合并之后的数据大小也应该是和 Rn 的大小一样。所以 Rn 的大小作为空间放大的基数。

If options.compaction_options_universal.max_size_amplification_percent = 25, which means we will keep total space of DB less than 125% of total size of live data. Let's use this value in an example. Assuming compaction is only triggered by space amplification, options.level0_file_num_compaction_trigger = 1, file size after each mem table flush is always 1, and compacted size always equals to total input sizes. After two flushes, we have two files size of 1, while 1/1 > 25% so we'll need to do a full compaction:

```
1 1  =>  2
```

After another mem table flush we have

```
1 2   =>  3
```

Which again triggers a full compaction becasue 1/2 > 25%. And in the same way:

```
1 3  =>  4
```

But after another flush, the compaction is not triggered:

```
1 4
```

Because 1/4 <= 25%. Another mem table flush will trigger another compaction:

```
1 1 4  =>  6
```

Because (1+1) / 4 > 25%.

And it keeps going like this:

```
1
1 1  =>  2
1 2  =>  3
1 3  =>  4
1 4
1 1 4  =>  6
1 6
1 1 6  =>  8
1 8
1 1 8
1 1 1 8  =>  11
1 11
1 1 11
1 1 1 11  =>  14
1 14
1 1 14
1 1 1 14
1 1 1 1 14  =>  18
```

#### 2. 单个文件大小比例

_size ratio trigger_ 使用下列公式计算：
 
```
     size_ratio_trigger = 1 + options.compaction_options_universal.size_ratio / 100
```
一般情况下 options.compaction_options_universal.size_ratio 是接近0的，所以 ratio trigger_ 接近 1.

从R1开始，如果 size(R2) / size(R1) <= _size ratio trigger_, 那么 (R1, R2) 就可以一起合并。接着和判断 R3 是不是可以一起合并。
如果 size(R3) / size(R1 + R2) <= _size ratio trigger_, 那么就可以包含 (R1, R2, R3)。按这样的方式，接着继续判断 R4。
使用已经确定可以合并的总大小和下一个sorted run 的大小比较，直到条件不能被满足为止。

下面是个示例可以帮组更好的理解。假设  options.compaction_options_universal.size_ratio = 0, mem table 每次 flush 的大小总是 1.
合并后的大小总是和输入的大小的总和一直， 合并仅会被空间放大因素触发，并且 options.level0_file_num_compaction_trigger = 1 （文件的个数不会限制合并的触发）。
我们从一个文件开始，当有 mem table flush 之后，我们就有两个大小为1 的文件了，这样就可以触发一次合并了：

```
1 1  =>  2
```

After another mem table flush,

```
1 2  (no compaction triggered)
```

which doesn't qualify a flush because 2/1 > 1. But another mem table flush will trigger a compaction of all the files:

```
1 1 2  =>  4
```

This is because 1/1 >=1 and 2 / (1+1) >= 1.

The compaction will keep working like this:

```
1 1  =>  2
1 2  (no compaction triggered)
1 1 2  =>  4
1 4  (no compaction triggered)
1 1 4  =>  2 4
1 2 4  (no compaction triggered)
1 1 2 4 => 8
1 8  (no compaction triggered)
1 1 8  =>  2 8
1 2 8  (no compaction triggered)
1 1 2 8  =>  4 8
1 4 8  (no compaction triggered)
1 1 4 8  =>  2 4 8
1 2 4 8  (no compaction triggered)
1 1 2 4 8  =>  16
1 16  (no compaction triggered)
......
```

Compaction is only triggered when number of input sorted runs would be at least options.compaction_options_universal.min_merge_width and number of sorted runs as inputs will be capped as no more than  options.compaction_options_universal.max_merge_width.

#### 3. sorted sorts 的个数触发合并

假设上面的1和2条件都不能满足，将会尝试从 R1, R2 ...合并，以确保合并后 sorted run 的个数小于配置的  options.level0_file_num_compaction_trigger + 1。
如果需要合并的 sorted run 的个数大于 options.compaction_options_universal.max_merge_width， 我们将总数限制到 options.compaction_options_universal.max_merge_width。

当 flush memtable 、完成合并后都会触发这个尝试。所以有些时候会有重复的尝试。

See [Universal Style Compaction Example](https://github.com/facebook/rocksdb/wiki/Universal-Style-Compaction-Example) as an example of how output sorted run sizes look like for a common setting.

Parallel compactions are possible if options.max_background_compactions > 1. Same as all other compaction styles, parallel compactions will not work on the same sorted run.

## Subcompaction
Subcompaction is supported in universal compaction. If the output level of a compaction is not "level" 0, we will try to range partitioned the inputs and use number of threads of `options.max_subcompaction` to compact them in parallel. It will help with the problem that full compaction of universal compaction takes too long.

## Options to Tune
Following are options affecting universal compactions:
* options.compaction_options_universal: various options mentioned above
* options.level0_file_num_compaction_trigger the triggering condition of any compaction. It also means after all compactions' finishing, number of sorted runs will be under options.level0_file_num_compaction_trigger+1
* options.level0_slowdown_writes_trigger: if number of sorted runs exceed this value, writes will be artificially slowed down.
* options.level0_stop_writes_trigger: if number of sorted runs exceed this value, writes will stop until compaction finishes and number of sorted runs turn under this threshold.
* options.num_levels: if this value is 1, all sorted runs will be stored as level 0 files. Otherwise, we will try to fill non-zero levels as much as possible. The larger num_levels is, the less likely we will have large files on level 0.
* options.target_file_size_base: effective if options.num_levels > 1. Files of levels other than level 0 will be cut to file size not larger than this threshold.
* options.target_file_size_multiplier: it is effective, but we don't know a way to use this option in universal compaction that makes sense. So we don't recommend you to tune it.

Following options **DO NOT** affect universal compactions:
* options.max_bytes_for_level_base: only for level-based compaction
* options.level_compaction_dynamic_level_bytes: only for level-based compaction
* options.max_bytes_for_level_multiplier and options.max_bytes_for_level_multiplier_additional: only for level-based compaction
* options.expanded_compaction_factor: only for level-based compactions
* options.source_compaction_factor: only for level-based compactions
* options.max_grandparent_overlap_factor: only for level-based compactions
* options.soft_rate_limit and options.hard_rate_limit: deprecated
* options.hard_pending_compaction_bytes_limit: only used for level-based compaction
* options.compaction_pri: only supported in level-based compaction