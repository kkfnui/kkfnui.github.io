---
title: 【翻译】Column Families
tags: RocksDB 翻译 今日头条
category: rocksdb
---

原文: [Column Families](https://github.com/facebook/rocksdb/wiki/Column-Families)




昨天在看今日头条分享([今日头条User Profile系统架构实践](https://mp.weixin.qq.com/s/eQQ-JhzY2GCg-oP7sGnvKw))里面就包含了使用 Column Families 做逻辑分区, 减少写放大问题。
提升读写速度。


<!--more-->


## Introduction

在RocksDB 3.0中，我们添加了对Column Families的支持。

RocksDB中的每个键值对都与一个Column Family相关联。 如果没有指定Column Family，则键值对与Column Family “default” 关联。

Column Families 提供了一种逻辑分区数据库的方式。 大家会关注的一些属性：

- 支持多个Column Family的原子写入。 这意味着你可以原子地执行Write（{cf1，key1，value1}，{cf2，key2，value2}）。
- 多个Column Family的数据库视图是一致的
- 能够独立配置不同的Column系列。
- 即时添加新的Column Families并将其删除。 这两个操作都相当快。


## API

### Backward compatibility

尽管我们需要进行大量的API更改以支持Column Families，
但是我们仍然支持旧的API。
您不需要进行任何更改，将应用程序升级到RocksDB 3.0。
通过旧API插入的所有键值对都插入列族“默认”。
升级后降级也是如此。
如果您不使用多个 Column Family，我们不会更改任何磁盘格式，
这意味着您可以安全地回滚到RocksDB 2.8。
这对我们公司内部的使用者非常重要。


### Example usage
[column_families_example.cc](https://github.com/facebook/rocksdb/blob/master/examples/column_families_example.cc)


### Reference

> Options, ColumnFamilyOptions, DBOptions

定义都在 include/rocksdb/options.h, Options结构定义了RocksDB的行为和执行方式。
 之前，每个选项都在一个Options结构中定义。
 讲了来，ColumnFamilyOptions中将定义特定于Column Family 的选项，
 并且将在DBOptions中定义作用于于整个RocksDB实例的选项。
 Options 结构继承了 ColumnFamilyOptions 和 DBOptions，
 这意味着您仍然可以使用它来定义具有单个（default）列族的DB实例的所有选项。

> ColumnFamilyHandle

Column Families 被 ColumnFamilyHandle 引用、代理。 就像是文件句柄一样。
在删除数据库指针前,需要将所有 ColumnFamilyHandle 删除。
及时 ColumnFamilyHandle 指向一个被删除的 ColumnFamily, 我们还是可以继续使用它。
ColumnFamily 关联的数据会在所有引用它的 ColumnFamilyHandle 都被删除之后才会失效。

> `DB::Open(const DBOptions& db_options, const std::string& name, const std::vector<ColumnFamilyDescriptor>& column_families, std::vector<ColumnFamilyHandle*>* handles, DB** dbptr);`

当使用读写方式打开一个数据库的时候,需要指明数据库中当前存在的所有的 Column Families。
如果不是这样, DB::Open 调用将会返回Status::InvalidArgument()。
使用 vector 容器保存多个 ColumnFamilyDescriptors。
ColumnFamilyDescriptor 结构中有且仅有两个字段, Column Family name 和 ColumnFamilyOptions。
Open 返回将会返回调用状态,同时也会返回指向 ColumnFamilyHandle 的指针列表。

> `DB::OpenForReadOnly(const DBOptions& db_options, const std::string& name, const std::vector<ColumnFamilyDescriptor>& column_families, std::vector<ColumnFamilyHandle*>* handles, DB** dbptr, bool error_if_log_file_exist = false)`

该调用和 DB::Open 相似, 但是数据库是只读模式的。
另外有一个很大的不同, 在只读模式下不需要指定所有的 Column Families——你可以指定一个子集。

> `DB::ListColumnFamilies(const DBOptions& db_options, const std::string& name, std::vector<std::string>* column_families)`

`ListColumnFamilies` is a static function that returns the list of all column families currently present in the DB.

> `DB::CreateColumnFamily(const ColumnFamilyOptions& options, const std::string& column_family_name, ColumnFamilyHandle** handle)`

Creates a Column Family specified with option and a name and returns ColumnFamilyHandle through an argument.

> `DropColumnFamily(ColumnFamilyHandle* column_family)`

Drop the column family specified by ColumnFamilyHandle.
Note that the actual data is not deleted until the client calls delete column_family;.
You can still continue using the column family if you have outstanding ColumnFamilyHandle pointer.

> `DB::NewIterators(const ReadOptions& options, const std::vector<ColumnFamilyHandle*>& column_families, std::vector<Iterator*>* iterators)`

This is the new call, which enables you to create iterators on multiple Column Families that have consistent view of the database.


#### WriteBatch

To execute multiple writes atomically, you need to build a WriteBatch.
All WriteBatch API calls now also take ColumnFamilyHandle* to specify the Column Family you want to write to.


#### All other API calls

All other API calls have a new argument ColumnFamilyHandle*, through which you can specify the Column Family.

## Implementation

Column Family 背后主要的思想是它们共享 write-ahead log, 同时又不共享 memtables 和 table files。
 通过共享 WAL, 就可以保证操作的原子性。
 通过隔离 memtables 和 table files, 就可以独立配置不同的 Column Family,并且可以快速删除他们。

 Every time a single Column Family is flushed, we create a new WAL (write-ahead log).
  All new writes to all Column Families go to the new WAL.
  However, we still can't delete the old WAL since it contains live data from other Column Families.
  We can delete the old WAL only when all Column Families have been flushed and all data contained in that WAL persisted in table files.
  This created some interesting implementation details and will create interesting tuning requirements.
  Make sure to tune your RocksDB such that all column families are regularly flushed.
  Also, take a look at Options::max_total_wal_size, which can be configured such that stale column families are automatically flushed.

