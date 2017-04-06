---
title: 【翻译】Block Cache
tags: RocksDB 翻译
category: rocksdb
---


RocksDB 读取的缓存数据放在 Block cache 中。 使用者可以给 RocksDB 实例设置制定大小的 `Cache` 对象。
 一个 `Cache` 对象可以被一个进程内的多个 RocksDB 实例共享, 让用户可以控制整个进程的缓存容量。
 Block cache 中保存的数据是未压缩的。用户还可以设置第二块 block cache 保存压缩过的数据。
 读取数据的时候,会先读取未压缩的 block cache, 然后是压缩后的 block cache。
如果启用了 [Direct-IO](), 则可以使用压缩后的 block cache 替换操作系统的页缓存。


Cache 在 RocksDB 中有两种实现, 分别是 `LRUCache` 和 `ClockCache`。
两种缓存都有做分片,以减少锁的竞争。容量最终被平分到每个分片, 分片之前的容量是独立记录的。
默认情况下, 缓存会被分为 64 个分片, 并且每个分片最小的缓存数据是 512K。



### Usage


默认情况下, RocksDB 使用的是 LRU-based block cache, 大小为 8MB。
可以自定义 RocksDB 的缓存, 通过 `NewLRUCache()` 或者 `NewClockCache` 创建缓存对象,
并且将对象设置到 block based tables 选项中。
使用者可以通过实现 `Cache` 接口, 创建自己的缓存实现策略。

    std::shared_ptr<Cache> cache = NewLRUCache(capacity);
    BlockBasedTableOptions table_options;
    table_options.block_cache = cache;
    Options options;
    options.table_factory.reset(new BlockBasedTableFactory(table_options));

设置压缩后的缓存:

    table_options.block_cache_compressed = another_cache;

如果 `block_cache` 被设置为 `nullptr`, 那么 RocksDB 会使用默认的 block cache。 下面的方式可以完全禁用 block cache:

    table_options.no_block_cache = true;

### LRU Cache

默认情况下, RocksDB 使用的是 LRU-based block cache, 大小为 8MB。
缓存中的每个分片都有独立的 LRU 列表 和 hash table。
同步操作通过一个 pre-shard mutex 来实现。
查找和插入操作都需要先获得该分片的锁先。
用户可以通过方法 `NewLRUCache()` 来创建一个 LRU cache。
该方法提供了几个有用的选项:

