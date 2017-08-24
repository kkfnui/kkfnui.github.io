---
title: SSDB SortedSet 读写操作源码分析
tags: 源码分析 SSDB leveldb
category: 工作
---

接着 `zclear` 导致性能慢的问题。今天着重的看了下 `SortedSet`的相关操作。

先记下我看代码得到的几个结论吧：

1. SSDB 本身没有做缓存，内存缓存是 `leveldb` 实现的
2. `Sorted set` 的存储是拆分成 KV 保存到到 leveldb 中的
3. zrrange 性能会比 zrange 低，会多一步操作 `SkipToLast`

<!--more-->

## SSDB 的缓存

没有深入了解 SSDB 的时候，以为 `leveldb` 主要做的是文件读写相关的工作,
 缓存部分则是在 SSDB 实现的。

从 SSDB 代码看来， 无论是读或者是写都是没有 Cache 相关的实现：

## get 命令的实现

```cpp
int SSDBImpl::get(const Bytes &key, std::string *val){
	std::string buf = encode_kv_key(key);

	leveldb::Status s = ldb->Get(leveldb::ReadOptions(), buf, val);
	if(s.IsNotFound()){
		return 0;
	}
	if(!s.ok()){
		log_error("get error: %s", s.ToString().c_str());
		return -1;
	}
	return 1;
}
```

第4行代码，直接就是调用的 leveldb 的接口，获取到 value。

## set 命令实现

```cpp
int SSDBImpl::set(const Bytes &key, const Bytes &val, char log_type){
	if(key.empty()){
		log_error("empty key!");
		//return -1;
		return 0;
	}
	Transaction trans(binlogs);

	std::string buf = encode_kv_key(key);
	binlogs->Put(buf, slice(val));
	binlogs->add_log(log_type, BinlogCommand::KSET, buf);
	leveldb::Status s = binlogs->commit();
	if(!s.ok()){
		log_error("set error: %s", s.ToString().c_str());
		return -1;
	}
	return 1;
}
```

`set`的命令相对复杂些。调用了`binlog`，内部实现还是转掉了 `leveldb`。

为什么不直接是 `ldb` 对象呢？

1. 保证修改操作的事物性
2. 批量写数据和log，提升性能



## zset 的实现


zset 代码

```cpp
int SSDBImpl::zset(const Bytes &name, const Bytes &key, const Bytes &score, char log_type){
	Transaction trans(binlogs); // zset_one 里面有多个操作，保证操作的事物性

	int ret = zset_one(this, name, key, score, log_type);
	if(ret >= 0){
		if(ret > 0){
			if(incr_zsize(this, name, ret) == -1){
				return -1;
			}
		}
		leveldb::Status s = binlogs->commit();
		if(!s.ok()){
			log_error("zset error: %s", s.ToString().c_str());
			return -1;
		}
	}
	return ret;
}
```

1. 添加事务保证操作的完整性
2. 调用 `zset_one`, 正式保存相关数据
3. 成功后累加 `Sorted set`的长度
4. 统一提交数据和日志到`leveldb`

zset_one 代码

```
static int zset_one(SSDBImpl *ssdb, const Bytes &name, const Bytes &key, const Bytes &score, char log_type){
	if(name.empty() || key.empty()){
		log_error("empty name or key!");
		return 0;
		//return -1;
	}
	if(name.size() > SSDB_KEY_LEN_MAX ){
		log_error("name too long!");
		return -1;
	}
	if(key.size() > SSDB_KEY_LEN_MAX){
		log_error("key too long!");
		return -1;
	}
	std::string new_score = filter_score(score);
	std::string old_score;
	int found = ssdb->zget(name, key, &old_score);
	if(found == 0 || old_score != new_score){
		std::string k0, k1, k2;

		if(found){
			// delete zscore key
			k1 = encode_zscore_key(name, key, old_score);
			ssdb->binlogs->Delete(k1);
		}

		// add zscore key
		k2 = encode_zscore_key(name, key, new_score);
		ssdb->binlogs->Put(k2, "");

		// update zset
		k0 = encode_zset_key(name, key);
		ssdb->binlogs->Put(k0, new_score);
		ssdb->binlogs->add_log(log_type, BinlogCommand::ZSET, k0);

		return found? 0 : 1;
	}
	return 0;
}
```

