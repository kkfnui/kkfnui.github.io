---
title: Blob in RocksDB
tags: RocksDB Blob
category: rocksdb
---

## 概述


Blob 是 Rocksdb 正在开发的一个新的存储方式，将 Key 和 Value 分开存储。适用于 Value 较大的应用场景。
在使用纯 LSM 保存 Key 和 Valude 的时候，Value 有可能较大，但是 Key 较小的情况。
由于 Value 较大，导致整体保存的数据变大，因此更容易触发 LSM 的 compaction。

因为 Value 大于 Key 是一种通用场景，比如我们现在做的个性化推荐中，Value 就可以达到 20KB。
所以将 Value 区分对待就很有必要了。LSM 的 compaction 为了保证 Key 的顺序性， 因此合并的时候带来了读写放大问题。
而 Blob 中仅将 Key 保存在 LSM Tree 中，则其放大的影响会很小。Value 的 GC，则可以使用复制清除算法，从而达到优化写放大问题。

但是将 Key 和 Value 分开存储，在程序实现上，给回收会带来一定麻烦。
同时，在性能上也是有一定妥协，查询数据IO 操作会比原来多。

<!--more-->


## Blob 的实现

### 整体结构

![blog 分离 key 和 value 结构](/assets/img/blog/blob/blob.png)

如上图， Key 依旧保存在 LSM Tree 的结构上，将 value 写到 BlobFile 中。
通过不同的 GC/Compaction 策略，减少 Compact 带来的读写放大的问题。

### Blob 数据结构

以下几个数据结构是 Blob 的关键。它们之间的关系是：

1. 先通过 LSM 上面的 value，解码得到 BlobHandler
1. BlobHanler 包含了 BlobFile 的 number，可以以此找到 BlobFile
1. BlobFile 的概要信息保存在 BlobLogHeader 和 BlobLogFooter 中
1. 正真的 value 则保存在 BlogLogRecorder 中

#### BlobHeader

```cpp
class BlobLogHeader {

  // ... 略去部分代码
 private:
  uint32_t magic_number_ = 0;
  uint32_t version_ = 1;
  CompressionType compression_;           // 数据压缩类型
  std::unique_ptr<ttlrange_t> ttl_guess_; // 预分配该文件允许写入 key 的 TTL 时间范围
  std::unique_ptr<tsrange_t> ts_guess_;   // 没有看到对实例逻辑产生影响，可能是用于数据迁移使用

 public:
  // magic number + version + flags + ttl guess + timestamp range = 36
  static const size_t kHeaderSize = 4 + 4 + 4 + 4 * 2 + 8 * 2;

  // ... 略去部分方法定义
};

```

#### BlobFooter


```cpp

// Footer encapsulates the fixed information stored at the tail
// end of every blob log file.
class BlobLogFooter {

 public:
  // Use this constructor when you plan to write out the footer using
  // EncodeTo(). Never use this constructor with DecodeFrom().
  BlobLogFooter();

  // footer size = 4 byte magic number
  // 8 bytes count
  // 4, 4 - ttl range
  // 8, 8 - sn range
  // 8, 8 - ts range
  // = 56
  static const size_t kFooterSize = 4 + 4 + 8 + (4 * 2) + (8 * 2) + (8 * 2);

 
 private:
  uint32_t magic_number_ = 0;
  uint64_t blob_count_ = 0;     // 有多少记录数

  std::unique_ptr<ttlrange_t> ttl_range_; // 实际 ttl 范围区间
  std::unique_ptr<tsrange_t> ts_range_;   // 实际记录的保存时间戳的范围区间
  snrange_t sn_range_;

};

```


#### BlobRecorder

```cpp
class BlobLogRecord {
  friend class Reader;

 private:
  // this might not be set.
  uint32_t checksum_;     // value 的 checksum
  uint32_t header_cksum_;
  uint32_t key_size_;
  uint64_t blob_size_;
  uint64_t time_val_;
  uint32_t ttl_val_;
  SequenceNumber sn_;
  uint32_t footer_cksum_; // header 的 checksum
  char type_;
  char subtype_;
  Slice key_;
  Slice blob_;
  std::string key_buffer_;
  std::string blob_buffer_;

 public:
  // Header is
  // Key Length ( 4 bytes ),
  // Blob Length ( 8 bytes), timestamp/ttl (8 bytes),
  // type (1 byte), subtype (1 byte)
  // header checksum (4 bytes), blob checksum (4 bytes),
  // = 34
  static const size_t kHeaderSize = 4 + 4 + 4 + 8 + 4 + 8 + 1 + 1;

  static const size_t kFooterSize = 8 + 4;
};

```


#### BlobHandle

