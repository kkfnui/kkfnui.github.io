---
title: leveldb 文档 impl.html 阅读
tags: leveldb Compactions
category: 学习创作
---

该文档主要说明leveldb使用到文件，以及分级和文件合并的逻辑。

<!--more-->

leveldb 的实现原理和 Bigtable 类似，不过在文件结构组织上存在着差异。
每个数据库的文件都存储在单独的目录结构下面。

## Files 文件

### 日志文件

日志文件 (*.log) 按序保存着最近的操作。每一个更新都会被追加到日志末端。当日志文件大小达到预先定义的大小，就会被转化成一个 `sort table`，并且会创建一个新的日志文件用于新的操作。

当前日志文件在内存会有一份拷贝 `memtable`。每次查询操作都会读取该拷贝，所以读取操作每次获取到最新的被记录的操作。

### Sorted Table

一个 Sorted Table (*.sst) 按照 key 的字母序保存着记录序列。每条记录中保存的是 key 对应的 value，或者是一个删除标记。

Sorted Table 安装层级组织，每个层级都会有一系列这样的文件。由日志文件生成的 Sorted Table 会被放在年轻的级别上，也就是 level-0。当年轻级别上的文件数超过限制后，所有年轻的文件会被和 level-1 有重复的文件合并，生成一系列新的的 level-1 文件。

在年轻级别的不同文件中可以存在相同的key。然而在其他层级的文件中不能包含重复的key。设字母 L 表示层级的层数 (L>=1)。当合并生成 level-L 的文件大小超过 (10^L）MB 的时候，所有 level-(L+!)有重叠key 的文件都会被合并以生成一系列新的 level-(L+1)的文件。*为最小化昂贵的seek开销，这些merge操作通过批量的读写操作，逐步的将新的更新从young level迁移到最大的level下。*

### Manifest 清单文件

清单文件记录每一级的 Sorted Tables，及对应的 key 的范围和其他重要的元信息。每次重新打开数据库都会创建一个新的清单文件。清单文件的格式和日志差不多，服务状态的改变都会被追加到这个日志文件中。

### Current

指明当前使用的清单文件名称

### Info logs

Informational messages are printed to files named LOG and LOG.old.

### Others

Other files used for miscellaneous purposes may also be present (LOCK, *.dbtmp).

## Level 0

当日志文件超过一定大小后：

- 创建一个新的 `memtable` 和日志文件用于记录新的操作
- 后台操作：
	- 将旧的 `memtable` 的内容写到一个 sstable 中
	- 废弃旧的 `memtable`
	- 删除旧的日志文件和旧的 `memtable`
	- 把新的 sstable 添加到 level-0 里

## Compactions，压缩

当 level-L 的大小超过限制的时候，会在后台线程对其进行压缩。压缩操作会选择 level-L 的一个文件以及 level-(L+1) 有 key 重复的文件。在压缩后，旧的文件会被废弃。注意：由于 level-0不同文件中可能存在重复的key，所以需要特殊处理。压缩 level-0 时，可以选择多个文件。

合并将选中的文件生成一系列新的 level-(L+1)层的文件。如果新生成的文件中，有达到限制，我们会切换到该文件继续新一级的合并。如果正在生成的 level-(L+1)文件包含 key 的范围已经和 10+ 个 level-(L+2)文件有重合，也需要继续往下合并，这样可以保证后面的合并不会涉及太多的文件。

旧的文件会被废弃，新的文件会被添加的清单文件中。


每一个层级的压缩都是在 key 区间内轮转的。比如在 level L ,合并后会将合并文件的最后一个key tmp记录下来。下一次合并的时候，就从tmp往后的第一个文件开始（如果没有这样的文件，那么就重头开始）

压缩时会删除重复的值。并且将废弃那些包含删除标记的key。

## Timing

Level-0 压缩最多会读4个 level-0的文件，最差情况加会使用所有 level-1 的文件。那么就是读 14M 写14M。

非level-0的压缩，会从 level-L 选择一个 2M 的文件。最差情况下，会有 12 个拥有重复key的 level L+1的文件——（10 是因为 level-L+1 的文件大小是 level-L 的10倍，另外2 是因为 level-L 的文件一般是没有对齐的）。因此合并操作需要读26M数据写26M数据。假设，磁盘IO操作是 100M/s，最差情况压缩需要0.5s。

如果限制后台写的速度，10%的速度，那么一个压缩操作需要5s。如果用户以10M/s的速度写入数据，那么就会有大量的 level-0 文件产生（会有50个）。这可能会显著增加读操作的开销，因为每次读操作都需要merge更多的文件。

解决方案1：为了降低文件问题的影响，我们可以提升日志文件转换层level-0文件的限制。负面影响是，需要更多的内存保存对应的 memtable.

解决方案2：当level 0下的文件数上升很快时，我们可以人为地降低写操作速率。

解决方案3：尽量降低merge的开销。由于大多数的level 0下的文件的block都已经缓存在cache里了，因此我们只需要关注merge迭代过程中的O(N)的复杂度。