1. 参数合法性校验
2. 获取旧的数据，如果不存在或者分值不等继续下面的操作
3. 如果有旧数据，那么删除旧的分支的key
4. 保存新的分值的key，后面zcan会需要根据score排序，需要单独建立“索引”。
5. 保存新的score

### 不同数据类型的key是如何隔离的呢？

不同数据类型，保存到`levledb`时，都会根据类型调用不同的 `encode_{type}_key`方法。此类方法中第一个拼接的字节就是数据类型，那么同类型的key在高位就不相等。按`leveldb`的小端存储以及字符排序，则不同类型的key会有明显的界限。

SSDB数据类型：

```cpp
class DataType{
public:
	static const char SYNCLOG	= 1;
	static const char KV		= 'k';
	static const char HASH		= 'h'; // hashmap(sorted by key)
	static const char HSIZE		= 'H';
	static const char ZSET		= 's'; // key => score
	static const char ZSCORE	= 'z'; // key|score => ""
	static const char ZSIZE		= 'Z';
	static const char QUEUE		= 'q';
	static const char QSIZE		= 'Q';
	static const char MIN_PREFIX = HASH;
	static const char MAX_PREFIX = ZSET;
};
```

## zcan的实现

直接看代码吧

```cpp
ZIterator* SSDBImpl::zscan(const Bytes &name, const Bytes &key,
		const Bytes &score_start, const Bytes &score_end, uint64_t limit)
{
	std::string score;
	// if only key is specified, load its value
	if(!key.empty() && score_start.empty()){
		this->zget(name, key, &score);
	}else{
		score = score_start.String();
	}
	return ziterator(this, name, key, score, score_end, limit, Iterator::FORWARD);
}
```

这一层是对参数进行处理，主要实现在是￡ `ziterator` 方法实现。仅看其中顺序读的分支代码：

```cpp
if(direction == Iterator::FORWARD){
		std::string start, end;
		if(score_start.empty()){
			start = encode_zscore_key(name, key_start, SSDB_SCORE_MIN);
		}else{
			start = encode_zscore_key(name, key_start, score_start);
		}
		if(score_end.empty()){
			end = encode_zscore_key(name, "\xff", SSDB_SCORE_MAX);
		}else{
			end = encode_zscore_key(name, "\xff", score_end);
		}
		return new ZIterator(ssdb->iterator(start, end, limit), name);
	}
```

`leveldb`对KV的存储是按Key有序存储的，这里就构建了start和end的Key。其中key是使用`encode_zscore_key`方法构建的，也就是扫描时时安装分值有序返回。但是分值的Key对应的Value都是一样的，而这个方法需要返回的是: key-score 的列表。看到`ZIterator::next` 会调用 `decode_zscore_key`方法获取到key-score。

### zset方法中的 `encode_zset_key`有什么用?

在`zcan` 和 `zrange`方法中，对列表排序都是使用的key+score，那么仅仅保存 key 的数据是干什么用的呢？

搜索相关代码，发现 `zfix` 中会使用。版本更新文档中找到：

> Provide zfix command to repair broken zset(2015-12-02)

今天就看到这里了，不再多看了。

## leveldb相关

后续了解 leveldb 可以用到。

- [LSM Tree](http://nosqlsummer.org/paper/lsm-tree)
- [leveldb源码分析](http://blog.csdn.net/sparkliang/article/category/1342001)
- [leveldb研究](http://www.blogjava.net/sandy/category/51018.html)
- [leveldb分析集合](http://dirtysalt.info/leveldb.html)
- [SSTable and Log Structured Storage: LevelDB](https://www.igvita.com/2012/02/06/sstable-and-log-structured-storage-leveldb/)







