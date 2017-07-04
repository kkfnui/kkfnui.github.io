---
title: RocksDB Tuning Guide
tags: RocksDB Tuning
category: rocksdb
---


该指导目标是提供足够的信息帮组你在特定的工作负载和系统配置下调优 RocksDB。

RockDB 非常灵活，既有好处也有坏处。
可以调优 RocksDB 适应多种负载情况和不同的存储技术。
在 Facebook，我们使用RocksDB，将数据保存在内存、闪存、机械磁盘。
灵活，有时不是那么友好的。我们引入了大量的调优参数，这些参数会让人迷惑。
我们希望这个指导可以帮组你充分使用系统的资源。

这里，我们假设你已经有了关于 LSM 如何工作的基本知识了。网上已经有大量关于 LSM 的资源了，我们就不在写更多的描述了。

<!--more-->

## 放大因子

Rocksdb 的调优一般是在三个放大因子之间做权衡： 写放大、读放大 和 空间放大。


**写放大**  是写到存储设备的字节数和写到数据库的字节数的比值

比如，以 10M/s 的速度写入数据到数据库，同时观察到磁盘的写速度是 30M/s，写放大因子就是3.
如果写放大太高，那么磁盘的吞吐就会变成瓶颈。假设，写放大是50，那么磁盘的吞吐就 500M/s的时候，
数据库才能维持 10M/s 的写入速度。这种情况下，降低写放大因子可以直接增加数据库的写入效率。

大的写放大同时会缩短 SSD 磁盘使用寿命。
有两种办法可以观察写放大。第一种，通过调用`DB::GetProperty("rocksdb.stats", &stats)`查询输出。
第二种，使用磁盘写入速度除以数据库写入速度。

**读放大** 是指每次查询访问磁盘的次数。如果一次查询需要读5页数据，那么读放大就是5.
逻辑的读是指从缓存中获取数据，可能是 rocksdb 的 cache，也可以是操作系统的缓存。
物理读取择优存储设备处理，闪存或者磁盘。
逻辑的读比物理读更节省资源，但是也会消耗 CPU 资源。
可以通过 `iostat` 计算物理读的速率。该方法也将 LSM compaction 时查询也计算在内了。

**空间放大** 是指数据文件大小和数据库大小的比值。
如果往数据库中插入 10MB 的数据，这消耗了 100MB 的磁盘，那么空间放大就是 10.
我们一般希望空间放大有个上线，以避免磁盘或者内存被耗尽。