```cpp
// BlobHandle is a pointer to the blob that is stored in the LSM
class BlobHandle {
 public:
  BlobHandle()
      : file_number_(std::numeric_limits<uint64_t>::max()),
        offset_(std::numeric_limits<uint64_t>::max()),
        size_(std::numeric_limits<uint64_t>::max()),
        compression_(kNoCompression) {}
 private:
  uint64_t file_number_;
  uint64_t offset_;     // 记录在文件中的偏移位置
  uint64_t size_;       // 记录的长度
  CompressionType compression_;  // 压缩类型
};
```

### GET、PUT、DELETE

#### GET

1. LSM Tree 中获取到 value
1. 从 value 中解析出 BlobHandler
1. 根据 filenumber 查找 BlobFile
1. 通过 `RandomAccessFileReader` 读取到数据
1. 做各种数据校验判断：大小、crc32校验、
1. 如果需要，会解压数据
1. 如果需要序列号，则要校验 Recoder 的 footer

#### PUT

PUT --> PutWithTTL --> PutUntil

1. 根据超时时间选择保存到的 blob file
  1. 如果没有超时时间就轮询的保存到 4 个常驻的 Blob 文件中(*动态增长，如果不足会创建*)
  1. 如果是有超时时间限制，优先查询是否有超时时间符合的文件，如果没有则创建新的文件，每个文件的超时时间范围可以通过参数配置，默认是10minutes
1. 压缩 value
1. 构造 BlobLogRecorder 的 Header
1. 保存数据到 blobFile 中，如果失败了，则直接存放于 LSM Tree 中
1. 保存 KV 映射关系到 LSM Tree 中，**不过这里 LSM 中的数据没有超时？好像是通过 Value GC 触发删除数据的 GCFileAndUpdateLSM **
1. 更新 BlobFile 的 sn（**疑惑：**这里 sn 是作为 recorder 的 footer 的，但是写 head、value 与这个 footer 整个范围内没有加锁，中间有可能会被其他线程写入数据啊）
1. 如果有超时时间，就要尝试扩展 BlobFile 的超时时间范围

#### DELETE

delete 会和后面的 GC 想联系起来

1. 先删除 LSM Tree 中的记录
1. 然后将删除行为打包成 delete_packet_t， 放在一个 mpsc 的队列中
1. 后台线程会定时的调用 EvictDeletions 方法删除那些无效的数据
1. 删除和 cf 相关，这段不清楚，先跳过
1. 中间各种验证这个删除队列中的数据是否合法，如果合法，则通过 MarkBlobDeleted 标记数据删除
1. 然后通过 FindFileAndEvictABlob 方案，使BlobFile 的 deleted_count_ 增加，并且删除的 size 增加 **但是没有看到 deleted\_count\_ 是如何被持久化的**
1. 数据最终的删除还是依赖于 GC


### GC

GC 主要是用来删除数据。根据上述的流程，可以看到。有两种情况会导致数据无效，但是还是会保存在文件中：

1. 数据更新了，更新只会在 BlobFile 中增加新的记录旧的数据不会改变
1. 数据被应用层删除了，BlobFile 的数据也不会改写，仅仅会修改 BlobFile 的元数据信息

#### Key compaction 处理

数据更新会如何通知 BlobFile 删除就的数据呢？
BlobDbImpl 实现的时候，监听了 LST 的 OnCompaction 事件， 如果发现合并的数据不是最新的，那么就会根据 value 处理。其过程是和调用`Delete` 类似

#### Value 过期处理

如果数据本省带有 TTL ，那么有可能会触发 Key 的 compaction。

BlobDBImpl 默认每分钟会通过 `RunGC` 方法，去删除失效的数据。
删除数据是以整个 BlobFile 为单位的，不可能删除其中的某个 BlobLogRecorder 的。（*理解有误，GC 的时候会使用复制删除算法*）

1. 选择部分 BlobFile 进行 GC 处理，为了限制内存及 cpu 的使用率
  1. 选择是根据 BlobFile 中的 gc_epoch_ 进行判断的
  1. 根据 BlobFile 的状态：整个文件的 TTL 超时、每次文件第一次打开需要处理、删除的大小占比达到配置的阈值
1. 遍历以上文件，调用 GCFileAndUpdateLSM 方法
  1. 如果 BlobFile 是第一次 load， 会根据 LSM tree 的状态更新 BlogFile 的 delete_
  1. 如果不是 第一次 load， 则会将有效的数据拷贝到新的文件中，并且写入一个新的 Key 到 LSM 中，然后将整个 BlobFile 废弃掉
1. 每隔10s，后台程序会触发一次删除无效的文件


## 存在的问题

1. Blog Value 没有任何 cache
2. 遍历时会有多次 IO 访问
3. 可以做的更灵活些，如果 value 小于制定大小，则直接放在 LSM 中即可。