* `capacity`: Total size of the cache.
* `num_shard_bits`: The number of bits from cache keys to be use as shard id. The cache will be sharded into `2^num_shard_bits` shards.
* `strict_capacity_limit`: In rare case, block cache size can go larger than its capacity. This is when ongoing reads or iterations over DB pin blocks in block cache, and the total size of pinned blocks exceed the cpacity. If there are further reads which try to insert blocks into block cache, if `strict_capacity_limit=false`(default), the cache will fail to respect its capacity limit and allow the insertion. This can create undesired OOM error that crashes the DB if the host don't have enough memory. Setting the option to `true` will reject further insertion to the cache and fail the read or iteration. The option works on per-shard basis, means it is possible one shard is rejecting insert when it is full, while another shard still have extra unpinned space.
* `high_pri_pool_ratio`: The ratio of capacity reserve for high priority blocks. See [[Caching index and filter blocks|Block-Cache#caching-index-and-filter-blocks]] section below for more information.

### Clock Cache

`ClockCache` 实现了 [CLOCK algorithm](https://en.wikipedia.org/wiki/Page_replacement_algorithm#Clock)。
每个分片内都包含了一个环形的缓存项列表。
一个定时的处理函数会遍历环形列表, 寻找过期的数据并让其失效。但是如果一个数据最近被有被使用到,那么该数据还可以继续保留在 cache 中。
`tbb::concurrent_hash_map` 用来查找元素。

相对于 `LRUCache`, `ClockCache` 拥有更小粒度的锁。 在 LRU cache 的实现中, 查找操作需要更新 LRU-list, 所以也需要获得 pre-shard mutex。
在 `ClockCache` 中查找操作不需要锁定 pre-shard mutex, 仅需要从 concurrent hash map 查找, 该操作拥有小粒度的锁操作。
仅仅只有插入操作需要锁定 pre-shard mutex.
在相同的环境中, clock cache 相较于 LRU cache 可以提升读的吞吐量(see inline comments in `util/clock_cache.cc` for benchmark setup:

    Threads Cache     Cache               ClockCache               LRUCache
            Size  Index/Filter Throughput(MB/s)   Hit Throughput(MB/s)    Hit
        32   2GB       yes               466.7  85.9%           433.7   86.5%
        32   2GB       no                529.9  72.7%           532.7   73.9%
        32  64GB       yes               649.9  99.9%           507.9   99.9%
        32  64GB       no                740.4  99.9%           662.8   99.9%
        16   2GB       yes               278.4  85.9%           283.4   86.5%
        16   2GB       no                318.6  72.7%           335.8   73.9%
        16  64GB       yes               391.9  99.9%           353.3   99.9%
        16  64GB       no                433.8  99.8%           419.4   99.8%

使用 `NewClockCache()` 方法可以创建一个 clock cache 对象。
为了使用 clock cache , 还需要连接 [Intel TBB](https://www.threadingbuildingblocks.org/) library。
同样,有些选项可以设置:

* `capacity`: Same as LRUCache.
* `num_shard_bits`: Same as LRUCache.
* `strict_capacity_limit`: Same as LRUCache.

### Caching Index and Filter Blocks

By default index and filter blocks is cached outside of block cache, and users won't be able to control how much  memory should be use to cache these blocks, other than setting `max_open_files`. Users can opt for cache index and filter blocks in block cache, which allows for better control of memory used by RocksDB. To cache index and filter blocks in block cache:

    BlockBasedTableOptions table_options;
    table_options.cache_index_and_filter_blocks = true;

By putting index and filter blocks in block cache, these blocks has to compete against data blocks for staying in cache. Although index and filter blocks are being access more frequently than data block, there are scenarios where these blocks can be thrashing. This is undesired because index and filter blocks tend to be much larger than data blocks, and they are usually of higher value to stay in cache. There are two options to tune to mitigate the problem:

* `cache_index_and_filter_blocks_with_high_priority`: Set priority to high for index and filter blocks in block cache. It only affect `LRUCache` so far, and need to use together with `high_pri_pool_ratio` when calling `NewLRUCache()`. If the feature is enabled, LRU-list in LRU cache will be split into two parts, one for high-pri blocks and one for low-pri blocks. Data blocks will be inserted to the head of low-pri pool. Index and filter blocks will be inserted to the head of high-pri pool. If the total usage in the high-pri pool exceed `capacity * high_pri_pool_ratio`, the block at the tail of high-pri pool will overflow to the head of low-pri pool, after which it will compete against data blocks to stay in cache. Eviction will start from the tail of low-pri pool.

* `pin_l0_filter_and_index_blocks_in_cache`: Pin level-0 file's index and filter blocks in block cache, to avoid them being evicted. Level-0 index and filters are being access more frequently. Also they tend to be smaller in size so hopefully pinning them in cache won't consume too much capacity.

> This is undesired because index and filter blocks tend to be much larger than data blocks, and they are usually of higher value to stay in cache.
> 将 l0 的 filter 和 index 放在 cache 的参数调优还是蛮靠谱的


### Simulated Cache

`SimCache` is a utility to predict cache hit rate if cache capacity or number of shards is changed. It wraps around the real `Cache` object that the DB is using, and runs a shadow LRU cache simulating the given capacity and number of shards, and measure cache hits and misses of the shadow cache. The utility is useful when user want to open a DB with, say, 4GB cache size, but would like to know what the cache hit rate will become if cache size enlarge to, say, 64GB. To create a simulated cache:

    // This cache is the actual cache use by the DB.
    std::shared_ptr<Cache> cache = NewLRUCache(capacity);
    // This is the simulated cache.
    std::shared_ptr<Cache> sim_cache = NewSimCache(cache, sim_capacity, sim_num_shard_bits);
    BlockBasedTableOptions table_options;
    table_options.block_cache = sim_cache;

The extra memory overhead of the simulated cache is less than 2% of `sim_capacity`.

### Statistics

A list of block cache counters can be accessed through `Options.statistics` if it is non-null.

    // total block cache misses
    // REQUIRES: BLOCK_CACHE_MISS == BLOCK_CACHE_INDEX_MISS +
    //                               BLOCK_CACHE_FILTER_MISS +
    //                               BLOCK_CACHE_DATA_MISS;
    BLOCK_CACHE_MISS = 0,
    // total block cache hit
    // REQUIRES: BLOCK_CACHE_HIT == BLOCK_CACHE_INDEX_HIT +
    //                              BLOCK_CACHE_FILTER_HIT +
    //                              BLOCK_CACHE_DATA_HIT;
    BLOCK_CACHE_HIT,
    // # of blocks added to block cache.
    BLOCK_CACHE_ADD,
    // # of failures when adding blocks to block cache.
    BLOCK_CACHE_ADD_FAILURES,
    // # of times cache miss when accessing index block from block cache.
    BLOCK_CACHE_INDEX_MISS,
    // # of times cache hit when accessing index block from block cache.
    BLOCK_CACHE_INDEX_HIT,
    // # of times cache miss when accessing filter block from block cache.
    BLOCK_CACHE_FILTER_MISS,
    // # of times cache hit when accessing filter block from block cache.
    BLOCK_CACHE_FILTER_HIT,
    // # of times cache miss when accessing data block from block cache.
    BLOCK_CACHE_DATA_MISS,
    // # of times cache hit when accessing data block from block cache.
    BLOCK_CACHE_DATA_HIT,
    // # of bytes read from cache.
    BLOCK_CACHE_BYTES_READ,
    // # of bytes written into cache.
    BLOCK_CACHE_BYTES_WRITE,