如果需要了解不同情况下这三种放大因素的影响，我们强烈推荐去看 [Mark Callaghan's talk at Highload](http://vimeo.com/album/2920922/video/98428203)。


## RocksDB statistics

当调试性能的时候，有些工具可以帮组你：

**statistics** -- Set this to `rocksdb::CreateDBStatistics()`. You can get human-readable RocksDB statistics any time by calling `options.statistics.ToString()`. See [[Statistics|Statistics]] for details.

**stats_dump_period_sec** -- We dump statistics to LOG file every stats_dump_period_sec seconds. This is 3600 by default, which means that stats will be dumped every 1 hour. You can get the same data in the application by calling `db->GetProperty("rocksdb.stats");`

Every **stats_dump_period_sec**, you'll find something like this in your LOG file:

    ** Compaction Stats **
    Level Files  Size(MB) Score Read(GB)  Rn(GB) Rnp1(GB) Write(GB) Wnew(GB) Moved(GB) W-Amp Rd(MB/s) Wr(MB/s) Comp(sec) Comp(cnt) Avg(sec) Stall(sec) Stall(cnt) Avg(ms)     RecordIn   RecordDrop
    -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
    L0      2/0        15   0.5     0.0     0.0      0.0      32.8     32.8       0.0   0.0      0.0     23.0    1457      4346    0.335       0.00          0    0.00             0        0
    L1     22/0       125   1.0   163.7    32.8    130.9     165.5     34.6       0.0   5.1     25.6     25.9    6549      1086    6.031       0.00          0    0.00    1287667342        0
    L2    227/0      1276   1.0   262.7    34.4    228.4     262.7     34.3       0.1   7.6     26.0     26.0   10344      4137    2.500       0.00          0    0.00    1023585700        0
    L3   1634/0     12794   1.0   259.7    31.7    228.1     254.1     26.1       1.5   8.0     20.8     20.4   12787      3758    3.403       0.00          0    0.00    1128138363        0
    L4   1819/0     15132   0.1     3.9     2.0      2.0       3.6      1.6      13.1   1.8     20.1     18.4     201       206    0.974       0.00          0    0.00      91486994        0
    Sum  3704/0     29342   0.0   690.1   100.8    589.3     718.7    129.4      14.8  21.9     22.5     23.5   31338     13533    2.316       0.00          0    0.00    3530878399        0
    Int     0/0         0   0.0     2.1     0.3      1.8       2.2      0.4       0.0  24.3     24.0     24.9      91        42    2.164       0.00          0    0.00      11718977        0
    Flush(GB): accumulative 32.786, interval 0.091
    Stalls(secs): 0.000 level0_slowdown, 0.000 level0_numfiles, 0.000 memtable_compaction, 0.000 leveln_slowdown_soft, 0.000 leveln_slowdown_hard
    Stalls(count): 0 level0_slowdown, 0 level0_numfiles, 0 memtable_compaction, 0 leveln_slowdown_soft, 0 leveln_slowdown_hard

    ** DB Stats **
    Uptime(secs): 128748.3 total, 300.1 interval
    Cumulative writes: 1288457363 writes, 14173030838 keys, 357293118 batches, 3.6 writes per batch, 3055.92 GB user ingest, stall micros: 7067721262
    Cumulative WAL: 1251702527 writes, 357293117 syncs, 3.50 writes per sync, 3055.92 GB written
    Interval writes: 3621943 writes, 39841373 keys, 1013611 batches, 3.6 writes per batch, 8797.4 MB user ingest, stall micros: 112418835
    Interval WAL: 3511027 writes, 1013611 syncs, 3.46 writes per sync, 8.59 MB written

### Compaction stats

层级 N 和 层级 N+1 的合并统计信息会统一在 层级 N+1中体现。以下是快速参考：

* Level - LSM 分级合并的层级。统一合并中，所有文件都在 L0. **Sum** 聚合了所有层的值。 **Int** 是两次统计之间的值的聚合。
* Files - 有两个值，格式是 a/b。第一个值表示当前层级总共有多少个文件。第二个值是表示当前正在做合并的中间总数。
* Score: 非 L0层级该值是 (当前层级的大小)/(最大大小) . 介于0和1之间是正常的，如果大于1意味着该层需要合并。对于 L0 来说，该值是当前文件个数和触发合并的文件个数据阈值的比值。
* Read(GB): Level N 和 N+1 合并时读取的字节数。包含了 levle N 和 N+1 
* Rn(GB): Level N 和 N+1 合并时从 level N 读取的字节数
* Rnp1(GB): Level N 和 N+1 合并时从 level N+1 读取的字节数
* Write(GB): Level N 和 N+1 合并时总共写入的字节数
* Wnew(GB): 新写入到 level N+1 的字节数 —— (total bytes written to N+1) - (bytes read from N+1 during compaction with level N)
* Moved(GB): 合并是移动到 level N+1 的字节总数。该操作不会有 IO， 仅仅是修改 manifest 文件，修改文件归属的 level。
* W-Amp: (写入到 level N+1 总字节数) / ( 总共从 level N 读取的字节数). 这是 level N 和 N+1 之间的写放大系数
* Rd(MB/s): 合并 level N 和 N+1 读取的速率。读取字节数/合并 level n 和 n+1 的耗时
* Wr(MB/s): 合并 level N 和 N+1 写入的速率. See Rd(MB/s).
* Rn(cnt): 合并 level N 和 N+1 从 level n 读取的文件个数
* Rnp1(cnt): 合并 level N 和 N+1 时从 level n+1 读取的文件个数
* Wnp1(cnt): 合并 level N 和 N+1 ,写入到 level n+1 的文件个数
* Wnew(cnt): (Wnp1(cnt) - Rnp1(cnt)) -- 合并 level N 和 N+1 增加的文件数（只是针对 level n+1 的）
* Comp(sec): level N 和 N+1 之间的所有合并操作消耗的时间
* Comp(cnt): level N 和 N+1 之间总共合并过的次数
* Avg(sec): 每次合并平均消耗的时间
* Stall(sec): 由于 level N+1 没有合并，导致该合并被阻塞的时间
* Stall(cnt): 由于 level N+1 没有合并，导致该合并被阻塞的次数
* Avg(ms): 由于 level N+1 没有合并，导致该合并被阻塞的平均时间
* RecordIn: 合并期间进行过比较的记录总数
* RecordDrop: 合并期间丢弃的记录总数

### General stats
除了每一层合并的统计，还有一些通用的统计信息。通用统计包含了 **汇总** 和 **间隔汇总** 两种。汇总是指实例启动到现在为止，间隔汇总则是指距离上一次统计之后的汇总信息。
* Uptime(secs): total -- 该实例已经运行的的时间, interval -- 举例上次 dump 统计信息的时间间隔.
* Cumulative/Interval writes: total -- put 调用总次数; keys --  put 调用写入的记录总数; batches -- put 调用是最终组成的 group 数(不同的 put 操作并发是可能会被归到一个 group 以提升效率); per batch -- 平均每个 batch 操作写入的字节数; ingest -- 总共写入到数据库的数据大小 (不计算合并操作); stall micros - 由于合并不及时导致写阻塞的总共耗时时间
* Cumulative/Interval WAL: writes -- WAL 记录过的总记录数； syncs -fsync or fdatasync 被调用的总次数; writes per sync - 每次 sync对应 write 的操作占比; GB written - WAL 写入的总字节数 
* Stalls: 不同类型的阻塞的阻塞次数和耗时: level0_slowdown -- Stall because of `level0_slowdown_writes_trigger`. level0_numfiles -- Stall because of `level0_stop_writes_trigger`. `memtable_compaction` -- Stall because all memtables were full, flush process couldn't keep up. `leveln_slowdown` -- Stall because of `soft_rate_limit` and `hard_rate_limit`

### Perf Context and IO Stats Context

[Perf Context and IO Stats Context](https://github.com/facebook/rocksdb/wiki/Perf-Context-and-IO-Stats-Context)
可以说明一个查询对应的计数信息。

## Parallelism options

在 LSM 架构下，有两种后台线程：flush 和 compaction。
他们都可以利用存储的并发性使用多线程并发。
Flush 线程具有高优先级，
compaction 线程的优先级较低。
以下可以调整线程池的大小：

     options.env->SetBackgroundThreads(num_threads, Env::Priority::HIGH);
     options.env->SetBackgroundThreads(num_threads, Env::Priority::LOW);
 
为了重复使用多线程的好处，可以通过设置 compactions 和 flushs 的最大并发线程数：

**max_background_compactions** 后台最大并发 compations 数量。默认值是1，如果为了充分使用cpu 和存储，可以将该值调整成和cpu 核数相近的值。

**max_background_flushes** 后台最大并发 flush 操作数。一般情况下设置为 1 就足够了。

## 通用选项
**filter_policy** -- 如果是单点查询，则绝对要打开布隆过滤器。使用布隆过滤器可以减少不必要的磁盘读操作。将 filter_policy 设置为 `rocksdb::NewBloomFilterPolicy(bits_per_key)`.  bits_per_key 默认值是 10, 偏误率大约是 1%。  bits_per_key 越大，偏误率越小, 但是会增加内存使用已经空间放大。

**block_cache** -- 通常建议设置为 `rocksdb::NewLRUCache(cache_capacity, shard_bits)`. Block cache 缓存的数据没有压缩. OS cache, 则会缓存压缩的数据(因为文件保存在磁盘的时候是压缩的). 因此, 使用block_cache 和 OS cache 都是有使用场景的. 访问 block cache 时是需要加锁的，有些时候会发现访问 block cache 的 muxtex 会成为 RocksDB 的瓶颈，尤其是当 DB 比内存小的时候。这种情况下，可以将 shard_bits 增大以增加 block cache 的分片。如果 shard_bits 是 4, 那么就会有 16 个分片了。

**allow_os_buffer** -- 如果为 false， rocksdb 将不会将文件缓存在操作系统缓存中了。

**max_open_files** -- RocksDB 会将所有的文件句柄保存在 table cache 中。如果文件句柄数超过 max_open_files, 那么一些文件将会从 table cache 中释放且文件句柄会被关闭。这也就意味着没一个读操作都需要通过 table cache 查找需要的文件。 将 max_open_files 设置成 -1 则会保持所有文件被打开，以避免昂贵的 table cache 调用。

**table_cache_numshardbits** -- 该选项控制 table cache 的分片。如果 table cache 的 mutex 存在严重的竞争则调大该值。

**block_size** -- RocksDB 将用户的数据打包在 blocks 中。 当从 table file 中查询一个 KV， 整个 block 将会被加载到内存中。默认 block_size 是4KB。每一个 table file 中保存了所有文件中 block 的偏移位置。 调大 block_size 意味着索引中就会有更少的记录，也就会更小。
调大 block_szie 会减少内存的使用和空间放大，但是会增加读放大。

## Sharing cache and thread pool
有些时候你可能希望在同一个进程中跑多个 RocksDB 实例。 RocksDB 提供了一种方法，让不同的实例使用相同的缓存和线程池。
通过分配相同的缓存对象到所有实例：

    first_instance_options.block_cache = second_instance_options.block_cache = rocksdb::NewLRUCache(1GB)

这样所有实例会共享 1G 的 block cache。

线程池则是和 Env 对象关联起来。当你构建 Options 对象， option.env 设置为 `Env::Default()`, 一般都是最好的。
因为所有 Options使用相同的静态对象 `Env::Default()` , 线程池则默认是共享的。

## Flushing options

所有数据都先写到内存数据结构 memtable.
当 **active memtable** 满了之后，就会创建一个新的 memtable，并且将旧的对象标记成只读。
我们将只读的 memtable 标记为不可变。在任何时候至少会有一个可写的 memtable 和 0个或多个不可变的 memtables。
不可变 memtable 都在等待刷到存储设备中。有三个选项可以控制刷新操作。


**write_buffer_size** 单个 memtable 的大小。 一旦 memtable 超过该值，就会将该 memtable 标记为不可变的，并且创建一个新的 memtable。

**max_write_buffer_number** 设置 memtables 最多的个数，包含不可变的。如果可写的 memtalbe 被写满，并且 memtables 的个数超过 max_write_buffer_number。那么写操作就会被阻塞。这种情况会发生在刷磁盘的速度慢与写入数据库的速度。

**min_write_buffer_number_to_merge** 最小需要多少个 memtables 合并后才能刷到存储设备中。比如，该选项是2，那么不可变的 memtables 只有达到了两个才会刷到磁盘。如果仅仅只有一个，那么永远都不会刷的磁盘。如果多个 memtable 合并到一起，写入到磁盘的数据可能会比两个 memtable 加起来的少。因为两个 memtable 可能存在重复的数据。因此每一个 Get 操作需要线性遍历所有不可变的 memtable，确认是否存在该 key。该值如果太高会影响读取的性能。

实例选项：
    write_buffer_size = 512MB;
    max_write_buffer_number = 5;
    min_write_buffer_number_to_merge = 2;


当写入速度是 16M/s 时，那么没 32秒 会创建一个新的 memtable， 没64秒会合并两个 memtable 并且刷到磁盘中。
根据实际情况，刷到磁盘的数据大小在 512M 和 1G 之间。
为了防止出现刷磁盘速度更不上写入速度，memtables 的内存使用上线时 5*512M=2.5G。
当达到这个上线，后面的写操作都会被阻塞，直到刷磁盘操作完成释放了内存。

## Level Style Compaction
在分层合并中，文件分成了不同的层级。
memtables 刷到磁盘层位了 level 0， 保存在最新的数据。
越高的层级包含了更老的数据。在 level 0 的数据有可能重叠，但是在 level 1或者更高层级的文件，相互之间是没有重叠的。
这样 Get 操作通常需要查询 level 0  的每一个文件，但是对于连续的层级，至多有一个文件包含了该 key。
每一层包含的数据默认都是之前层级的10倍。

一个合并操作需要从 levle N 读取几个文件然后和 level N+1 存在 key 重合的文件合并。
两个合并操作在不同层级或者不同的 key 范围都可以并发的执行。
合并速度和最大写入速度成正比。如果合并更不上写入的速度，空间占用会持续的增大。
将 RocksDb 的合并操作可以并发执行并且能够充分利用存储设备是**非常重要的**。

Level 0 和 1 的合并操作是复杂的。
level 0 文件的 key 通常涵盖了整个 key 空间。
当合并 L0->L1, 合并操作包含了所有 level 1 的文件。
所有 level 1 的文件都在进行 L0 到 L1 的合并操作。那么 L1 -> L2 的合并则不能进行。
必须等待 L0 -> L1 的合并操作完成。
如果 L0 -> L1 的合并太慢，那么这个系统会一直合并，因为其他合并的操作必须等待 L0->L1的合并操作完成。 

L0->L1 的合并操作也是单线程的。使用单线程合并很难达到高的吞吐量。
确定这是不是个问题，检查 disk 的使用率。如果磁盘没有完全利用起来，
那么就是合并操作的配置出来问题。我们通常建议将 level 0 的大小设置成和 level 1 一样大，以使 L0->L1 的合并操作尽可能的快。

当你决定使用和 level 1 近似的大小，那么就必须确定层级之间的倍数了。
那么假设 level 1 的大小是 512M， 层级之间的倍数是 10 并且数据库的大小是 500GB。
Level 2 的大小会是 5GB， level 3 51GB ，level 4 512GB。
因为数据库总共才500GB，所以 level 5 或者更高的层级会是空的。


空间放大容易计算， `(512 MB + 512 MB + 5GB + 51GB + 512GB) / (500GB) = 1.14`。
那么怎么计算写放大放大呢？每一次写入首先是写到 level 0，然后合并到 level 1.
因为 level 1 的空间大小和 level 0 是一样的， L0->L1 合并写放大是2。
然后当一个字节从 level1 合并到 level 2，就会和 level2 的10个字节合并。
其他层级的合并操作一样。


所以总的写放大大约是 `1 + 2 + 10 + 10 + 10 = 33`。单个查询必须先访问所有 L0 的所有文件和其他层级最多一个文件。
当然，布隆过滤器可以极大的减少读放大。
布隆过滤器对扫描操作无效，因此较小的扫描操作是比较昂贵的。其读放大是 `number_of_level0_files + number_of_non_empty_levels`.

下面是可以控制分层合并的一线参数。按重要程度依次介绍相关参数：

**level0_file_num_compaction_trigger** -- 当 level 0 的文件数达到该值会触发 L0->L1的合并操作。因此我们可以估算 level 0 的稳定状态的大小 `write_buffer_size * min_write_buffer_number_to_merge * level0_file_num_compaction_trigger`.

**max_bytes_for_level_base** and **max_bytes_for_level_multiplier** -- max_bytes_for_level_base 是 level 1 最大的字节数。如上所说，我们建议 level 1 的大小和 level 0 相近。之后的每层文件大小是之前的10倍。默认的就是10，我们不建议修改该值。

**target_file_size_base** and **target_file_size_multiplier** -- 在 level 1 的文件大小将会是 target_file_size_base。
之后的每一层文件大小都比之前大，是前面一层的 target_file_size_multiplier 倍。 然而，默认 target_file_size_multiplier 是 1,
所以L1 到 Lmax 的文件是一样大的。
增加 target_file_size_base 会减少总共的文件数，一般来说的是有利的。我们建议将  target_file_size_base 设置为 `max_bytes_for_level_base / 10`,  这样 level 1 就会只有 10 个文件，可以加快 L0 -> L1 的合并。

**compression_per_level** -- 通过该选项设置不同层级的压缩策略。 一般情况下，我们尽可能避免对 level 0 和 level 1 进行压缩。
我们可以在高层级使用压缩率高的算法，在第层级使用压缩快的算法。

**num_levels** -- 该值比预期的层级数量大是安全的，高层级的文件可能是空的，但是不会对性能造成任何影响。如果需要高于7层级，则需要修改该选项。默认是7层。

## Universal Compaction
Write amplification of a level style compaction may be high in some cases. For write-heavy workloads, you may be bottlenecked on disk throughput. To optimize for those workloads, RocksDB introduced a new style of compaction that we call universal compaction, intended to decrease write amplification. However, it may increase read amplification and always increases space amplification. **Universal compaction has a size limitation. Please be careful when your DB (or column family) size is over 100GB.** Check [Universal Compaction](https://github.com/facebook/rocksdb/wiki/Universal-Compaction) for details.

With universal compaction, a compaction process may temporarily increase size amplification by a factor of two. In other words, if you store 10GB in database, the compaction process may consume additional 10GB, in addition to space amplification. 

However, there are techniques to help reduce the temporary space doubling. If you use universal compaction, we strongly recommend sharding your data and keeping it in multiple RocksDB instances. Let's assume you have S shards. Then, configure Env thread pool with only N compaction threads. Only N shards out of total S shards will have additional space amplification, thus bringing it down to `N/S` instead of 1. For example, if your DB is 10GB and you configure it with 100 shards, each shard will hold 100MB of data. If you configure your thread pool with 20 concurrent compactions, you will only consume extra 2GB of data instead of 10GB. Also, compactions will execute in parallel, which will fully utilize your storage concurrency.

**max_size_amplification_percent** -- Size amplification as defined by amount of additional storage needed (in percentage) to store a byte of data in the database. Default is 200, which means that a 100 byte database could require up to 300 bytes of storage. 100 bytes of that 300 bytes are temporary and are used only during compaction. Increasing this limit decreases write amplification, but (obviously) increases space amplification.

**compression_size_percent** -- Percentage of data in the database that is compressed. Older data is compressed, newer data is not compressed. If set to -1 (default), all data is compressed. Reducing compression_size_percent will reduce CPU usage and increase space amplification.

See [Universal Compaction](https://github.com/facebook/rocksdb/wiki/Universal-Compaction) page for more information on universal compaction.

## Write stalls
See [Write Stalls](https://github.com/facebook/rocksdb/wiki/Write-Stalls) page for more details.

## Prefix databases
 所有数据保存在 RocksDB 是有序的，所以支持按序遍历。然而，有些应用不需要 keys 完全的有序。他们进关注这些 key 是不是有一样的前缀。

这些应用可以通过配置DB 的 `prefix_extractor`选项来获利。

**prefix_extractor** --  SliceTransform 类型的对象，定义了 key 的前缀。 Key 前缀用来做一些优化：

1. 定义基于前缀的布隆过滤器，可以用来减少基于前缀的范围查询的读放大。比如给出所有以`XXX`为前缀的所有 key。需要定义**Options::filter_policy**.
2. 使用基于 hash-map 的 memtables，以避免在 memtables 中使用二分查找。
3. 增加 tables file 的 hash 索引，以避免在 table files 之间二分查找

查看 [Custom memtable and table factories](https://github.com/facebook/rocksdb/wiki/Basic-Operations#memtable-and-table-factories)， 以了解更多关于 (2),(3).
请注意(1)一般用来减少 I/O。 (2)和(3)在一些场景下可以通过消耗些内存降低 cpu 的占用。
如果 CPU 是瓶颈，且简单的调优不能解决问题，则可以尝试该选项。该选项不具有通用性。

请务必查看  `include/rocksdb/options.h` 文件中关于 prefix_extractor 的注释。

## Bloom filters
Bloom filters are probabilistic data structures that are used to test whether an element is part of a set. Bloom filters in RocksDB are controlled by an option *filter_policy*. When a user calls Get(key), there is a list of files that may contain the key. This is usually all files on Level 0 and one file from each Level bigger than 0. However, before we read each file, we first consult the bloom filters. Bloom filters will filter out reads for most files that do not contain the key. In most cases, Get() will do only one file read. Bloom filters are always kept in memory for open files, unless `BlockBasedTableOptions::cache_index_and_filter_blocks` is set to true. Number of open files is controlled by `max_open_files` option.

There are two types of bloom filters: block-based and full filter.

### Block-based filter
Set up block based filter by calling: `options.filter_policy.reset(rocksdb::NewBloomFilterPolicy(10, true))`. Block-based bloom filter is built separately for each block. On a read we first consult an index, which returns the block of the key we're looking for. Now that we have a block, we consult the bloom filter for that block.

### Full filter
Set up block based filter by calling: `options.filter_policy.reset(rocksdb::NewBloomFilterPolicy(10, false))`. Full filters are built per-file. There is only one bloom filter for a file. This means we can first consult the bloom filter without going to the index. In situations when key is not in the bloom filter, we saved one index lookup compared to block-based filter.

## Custom memtable and table format

高级用户可以自定义 memtable 和 table 的格式。

**memtable_factory** -- 定义memtable 实现。下列是已经支持的实现：

1. SkipList -- memtable 的默认实现
2. HashSkipList -- 仅当设置了 prefix_extractor 时才有效。 根据 key 的前缀，将不同的 key 保存在不同的桶中。每个桶中是一个 skip list。
3. HashLinkedList -- 仅当设置了 prefix_extractor 时才有效。 根据 key 的前缀，将不同的 key 保存在不同的桶中。每个桶中是一个 linked list。

**table_factory** -- 定义了 table 的格式。下列是已经支持的格式：

1. Block based - -默认的格式. 这个适合将数据保存在磁盘和缓存中。因为数据是按照 block 大小分块，划分地址的。因此称为 block based。
2. Plain Table -- 仅当设置了 prefix_extractor 时才有效。 适合将数据存在内存中(on tmpfs filesystem). 是可以根据字节寻址的。

## Memory usage
To learn more about how RocksDB uses memory, check out this wiki page: https://github.com/facebook/rocksdb/wiki/Memory-usage-in-RocksDB

## Difference of spinning disk
##### Memory / Persistent Storage ratio is usually much lower for databases on spinning disks. If the ratio of data to RAM is too large then you can reduce the memory required to keep performance critical data in RAM. Suggestions:
* Use relatively **larger block sizes** to reduce index block size. You should use at least 64KB block size. You can consider 256KB or even 512KB. The downside of using large blocks is that RAM is wasted in the block cache.
* Turn on **BlockBasedTableOptions.cache_index_and_filter_blocks=true** as it's very likely you can't fit all index and bloom filters in memory. Even if you can, it's better to set it for safety.
* **enable options.optimize_filters_for_hits** to reduce some bloom filter block size.
* Be careful about whether you have enough memory to keep all bloom filters. If you can't then bloom filters might hurt performance.
* Try to **encode keys as compact as possible**. Shorter keys can reduce index block size.  

##### Spinning disks usually provide much lower random read throughput than flash.
* Set **options.skip_stats_update_on_db_open=true** to speed up DB open time.
* This is a controversial suggestion: use **level-based compaction**, as it is more friendly to reduce reads from disks.
* If you use level-based compaction, use **options.level_compaction_dynamic_level_bytes=true**.
* Set **options.max_file_opening_threads** to a value larger than 1 if the server has multiple disks.

##### Throughput gap between random read vs. sequential read is much higher in spinning disks. Suggestions:
* Enable RocksDB-level read ahead for compaction inputs: **options.compaction_readahead_size** with **options.new_table_reader_for_compaction_inputs=true**
* Use relatively **large file sizes**. We suggest at least 256MB
* Use relatively larger block sizes

##### Spinning disks are much larger than flash:
* To avoid too many file descriptors, use larger files. We suggest at least file size of 256MB.
* If you use universal compaction style, don't make single DB size too large, because the full compaction will take a long time and impact performance. You can use more DBs but single DB size is smaller than 500GB.

## Example configurations
In this section we will present some RocksDB configurations that we actually run in production.

### Prefix database on flash storage
This service uses RocksDB to perform prefix range scans and point lookups. It is running on Flash storage.

     options.prefix_extractor.reset(new CustomPrefixExtractor());

Since the service doesn't need total order iterations (see [Prefix databases](#prefix-databases)), we define prefix extractor.

     rocksdb::BlockBasedTableOptions table_options;
     table_options.index_type = rocksdb::BlockBasedTableOptions::kHashSearch;
     table_options.block_size = 4 * 1024;
     options.table_factory.reset(NewBlockBasedTableFactory(table_options));

We use a hash index in table files to speed up prefix lookup, but it increases storage space and memory usage.

     options.compression = rocksdb::kLZ4Compression;

LZ4 compression reduces CPU usage, but increases storage space.

     options.max_open_files = -1;

This setting disables looking up files in table cache, thus speeding up all queries. This is always a good thing to set if your server has a big limit on open files.

     options.options.compaction_style = kCompactionStyleLevel;
     options.level0_file_num_compaction_trigger = 10;
     options.level0_slowdown_writes_trigger = 20;
     options.level0_stop_writes_trigger = 40;
     options.write_buffer_size = 64 * 1024 * 1024;
     options.target_file_size_base = 64 * 1024 * 1024;
     options.max_bytes_for_level_base = 512 * 1024 * 1024;

We use level style compaction. Memtable size is 64MB and is flushed periodically to Level 0. Compaction L0->L1 is triggered when there are 10 level 0 files (total 640MB). When L0 is 640MB, compaction is triggered into L1, the max size of which is 512MB.
Total DB size???

     options.max_background_compactions = 1
     options.max_background_flushes = 1

There can be only 1 concurrent compaction and 1 flush executing at any given time. However, there are multiple shards in the system, so multiple compactions occur on different shards. Otherwise, storage wouldn't be saturated with only 2 threads writing to storage.

     options.memtable_prefix_bloom_bits = 1024 * 1024 * 8;

With memtable bloom filter, some accesses to the memtable can be avoided.

     options.block_cache = rocksdb::NewLRUCache(512 * 1024 * 1024, 8);

Block cache is configured to be 512MB. (is it shared across the shards?)

### Total ordered database, flash storage
This database performs both Get() and total order iteration. Shards????

    options.env->SetBackgroundThreads(4);

We first set a total of 4 threads in the thread pool.

    options.options.compaction_style = kCompactionStyleLevel;
    options.write_buffer_size = 67108864; // 64MB
    options.max_write_buffer_number = 3;
    options.target_file_size_base = 67108864; // 64MB
    options.max_background_compactions = 4;
    options.level0_file_num_compaction_trigger = 8;
    options.level0_slowdown_writes_trigger = 17;
    options.level0_stop_writes_trigger = 24;
    options.num_levels = 4;
    options.max_bytes_for_level_base = 536870912; // 512MB
    options.max_bytes_for_level_multiplier = 8;

We use level style compaction with high concurrency. Memtable size is 64MB and the total number of level 0 files is 8. This means compaction is triggered when L0 size grows to 512MB. L1 size is 512MB and every level is 8 times larger than the previous one. L2 is 4GB and L3 is 32GB.

### Database on Spinning Disks
Coming soon...

### In-memory database with full functionalities
In this example, database is mounted in tmpfs file system.

Use mmap read:

   options.allow_mmap_reads = true;

Disable block cache, enable bloom fitlers and reduce the delta encoding restart interval:

    BlockBasedTableOptions table_options;
    table_options.filter_policy.reset(NewBloomFilterPolicy(10, true));
    table_options.no_block_cache = true;
    table_options.block_restart_interval = 4;
    options.table_factory.reset(NewBlockBasedTableFactory(table_options));

If you want to prioritize speed. You can disable compression:

    options.compression = rocksdb::CompressionType::kNoCompression;

Otherwise, enable a lightweight compression, LZ4 or Snappy.

Set up compression more aggressively and allocate more threads for flush and compaction:

    options.level0_file_num_compaction_trigger = 1;
    options.max_background_flushes = 8;
    options.max_background_compactions = 8;
    options.max_subcompactions = 4;

Keep all the files open:

    options.max_open_files = -1;

When reading data, consider to turn ReadOptions.verify_checksums = false.


### In-memory prefix database
In this example, database is mounted in tmpfs file system. We use customized formats to speed up, while some functionalities are not supported. We support only Get() and prefix range scans. Write-ahead logs are stored on hard drive to avoid consuming memory not used for querying. Prev() is not supported.

Since this database is in-memory, we don't care about write amplification. We do, however, care a lot about read amplification and space amplification. This is an interesting example because we tune the compaction to an extreme so that usually only one SST table exists in the system. We therefore decrease read and space amplification, while write amplification is extremely high.

Since universal compaction is used, we will effectively double our space usage during compaction. This is very dangerous with in-memory database. We therefore shard the data into 400 RocksDB instances. We allow only two concurrent compactions, so only two shards may double space use at any one time.

In this case, prefix hash can be used to allow the system to use hash indexing instead of a binary one, as well as bloom filter for iterations when possible:

    options.prefix_extractor.reset(new CustomPrefixExtractor());

Use the memory addressing table format built for low-latency access, which requires mmap read mode to be on: 

    options.table_factory = std::shared_ptr<rocksdb::TableFactory>(rocksdb::NewPlainTableFactory(0, 8, 0.85));
    options.allow_mmap_reads = true;
    options.allow_mmap_writes = false;

Use hash link list memtable to change binary search to hash lookup in mem table:

    options.memtable_factory.reset(rocksdb::NewHashLinkListRepFactory(200000));

Enable bloom filter for hash table to reduce memory accesses (usually means CPU cache misses) when reading from mem table to one, for the case where key is not found in mem tables:

    options.memtable_prefix_bloom_bits = 10000000;
    options.memtable_prefix_bloom_probes = 6;

Tune compaction so that, a full compaction is kicked off as soon as we have two files. We hack the parameter of universal compaction:

    options.compaction_style = kUniversalCompaction;
    options.compaction_options_universal.size_ratio = 10;
    options.compaction_options_universal.min_merge_width = 2;
    options.compaction_options_universal.max_size_amplification_percent = 1;
    options.level0_file_num_compaction_trigger = 1;
    options.level0_slowdown_writes_trigger = 8;
    options.level0_stop_writes_trigger = 16;

Tune bloom filter to minimize memory accesses:

    options.bloom_locality = 1;

Reader objects for all tables are always cached, avoiding table cache access when reading:

    options.max_open_files = -1;

Use one mem table at one time. Its size is determined by the full compaction interval we want to pay. We tune compaction such that after every flush, a full compaction will be triggered, which costs CPU. The larger the mem table size, the longer the compaction interval will be, and at the same time, we see less memory efficiency, worse query performance and longer recovery time when restarting the DB.

    options.write_buffer_size = 32 << 20;
    options.max_write_buffer_number = 2;
    options.min_write_buffer_number_to_merge = 1;

Multiple DBs sharing the same compaction pool of 2:

    options.max_background_compactions = 1;
    options.max_background_flushes = 1;
    options.env->SetBackgroundThreads(1, rocksdb::Env::Priority::HIGH);
    options.env->SetBackgroundThreads(2, rocksdb::Env::Priority::LOW);

Settings for WAL logs:

    options.bytes_per_sync = 2 << 20;

### Suggestion for in memory block table
**hash_index:** In the new version, hash index is enabled for block based table. It would use 5% more storage space but speed up the random read by 50% compared to normal binary search index.

    table_options.index_type = rocksdb::BlockBasedTableOptions::kHashSearch;

**block_size:** By default, this value is set to be 4k. If compression is enabled, a smaller block size would lead to higher random read speed because decompression overhead is reduced. But the block size cannot be too small to make compression useless. It is recommended to set it to be 1k.

**verify_checksum:** As we are storing data in tmpfs and care read performance a lot, checksum could be disabled.

## Final thoughts
Unfortunately, configuring RocksDB optimally is not trivial. Even we as RocksDB developers don't fully understand the effect of each configuration change. If you want to fully optimize RocksDB for your workload, we recommend experiments and benchmarking, while keeping an eye on the three amplification factors. Also, please don't hesitate to ask us for help on the [RocksDB Developer's Discussion Group](https://www.facebook.com/groups/rocksdb.dev/).